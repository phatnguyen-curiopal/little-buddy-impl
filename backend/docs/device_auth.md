# Device authentication (LB1)

The contract between the toy firmware and the backend. Everything a device
sends to `/v1/*` is signed; nothing here needs a vendor key on the device.

## 1. What the device holds

| Item | Where it comes from | Where it lives |
|---|---|---|
| `device_id` | factory manifest (uuid) | NVS |
| `secret` | factory manifest, 32 bytes (64 hex chars) | encrypted NVS, never sent anywhere |
| claim code | printed on the card, entered by the parent | not stored on the device |

## 2. Signing a request

Four headers on every HTTP request to `/v1/*`:

| Header | Value |
|---|---|
| `X-LB-Device` | the device id |
| `X-LB-Ts` | Unix time in seconds, decimal |
| `X-LB-Nonce` | 32 lowercase hex chars (16 random bytes) |
| `X-LB-Sig` | 64 lowercase hex chars |

The canonical string is seven fields joined by a single `\n` (0x0A), no
trailing newline, all ASCII:

```
LB1
<METHOD>          uppercase, e.g. POST or GET
<PATH>            path only, no scheme, host, port or query string
<device_id>
<ts>              the same bytes as X-LB-Ts
<nonce>           the same bytes as X-LB-Nonce
<body_sha256>     lowercase hex sha256 of the exact body bytes; for no body:
                  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

`sig = hex(HMAC-SHA256(secret, canonical))` with the raw 32-byte secret as
the key.

### Reference vectors

Secret `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`,
device `3f9c2a7b1e5d8c04`, ts `1789000000`, nonce
`7c1e0f5a9b3d4e2f8a6c1b0d9e7f5a3c`.

`POST /v1/heartbeat` with body bytes exactly `{"fw":"1.0.0","uptime_s":42}`:

```
body sha256  8a84e1abb3809813bf335b67de12e6c7a5ccb513801bb4bcf9a341e063e173e1
X-LB-Sig     1fb702f7ee187154633c9679c4b8f609bed3e2a9601a92ab60dae0fa28abf5e6
```

`GET /v1/stream` (WebSocket upgrade, no body):

```
X-LB-Sig     dfca3cdd6d79e13b558e8589ea5c59e3a924ae43b59f757509e2028eda46d35b
```

The same vectors are in `tests/fixtures/hmac_vectors.json`. Reproduce them
byte for byte before talking to a real server.

## 3. Clock

The timestamp must be within 300 seconds of server time. Every 401 and 403
body carries `server_time`, and `GET /v1/time` (no auth) returns
`{ "server_time": <seconds> }`. Keep `server_time - local_time` as an offset
in RAM: call `/v1/time` at boot if NTP has not settled, and update the
offset from any `auth_ts_skew` response, then retry once with a new nonce.

## 4. Nonce

Fresh random bytes per request, never reused. The server remembers each
`(device_id, nonce)` for 900 seconds, longer than the clock window, so a
captured request can never be replayed.

## 5. WebSocket upgrade

Sign `GET /v1/stream` with the empty-body hash and put the four values in
the query string:

```
wss://host/v1/stream?device_id=...&ts=...&nonce=...&sig=...
```

The `X-LB-*` headers are also accepted on the upgrade for clients that can
set them. Any device that is not revoked gets a socket; whether a button
press gets an answer is decided per turn (section 7). After a successful
upgrade the server sends `{"type":"ready","device_id":...,"server_time":...}`.
Text frames of `{"type":"ping"}` get `{"type":"pong"}`.

## 6. Status and what the device may do

| Status | `/v1/heartbeat` | `/v1/stream` | Button press | Screen |
|---|---|---|---|---|
| `provisioned` (not yet claimed) | 200, `status: "provisioned"`, `heartbeat_interval_s: 5` | connects | `turn_denied`, emotion `confused` | "waiting for a grown-up" |
| `active` | 200, `heartbeat_interval_s: 60` | connects | `turn_accepted` while the family has credits, else `turn_denied` `sleepy` | normal face |
| `disabled` (parent pause or operator) | 200, `status: "disabled"` | connects | `turn_denied`, emotion `sleepy` | sleeping face, keep heartbeating |
| `revoked` (lost, stolen, retired) | 403 `device_revoked` | 403 | n/a | sleeping face |

## 7. Turns: the button press

One press is one turn, and one answered turn costs the family one credit.
The toy never learns why a press was refused: it gets an emotion and a
sentence to speak, nothing else. A paused toy and a family with no credits
receive byte-identical refusals, and no money word ever crosses this
channel. The parent dashboard shows the real reason.

Toy to server (text frames):

The microphone is a toggle, not hold-to-talk. The child taps the button
once and talks; the toy decides when they have finished, using voice
activity detection on the device (a pause after speech), and ends the turn
itself. A second tap while the toy is listening also ends the turn ("I'm
done"). Either way the firmware sends `turn_end`; the server never needs
to know which one happened.

| type | meaning |
|---|---|
| `turn_start` | the child tapped the button: the microphone opens |
| binary frames | PCM16 little-endian mono 16 kHz audio, sent only **after** `turn_accepted` (20 ms = 640 bytes per frame is the norm) |
| `turn_end` | the child finished talking: the toy heard the pause after speech, or the child tapped again. The microphone closes. |
| `turn_end` with `text` | a typed turn (the web toy's chat box): `{"type":"turn_end","text":"..."}`, 1 to 2000 characters after trimming. Any audio sent in this turn is ignored. |
| `turn_cancel` | give up this turn (for example the toy heard no speech at all); nothing is charged |
| `conversation_new` | end the toy's open conversation now; the next turn starts a new one (and Buddy's short-term context with it) |
| `ping` | keepalive |

Audio limits:

- One WebSocket message is at most 64 KB. A bigger one closes the socket
  with code `1009` before anything is buffered.
- Frames are buffered for the open turn, up to `TURN_MAX_SEC` seconds of
  audio (`TURN_MAX_SEC * 32000` bytes, 120 s by default); anything past
  that is dropped. Frames that arrive before `turn_accepted` or after
  `turn_end` are dropped, and an odd-length frame (half a sample) is
  ignored. So a client must wait for `turn_accepted` before it streams.

Server to toy:

| type | fields | meaning |
|---|---|---|
| `turn_accepted` | `turn_id`, `emotion:"listening"` | speak now; a credit is reserved |
| `turn_denied` | `emotion`, `say`, `conversation_open:false` | show the face and say the sentence; nothing is charged |
| `answer` | `turn_id`, `emotion`, `say`, `heard` | the answer, sent before anything is charged. `heard` is what Buddy understood: the transcript of a voice turn or the typed text (may be empty) |
| `audio` | `turn_id`, `rate`, `bytes` | Buddy's voice follows: binary PCM16 LE mono frames at `rate` Hz, each at most 32000 bytes, `bytes` in total |
| binary frames | | the audio announced by `audio` |
| `audio_end` | `turn_id` | the audio is complete |
| `turn_done` | `turn_id`, `status:"completed"|"abandoned"|"failed"` | the turn is closed; only `completed` charged a credit |
| `conversation_started` | | reply to `conversation_new` |
| `error` | `code:"turn_in_flight"|"no_turn"|"invalid_text"` | protocol misuse: a second `turn_start` (or a `conversation_new`) while a turn is open (a second tap must be sent as `turn_end`), a `turn_end` with no turn open, or a `turn_end` whose `text` is empty, too long or not a string (the turn stays open) |

For an answered turn the order is always: `answer`, then, when there is
audio, `audio`, the binary frames and `audio_end`, then `turn_done`.
The debit is written after the answer and its audio went out. Firmware that
cannot play downlink audio yet may ignore `audio`, the binary frames and
`audio_end`; `answer.say` still carries the words.

When Buddy heard nothing usable (an empty transcript or under 0.3 s of
audio), the answer is a short "I didn't catch that" line (emotion
`confused`, with its audio) and the turn ends `abandoned`: not charged.
A server-side failure while answering speaks a canned line and ends
`failed`, also not charged.

Every sentence the toy is given (`turn_denied`, `answer.say`) is in the
toy's conversation language, which the parent sets per toy (Vietnamese by
default, or English). An unclaimed toy has no language yet and speaks
Vietnamese.

`emotion` is one of `neutral`, `listening`, `thinking`, `happy`, `excited`,
`laughing`, `love`, `curious`, `surprised`, `wink`, `shy`, `confused`,
`sad`, `sleepy`. The firmware should draw each one and fall back to
`neutral` for anything it does not know. The model picks the answer's
emotion from the whole set. The parent website (`web/`) draws the same set.

A turn that is not ended within 120 seconds, a cancelled turn, a socket
that drops mid-turn, and a kill switch (close code 4003) all end as
`abandoned` and charge nothing, even while Buddy is still thinking: the
server stops working on the answer and says nothing more. The answer is
always delivered before the debit is written, so a family never pays for
silence. Turns within five minutes of each other on the same toy, for the
same child, belong to one conversation; `conversation_new` ends it early,
and assigning the toy to another child starts a new one.

The web toy (the parent's browser playing a claimed toy from the
dashboard) uses exactly this protocol, signing with a web credential the
owning parent can reveal. That credential is not the factory secret: it is
HKDF-SHA256 of the device secret with info
`lb-web-toy:<family_id>:<claimed_at in ms>`, so the server accepts it only
while that family's claim stands (status active or disabled, after a
reveal). Unpairing, any new claim, or rotating the device secret makes every
copy a browser kept fail with `auth_bad_signature`, while the physical toy
keeps signing with its own secret. It sends no heartbeat, so the physical toy's
last-seen time and firmware version are untouched.

Heartbeat request body (JSON, optional fields):
`{ "firmware_version": "1.0.0", "uptime_s": 42 }`. Response:
`{ "status", "server_time", "heartbeat_interval_s" }`.

When a device is disabled or revoked while a stream is open, the server
closes the socket with code `4003` and the status as the reason.

## 7. Error codes

Body shape: `{ "error": { "code", "message", "server_time" } }`.

| HTTP | code | Meaning | Device action |
|---|---|---|---|
| 401 | `auth_missing` | a header is absent or malformed | fix the request |
| 401 | `auth_ts_skew` | timestamp outside the window | resync from `server_time`, retry once |
| 401 | `auth_unknown_device` | no such device id | stop; needs reprovisioning |
| 401 | `auth_bad_signature` | HMAC mismatch | check canonical string against the vectors |
| 401 | `auth_replay` | nonce already used | generate a new nonce, retry |
| 403 | `device_not_claimed` | not yet paired with a family | keep heartbeating every 5 s |
| 403 | `device_disabled` | paused by parent or operator | sleeping face, keep heartbeating |
| 403 | `device_revoked` | permanently blocked | sleeping face |
| 429 | `rate_limited` | too many failed authentications this minute | back off 60 s |
| 503 | `auth_unavailable` | server cannot verify right now | retry with backoff |

401 means "prove who you are again"; 403 means "we know who you are and the
answer is no". Auth failures never produce speech, only a face.

## 8. Signing in ten steps (firmware)

1. Keep the 32-byte secret from the manifest in encrypted NVS; never send it.
2. `ts` = `time()` + offset, where offset comes from `/v1/time` or any 401 body.
3. Nonce: 16 bytes from `esp_random()`, hex-encoded lowercase (32 chars).
4. SHA-256 the exact body bytes you will send (hex lowercase); no body means the empty hash from section 2.
5. Build `"LB1\n" + METHOD + "\n" + PATH + "\n" + device_id + "\n" + ts + "\n" + nonce + "\n" + body_hash`. PATH has no host and no `?query`. No trailing newline.
6. `mbedtls_md_hmac(SHA256, secret, 32, string, len, out)`; hex-encode the 32 bytes lowercase.
7. HTTP: send `X-LB-Device`, `X-LB-Ts`, `X-LB-Nonce`, `X-LB-Sig` and the exact body from step 4.
8. WebSocket: sign `GET /v1/stream` and open `wss://host/v1/stream?device_id=..&ts=..&nonce=..&sig=..`.
9. On `auth_ts_skew`: update the offset, sign again with a new nonce, retry once. On any 403: sleeping face, keep heartbeating at `heartbeat_interval_s`.
10. Check your implementation against the two vectors before touching a real server.

## 9. Server-side notes

- Secrets are stored AES-256-GCM encrypted under a key derived from
  `DEVICE_KEK`, with the device id as associated data. A database dump alone
  yields nothing.
- Rotation (`npm run provision -- --rotate <device_id>`) issues a new secret
  and keeps the old one valid for 7 days, so the server row can change before
  the bench reflashes the toy. The firmware never notices.
- Claim codes are 8 characters from `ABCDEFGHJKMNPQRSTVWXYZ23456789` (no
  `I L O U 0 1`), printed as `XXXX-XXXX`, stored only as a peppered hash. The
  same printed code works again after a parent unpairs the toy.
- `DEVICE_AUTH=off` (local development only; production refuses it) skips
  the signature, timestamp and nonce checks but still requires a real
  `X-LB-Device`, so every status rule behaves exactly as it will with auth on.
