# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Implementation-phase monorepo for Little Buddy, an AI companion toy for children aged 4 to 8. The toy is an ESP32-S3 that streams audio to this backend; parents use a web dashboard. `backend/` is the Node.js API (built); `frontend/` is a Vite + React **dev test console** (parent, toy simulator and admin lanes), not the product dashboard, which does not exist yet.

The product spec and invariants live outside this repo in `D:\Intern\LittleBuddy\backend_intern_onboarding.md` (the prototype repo). Its `docs/` tree is referenced there but does not exist anywhere; the device wire protocol was designed here in `backend/docs/device_auth.md`. Decisions already made with the user, do not re-ask: factory secret + printed claim code for pairing; plain JS ESM, no TypeScript, no ORM; real Postgres + Redis via Docker, no in-memory fallbacks.

## Commands

All from `backend/` unless noted. Docker Desktop must be running.

```
docker compose up -d                 # from repo root: Postgres (pgvector) + Redis
npm install
copy .env.example .env               # PowerShell; cp on bash
npm run migrate                      # forward-only SQL migrations in store/migrations/
npm run dev                          # node --watch, http://localhost:3000/healthz
npm test                             # pretest checks Docker, then all tests serially
npm run test:unit                    # unit tests only, no Docker needed
npm run seed                         # demo family + one claimed and one unclaimed toy
npm run provision -- --label L --count N --hardware-rev R   # factory manifest to manifests/
npm run e2e                          # simulated toy through its whole life against the dev DB
```

Run a single test file (the env preload is what `npm test` uses):

```
node --import ./tests/helpers/env.js --test tests/integration/device_auth.test.js
```

Integration tests need the containers; they use the `littlebuddy_test` database and Redis db 1, and `tests/helpers/db.js` refuses any `DATABASE_URL` whose name does not end in `_test`. Tests must run with `--test-concurrency=1` (they share one database and truncate it per file).

Port 5432 clash: the prototype's container `littlebuddy-pgvector` (from `D:\Intern\LittleBuddy\app-b`) binds the same port. `docker stop littlebuddy-pgvector`, then `docker compose up -d --force-recreate postgres` (a container created during the clash has no host port mapping until recreated).

## House rules (from the team spec, enforced in review)

- No em dashes in any text: code, comments, docs, commit messages. Use a colon, comma or parentheses.
- Comments explain why, not what.
- Code and comments in English; READMEs in Vietnamese. `docs/` may be English.
- Logs carry ids only: never a child's words, an email, a secret, signature, nonce or claim code. `lib/log.js` redacts a denylist as a guardrail, not as permission.
- `/v1/*` (device, HMAC) and `/api/*` (parent, JWT) never mix. `/admin/*` is operator-only.
- Redis is disposable, TTL'd state only; Postgres is the durable record.
- Production refuses to boot on default secrets, a placeholder `DEVICE_KEK`, or `DEVICE_AUTH=off` (see `config.js`).

## Architecture

**Layering.** `routes/*` validate input and call either `devices/registry.js` or `auth/service.js`; those two hold every business rule. `store/*` modules are SQL only and take the queryable (pool or transaction client) as their first argument, so transaction membership is visible at the call site. `withTransaction` in `store/db.js` wraps a callback; a throw inside it rolls back, which is why `auth/service.js#refresh` returns an error object from the callback instead of throwing (the replay branch must commit its revocation).

**Device auth is one verifier, two callers.** `devices/signing.js` is the pure half (canonical string, HMAC, nonce) shared by the server, `devices/sim_client.js`, and the reference vectors in `tests/fixtures/hmac_vectors.json`. `devices/hmac_auth.js#verifyDeviceRequest` runs the checks cheap-first (shape, clock window, Redis failure counters, DB row, signature against current and grace-period secret, nonce `SET NX EX`, status) and returns a result object. `middleware/device_auth.js` adapts it for Express; `ws/stream.js` adapts it for the WebSocket upgrade, taking the values from the query string. Device rejections always carry `server_time` so a drifted toy can resync. Devices fail closed when Redis is down; parent rate limits fail open.

**Body bytes matter.** The signature covers the exact request bytes, so `routes/device.js` mounts its own `express.json({ verify: captureRawBody })`; there is deliberately no global JSON parser in `app.js`. Each router mounts its own.

