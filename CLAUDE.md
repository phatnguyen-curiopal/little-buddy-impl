# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Implementation-phase monorepo for Little Buddy, an AI companion toy for children aged 4 to 8. The toy is an ESP32-S3 that streams audio to this backend; parents use a web dashboard. `backend/` is the Node.js API (built); `brain/` is Buddy's **conversation service** (STT, memory, prompt, LLM, TTS; restructured from the prototype `D:\Intern\LittleBuddy\app-b`, which stays frozen as the reference); `frontend/` is the **parent-facing website** (marketing page at `/`, dashboard at `/app`, where the browser can also play the toy). It replaced an earlier dev test console of the same name, so there is no admin UI and `/admin/*` is driven with curl or the backend scripts.

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

The whole demo runs as three processes: brain (`brain/`, `npm run dev`, 127.0.0.1:8080), backend (`npm run dev`, :3000, `PROVIDER_MODE=brain`) and frontend (`frontend/`, `npm run dev`, :5174). `npm run dev` at the repo root (`scripts/dev.js`, no dependencies) starts all three with prefixed logs, refuses to start if a port is taken, and stops all of them when one exits or on Ctrl+C. `BRAIN_TOKEN` must be the same in `backend/.env` and `brain/.env`. `npm run e2e` always forces `PROVIDER_MODE=mock`, and tests never call the brain (they use `tests/helpers/brain_stub.js`).

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

**Secrets at rest.** `devices/secret_box.js` derives two HKDF subkeys from `DEVICE_KEK`: AES-256-GCM sealing of device secrets (AAD = device id) and the pepper for claim-code hashes. Exactly two paths decrypt: `registry.getForAuth` (verification) and `registry.revealSecret` (the web toy). The web toy never gets the factory secret: `secret_box.webToySecret` derives an HKDF key from it, the family and `claimed_at`, which `hmac_auth` accepts only while that ownership lasts and only after a reveal (`devices.secret_revealed_at`), so unpair or any new claim kills every copy a browser kept while the physical toy keeps working. `provisionBatch` generates everything in memory and accepts a `beforeCommit(manifest)` hook; `scripts/provision_batch.js` writes and fsyncs the manifest there, so a failed write rolls the batch back.

**Credits and turns.** Credits belong to the family; `credit_ledger` is append-only and the balance is `SUM(delta)`. `gate/ask_gate.js` is pure and decides a button press from `{device, balance, inflight}`; `turns/service.js` admits a turn under `families.lockForUpdate` with the `accepted` turn row as the reservation (`balance - inflight >= 1`), so two toys cannot both be admitted on the last credit and nothing is written to the ledger at start. `completeTurn` marks the row completed (status-guarded) and inserts the debit in the same transaction, idempotent via the partial unique index on `turn_id`. `ws/turns.js` is the protocol adapter: answer is sent before the debit, a second `turn_start` mid-turn is a protocol error, cancel/timeout/socket close/kill switch abandon without charging. Denials never carry a reason; `disabled` and `no_credits` are the same object (tested). `not_claimed` presses write no turn row. `PROVIDER_MODE` is `mock | brain` (`pipeline/index.js`); `pipeline/brain.js` sends the turn to the brain with the profile, child and settings.

