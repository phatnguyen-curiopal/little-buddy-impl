# Contracts between web toy, backend and brain

This file pins the wire shapes that three codebases share. Change it first, then the code.

## 1. Backend -> brain (internal HTTP, brain binds 127.0.0.1:8080)

Every request carries `authorization: Bearer <BRAIN_TOKEN>`. A wrong or missing token is `401 {"error":"unauthorized"}`.

### POST /v1/turns

Voice turn:
- `content-type: application/octet-stream`
- body: raw PCM16 little-endian, mono, 16 kHz (at most `TURN_MAX_SEC * 32000` bytes; the brain accepts up to 6 MB)
- header `x-lb-turn`: base64url of the UTF-8 JSON `meta` below (base64url because child and Buddy names are Vietnamese and headers are latin1)

Text turn:
- `content-type: application/json`
- body: `{ ...meta, "text": "<1..2000 chars>" }`

```json
meta = {
  "turn_id": "uuid",
  "conversation_id": "string (backend conversations.id)",
  "device_id": "uuid",
  "subject": "child:<child uuid>" | "device:<device uuid>:<family uuid>",
  "child": { "name": "Bông", "birth_year": 2020 } | null,
  "buddy": { "name": "Buddy", "role": "friend|daddy|mommy|teacher", "personality": "ENFP" },
  "settings": { "language": "vi|en", "voice_id": "<elevenlabs voice id, already resolved by the backend>", "learn": false, "mood_pin": null | 0..100 }
}
```

200 response (always JSON):

```json
{
  "no_speech": false,
  "heard": "what the child said (transcript) or the typed text",
  "reply": "Buddy's answer, emotion and voice tags already stripped",
  "emotion": "one of the 14 emotions",
  "audio_b64": "base64 PCM16 LE mono" | null,
  "audio_rate": 16000 | null,
  "provider": "openai|anthropic|qwen",
  "model": "string",
  "usage": { "input": 0, "output": 0, "cached": 0 },
  "timings_ms": { "stt": 0, "memory": 0, "llm": 0, "tts": 0, "total": 0 }
}
```

- `child.birth_year` must be an integer or null. A year outside 1990..current year (the backend stores 2000..2100) is treated as null rather than refused, so a typo cannot fail every turn.
- `no_speech: true` means STT heard nothing usable (empty transcript or clip under 0.3 s). `reply`, `emotion` ("confused") and `audio_b64` then hold a role- and language-aware "I didn't catch that" line; the backend sends it and abandons the turn (no charge).
- `audio_b64: null` means TTS failed or is disabled; the turn still counts.

Errors: `400 {"error":"invalid_request","details":[...]}`, `502 {"error":"stt_failed"|"llm_failed","kind":"refusal|empty|timeout|upstream"}`. If the backend closes the request, the brain aborts every upstream call and writes nothing (no history, no learning).

### DELETE /v1/subjects/:subject

Deletes every memory row of that subject (exchanges, familiar_names, child_facts, conversation_summaries) and its in-process history. `204`. The backend calls it after unpairing a toy, with the toy's device subject.

### GET /healthz

`200 {"ok":true, "provider": "...", "db": true}`; no auth.

## 2. Web toy <-> backend (device protocol, /v1/stream, HMAC as today)

Additions to `backend/docs/device_auth.md`. Existing messages are unchanged.

Client -> server:
- `{"type":"turn_start"}` as today.
- binary PCM16 16 kHz frames (640 bytes = 20 ms) **after** `turn_accepted`. Frames are buffered for the turn, up to `TURN_MAX_SEC * 32000` bytes; odd-length frames are ignored; a single message is at most 64 KB.
- `{"type":"turn_end"}` as today, or `{"type":"turn_end","text":"..."}` for a typed turn (1..2000 chars; audio in that turn is ignored).
- `{"type":"turn_cancel"}` as today.
- `{"type":"conversation_new"}` ends the toy's open conversation; the reply is `{"type":"conversation_started"}`, or `{"type":"error","code":"turn_in_flight"}` while a turn is open.

Server -> client, for a completed turn, in this order:
1. `{"type":"answer","turn_id","emotion","say","heard"}`
2. if there is audio: `{"type":"audio","turn_id","rate":16000,"bytes":N}`, then binary PCM16 chunks (each at most 32000 bytes) totalling N bytes, then `{"type":"audio_end","turn_id"}`
3. `{"type":"turn_done","turn_id","status":"completed"|"abandoned"|"failed"}`

A no-speech result follows the same order and ends with `status: "abandoned"` (not charged). Denials (`turn_denied`) and `say` lines come in the toy's conversation language.

## 3. Web -> backend (/api, parent JWT)

- `POST /api/devices/:id/secret` -> `{"device_id","secret_hex"}`, `Cache-Control: no-store`. Owner family only, active toy only, rate limited per parent; `404 device_not_found` for anything else; `403 web_toy_disabled` when `WEB_TOY=off`.
- `GET /api/me` gains `"web_toy": true|false`.
- `GET /api/voices` -> `{"voices":[{"id","label","is_default"}]}`.
- The device profile DTO (in `GET /api/devices` and the PATCH response) becomes `{name, role, personality, personality_source, language, voice_id, learn, mood_pin}`; `voice_id: null` means the default voice. `PATCH /api/devices/:id/profile` accepts any subset of those; `mood_pin: null` clears the pin.