**Lifecycle lives in the registry.** `provisioned -> active <-> disabled -> revoked` (terminal). `devices/registry.js` enforces the transition table, writes a `device_events` row per transition, and fires `setDeviceBlockedHook` on disable/revoke/unpair **after the transaction commits** (the hook closes sockets and abandons turns, which must not happen for a rolled-back change); `ws/stream.js` registers that hook at boot to abandon the in-flight turn and close the device's open sockets with code 4003. The stream upgrade refuses only revoked devices; every other status gets a socket and a per-turn answer from the gate. A parent cannot re-enable an admin disable; unpair restores `provisioned` so the printed claim code works again.

**Secrets at rest.** `devices/secret_box.js` derives two HKDF subkeys from `DEVICE_KEK`: AES-256-GCM sealing of device secrets (AAD = device id) and the pepper for claim-code hashes. `registry.getForAuth` is the only decrypting path. `provisionBatch` generates everything in memory and accepts a `beforeCommit(manifest)` hook; `scripts/provision_batch.js` writes and fsyncs the manifest there, so a failed write rolls the batch back.

**Credits and turns.** Credits belong to the family; `credit_ledger` is append-only and the balance is `SUM(delta)`. `gate/ask_gate.js` is pure and decides a button press from `{device, balance, inflight}`; `turns/service.js` admits a turn under `families.lockForUpdate` with the `accepted` turn row as the reservation (`balance - inflight >= 1`), so two toys cannot both be admitted on the last credit and nothing is written to the ledger at start. `completeTurn` marks the row completed (status-guarded) and inserts the debit in the same transaction, idempotent via the partial unique index on `turn_id`. `ws/turns.js` is the protocol adapter: answer is sent before the debit, a second `turn_start` mid-turn is a protocol error, cancel/timeout/socket close/kill switch abandon without charging. Denials never carry a reason; `disabled` and `no_credits` are the same object (tested). `not_claimed` presses write no turn row. Only `PROVIDER_MODE=mock` exists.

**Buying credits (demo stage).** `billing/purchases.js`: `credit_packs` is reference data seeded by migration 004 (the test reset keeps it); a purchase snapshots credits and price and moves `pending -> paid | failed` only via status-guarded UPDATEs. `demo-pay` stands in for the provider webhook: marking paid and inserting the `purchase` ledger row (linked by `purchase_id`, unique partial index) share one transaction, so a purchase adds credits at most once. `PAYMENT_PROVIDER=demo` is refused in production; production defaults to `disabled`.

**Parent auth.** scrypt from `node:crypto` (params stored in the hash string), 15-minute HS256 JWT carrying `fam`, opaque refresh tokens stored as sha256 with a `replaced_by` chain; presenting a rotated token revokes every session for that parent. Login verifies against `DUMMY_HASH` on unknown emails so timing and body are identical.

**Config.** `config.js` exports a pure `loadConfig(env)` plus a frozen default; nothing else reads `process.env`. Tests set env in `tests/helpers/env.js` (preloaded via `--import`), so a test that needs a different config value must set `process.env` before its first import of `config.js` (see `tests/integration/device_auth_off.test.js`).

## Frontend (dev test console)

From `frontend/`: `npm install`, `npm run dev` (http://localhost:5173, needs the backend on :3000), `npm test` (signer vectors, no Docker), `npm run build`. Plain JS + JSX, deps react/react-dom, devDeps vite and @vitejs/plugin-react only.

- The backend has no CORS middleware; `vite.config.js` proxies `/api`, `/admin`, `/healthz` and `/v1` (with `ws: true` for the stream upgrade) same-origin. Never add CORS to the backend for the console.
- `frontend/src/signing.js` must stay byte-compatible with `backend/devices/signing.js`; both are tested against `backend/tests/fixtures/hmac_vectors.json`. The signer takes `bodyText` (a string) and the same string is what fetch sends, so the hashed bytes are the sent bytes.
- The toy simulator hook (`src/useToy.js`) is mounted in `App.jsx`, not in the Toy tab, so it keeps heartbeating while the tester acts from another lane. Tabs hide with `hidden`, never unmount.
- Tokens, the admin token and pasted toy credentials live in sessionStorage (`src/session.js`); a reissued claim code is shown once and redacted from the request log.

## Tooling notes

- Bash heredocs for multi-file JS writes failed to parse once in this environment; the Write tool is reliable for source files.
- Parallel Bash calls share the working directory; use absolute paths or `cd` at the start of each command.