**Turn protocol additions** (`docs/device_auth.md`, `brain/docs/contract.md`). Binary audio is buffered per turn (at most `TURN_MAX_SEC * 32000` bytes, 64 KB per message, only after `turn_accepted`); `turn_end` may carry `text` for a typed turn; `answer` carries `heard`; audio goes down as `audio`, binary PCM16 chunks, `audio_end`, all before the debit and `turn_done`. A brain `no_speech` result is answered and then abandoned (no charge). `conversation_new` sets `conversations.ended_at`; an open conversation also ends when the toy's child changes. The turn carries an `AbortController`: socket close and the kill switch abort the brain call before the `closing` guard, and an aborted turn is abandoned, never failed. The brain call's deadline keeps it inside `turnStaleSec`. In brain mode `TURN_MAX_SEC` is capped at 196 (the brain's 6 MB body limit).

**Buying credits (demo stage).** `billing/purchases.js`: `credit_packs` is reference data seeded by migration 004 (the test reset keeps it); a purchase snapshots credits and price and moves `pending -> paid | failed` only via status-guarded UPDATEs. `demo-pay` stands in for the provider webhook: marking paid and inserting the `purchase` ledger row (linked by `purchase_id`, unique partial index) share one transaction, so a purchase adds credits at most once. `PAYMENT_PROVIDER=demo` is refused in production; production defaults to `disabled`.

**Buddy profiles.** `buddy_profiles` (migrations 005 to 008) holds each toy's name, role (`friend | daddy | mommy | teacher`), one of 16 personality codes, its `design` (how the website draws it: `orbit | volt | glim`, default `orbit`, not nullable, web only: the brain never gets it), and its settings: conversation `language` (`vi | en`), `voice_id` (FK to the `voices` reference table; null means the default voice of the toy's language), `learn` (default false, the prototype's `MEMORY_WRITE=0`) and `mood_pin` (0..100, null means automatic). Updates use present-flags, so `null` clears and 0 is kept; every claim resets the design and the settings too. The brain owns every prompt text (pronouns, vibes, backstories, both languages); `personalization/roles.js` holds codes and labels only. It is keyed by device with no family column: every claim upserts it (given values or the Buddy / friend / ENFP defaults), so a toy that changes owner never keeps the old profile. A re-claim by the family that already owns the toy (active or disabled) returns it unchanged with 200 and writes nothing, so a retry after a lost response is not "invalid code"; every other family still gets the identical 404. `personalities` and `voices` are reference data kept by the test reset (`personalities.vibe` is only a copy; the brain's is the one in the prompt). `validateProfile` throws one 400 listing every bad field. Each voice speaks one language (`voices.language`, migration 008 seeded vi: Phan Anh (default), Cam Hong; en: Little Dude II (default), Ziggy, The Elf) with one default per language; `registry` rejects a voice of the other language with a 400 (claim and PATCH), and a PATCH that switches language without a voice clears a stale one. `voices.resolve(db, voiceId, language)` never hands the brain a voice of the other language (it falls back to that language's default). Each voice has a sample, Buddy's greeting, at `frontend/public/voice-samples/<id>.wav`, recorded by `npm run voice-samples -- <id>:<lang>` in `brain/` (the same `createTts` call as a turn); a voice added with `POST /admin/voices` needs that run too, or the picker shows "no sample yet". The quiz (`frontend/src/lib/personality.js`) is 12 questions, 3 per axis, about the Buddy the parent wants.

**Parent auth.** scrypt from `node:crypto` (params stored in the hash string), 15-minute HS256 JWT carrying `fam`, opaque refresh tokens stored as sha256 with a `replaced_by` chain; presenting a rotated token revokes every session for that parent. Login verifies against `DUMMY_HASH` on unknown emails so timing and body are identical.

**Config.** `config.js` exports a pure `loadConfig(env)` plus a frozen default; nothing else reads `process.env`. Tests set env in `tests/helpers/env.js` (preloaded via `--import`), so a test that needs a different config value must set `process.env` before its first import of `config.js` (see `tests/integration/device_auth_off.test.js`).

## Brain (conversation service)

From `brain/`: `npm install`, `npm run migrate` (creates `littlebuddy_brain` and the `vector` extension if missing), `npm run seed:botlife` (backstories and a diary dated relative to today, vi + en), `npm run dev` (127.0.0.1:8080), `npm test` (uses `littlebuddy_brain_test`; a stub server stands in for OpenAI, Anthropic, Qwen and ElevenLabs via the `*_BASE_URL` seams), `npm run import:poc -- --source <pg url> --child <uuid>` (the prototype's memories, names, facts and summaries into one child; the steps to reach the prototype DB are in `brain/README.md`). The wire contract with the backend is `brain/docs/contract.md`; change it first.

- Batch only: ElevenLabs STT (scribe_v2) and TTS. No streaming, speculative, Vbee, local models or director. Embeddings are fixed at `text-embedding-3-large`, 3072 dims (a sequential scan; pgvector's HNSW stops at 2000).
- `llm/providers/{openai,anthropic,qwen}.js` are strategies behind `llm/index.js`, picked by `LLM_PROVIDER`, all returning `LlmResult`. The extractors and `fixNames` always use OpenAI, so `OPENAI_API_KEY` is required whenever memory is on.
- `turn/run_turn.js` only orchestrates: names, STT, retrieval (each leg adopted as it lands, so a `MEMORY_WAIT_MS` timeout keeps partial blocks), prompt, LLM, emotion tag, TTS, then history and learning. One `AbortController` per turn; a closed request writes nothing.
- Every child-data table is keyed by `subject` (`child:<uuid>`, or `device:<device>:<family>` for a toy with no child); there are no process-global caches of child data. Short-term history is in RAM only (30 min TTL). Learning runs only with `learn` on, serialized per subject.
- Prompt text lives in `persona/text/{vi,en}.js` (vi verbatim from the prototype, em dashes removed). The reply must start with an emotion tag, which is parsed and stripped; the tag rule is appended even under an `LLM_SYSTEM_PROMPT` override, and a missing tag is logged. Vietnamese enum words from the extractors map to English codes in `memory/enums.js`.
- The mood day key is Asia/Ho_Chi_Minh. A pinned mood writes nothing; moods persist even with learning off (they are Buddy's, not the child's).
- `LLM_LOG_FILE` and `STT_DUMP_WAV` hold a child's words and are refused in production.

## Frontend (parent website)

From `frontend/`: `npm install`, `npm run dev` (http://localhost:5174, needs the backend on :3000), `npm test` (pure modules only, no Docker), `npm run build`. Plain JS + JSX; deps react/react-dom only, no router, animation or UI library.

- Routes live in `src/lib/routes.js` (pure: `matchRoute`, `guard`, `safeNext`); `src/lib/router.js` is a small History API router on top. `/app/*` needs a session; `safeNext` only accepts `/app` paths after login.
- `src/lib/api.js` is the only place that calls the backend: access token in memory, refresh token in localStorage, one shared in-flight refresh so a rotated token is never presented twice (the backend treats that as a leak and ends every session).
- Every string is in `src/i18n/vi.js` and `en.js`; `tests/i18n.test.js` fails on missing keys, mismatched placeholders, em dashes, or a `t('key')` in the source that neither dictionary has. `translate` is in `lib/translate.js` (pure) so tests can import it; `lib/i18n.jsx` is the React provider.
- Buddy comes in three designs (`src/lib/designs.js`: Orbit, Volt, Glim), chosen per toy in its profile; anything drawn without a particular toy (logos, marketing page, auth, empty states) uses the default, `orbit`. `src/components/ToyShell.jsx` draws a whole toy in a design, `src/components/buddy/BuddyScreen.jsx` a face on its own inside an existing box (`.chip-screen`, `.tc-screen`, `.hero-screen`...), both through `buddy/BuddyFace.jsx`. The 14 emotions (`src/lib/emotions.js`, unknown values fall back to `neutral`) are CSS only, in `src/styles/buddy.css`: the design, expression and phase are classes (`bd--volt bd-e-happy bd-p-listening`), and eyes and mouths are 60-point `clip-path` polygons from `src/styles/buddy-shapes.css` (generated by `node scripts/buddy_shapes.js`; edit the script), so every expression morphs into the next. Every class and keyframe in that sheet is prefixed `bd-` because the CSS is global. Animations switch off under `prefers-reduced-motion`.
- The microphone is a toggle: one tap starts, the toy detects the end of speech (or a second tap) and sends `turn_end`. The hero toy in `src/components/Toy.jsx` simulates exactly that; do not reintroduce hold-to-talk wording.
- Adding a toy is a wizard, one screen per step: code, child (the claim happens here, with default profile, so a bad code surfaces before any profile work), name, look (the design picker: three live mini toys), role, personality (quiz one question per screen, or the 16-type grid), review, done. Review saves with one `PATCH /api/devices/:id/profile`. After the claim, closing asks first ("Làm tiếp" / "Lưu và đóng"); the toy stays claimed either way. The drawer edits the profile on one page. Cards show the profile name.
- `GET /api/credit-packs` is public (the marketing pricing section); every other `/api` route needs a parent token.
- The web toy: `/app/talk?toy=<id>` (nav hidden when `/api/me` says `web_toy: false`). `src/talk/` is a device client: it reveals the web credential once per page session (memory only), calls `/v1/time` before every connect, signs `/v1/stream` with `src/talk/signing.js`, sends no heartbeat (the physical toy's last-seen stays true), and runs the pure state machine in `machine.js`. `mic.js` is an AudioWorklet that low-passes to 16 kHz PCM16 frames; `vad.js` ends the turn after silence following speech. Mic and WebCrypto need a secure context (localhost or https). `vite.config.js` proxies `/v1` with `ws: true`. `ToyShell.jsx` is the toy body shared by the marketing hero, the Talk screen (drawn in the toy's own design, with `live` so the mic ring follows `--level`, and `dim` when asleep or offline) and the design picker. The drawer's profile editor also edits the design, language, voice, learning and the mood pin; its voice picker lists only the toy's language (`lib/toySettings.js#voicesFor`), plays each voice's sample through one shared `Audio`, and a language switch sends `voice_id: null` with it.
- `src/talk/signing.js` must stay byte-compatible with `backend/devices/signing.js`; `tests/signing.test.js` pins it to `backend/tests/fixtures/hmac_vectors.json`. The signer takes `bodyText` (a string) and the same string is what fetch sends, so the hashed bytes are the sent bytes.
- The backend has no CORS middleware; `vite.config.js` proxies `/api` and `/v1` same-origin. Never add CORS to the backend for the site.

## Deploy

`deploy/` ships the demo to https://little-buddy.curiopal.com on a shared production host that serves other sites: only ever add things there, never edit or restart what other sites use (`deploy/README.md`, in Vietnamese, has the layout and operations). A push to `main` deploys by itself: GitHub calls `/hooks/deploy`, `deploy/webhook.mjs` (unprivileged, `node --test deploy/webhook.test.mjs`) verifies the signature and only rewrites a trigger file, and a systemd path unit runs `deploy/auto_deploy.sh` as root (fetch `origin/main`, build the frontend in a Node 22 container, then `deploy/remote_deploy.sh`). `bash deploy/deploy.sh` from the repo root (Git Bash) is the manual path for an uncommitted tree; it ships the working tree minus gitignored files and pipes the same `remote_deploy.sh`, which builds the images (`backend/Dockerfile`, `brain/Dockerfile`), migrates both services, swaps the static site, reverts its own nginx file if `nginx -t` fails, and installs the webhook's files and units. The two paths share a lock. So whatever lands on `main` goes live: never push something that would not boot.

- The containers use host networking to reach the host's native Postgres 16 on 127.0.0.1 without touching its `listen_addresses` or `pg_hba`, and bind 127.0.0.1 themselves (the backend through `HOST`) because the host has no firewall. Its pgvector is 0.6: no `halfvec` or other later features in migrations.
- Production runs with `WEB_TOY=on`, `PAYMENT_PROVIDER=disabled` and `TRUST_PROXY=2` (Cloudflare, then nginx). nginx does not proxy `/admin`; it is called on the host.
- The backend pings every stream socket every 30 s (`KEEPALIVE_MS` in `ws/stream.js`): Cloudflare drops a WebSocket idle for 100 s, and the web toy sends no heartbeat.

## Tooling notes

- Bash heredocs for multi-file JS writes failed to parse once in this environment; the Write tool is reliable for source files.
- Parallel Bash calls share the working directory; use absolute paths or `cd` at the start of each command.
