# Website port to backend-v2: review fixes (2026-10-31)

The first review of the port (81 agents: four builders, an integration run against `dev:lite`, then each finding checked by two skeptics) upheld 20 findings. This round fixed them with four builders on separate files (workflow `web-v2-fixes`). It was stopped during its integration live run, before its own review, so **nothing in this round was reviewed or exercised live**: see "Not done" below.

State at commit: `npm test` 178/178, `npx vite build` passes (only the chunk-size warning). backend-v2: 266/266 in a clean worktree, typecheck clean.

## backend-v2 changes the fixes rely on

- Every 429 carries `Retry-After` in whole seconds (`tooMany` in `src/util/errors.ts`; `createRateLimiter` has `.retryAfter(key)`). The daily browser-Buddy cap waits until the oldest of the day's Buddies is a day old.
- `GET /characters` items have `voices: { vi, en }`, the character's own voice per language.
- `GET /me` has `speak_first`, false while the voice service keeps Buddy from greeting first (production).
- A tap the voice service fails to start (database, recogniser) now gets `play_clip didnt_catch` and `turn_done failed`, and the credit held for it goes back. Before, nothing came back and the toy waited forever.

## Fixed in the site

Overview and data (`data.jsx`, `screens.jsx`, `stats.js`, `api.js`, `ui.jsx`):
- The 7-day chart sums each child's `GET /children/:id/usage` rows (loaded once per family load) instead of the family's newest 200 turns.
- A finished Talk turn calls `refreshAfterTurn(result)`: only for `answered`, only the wallet and the turns (2 calls), trailing, at most once every 10 s and at least 1.5 s after the answer (the voice service writes the debit after `turn_done`). Before, every turn reloaded the whole family (5 + 2 per child calls) and could use up the 60-a-minute budget.
- The Activity child filter asks `GET /turns?child_id=` for that child.
- At load, `api.js` removes the first backend's refresh token (`lb-web-refresh`) and revokes it with a fire-and-forget `POST /api/auth/logout`.
- 429 messages word the `Retry-After` wait in seconds, minutes or hours, or "wait a little" without one (pure helper in `format.js`).

Talk (`machine.js`, `useWebToy.js`, `player.js`, `Talk.jsx`):
- Watchdog: 30 s after `turn_end` (or a `buddy_turn`) with nothing back, the page sends `cancel`, resets, shows `talkStalled` and listens again, or reconnects if the socket died mid-answer. Once Buddy answers, the wait is 15 s, or longer while received voice is still playing (`player.ahead`), so a long story is never cut.
- The new failed-start path is handled in every state, with or without a face first (tested).
- The browser Buddy's secret is not cached, and no socket opens, if the session ended while the credential request was in flight.
- The player coalesces 20 ms downlink frames into larger buffers with a jitter lead on each burst (`tests/talk_player.test.js`).

Care (`care/*`, `care.js`):
- The Safety tab refetches its first page when the family refresh shows a different waiting count.
- Seen alerts can be deleted (inline confirm); focus moves on.
- Paged lists drop rows already shown, reload the first page after a local add or delete while more pages wait, and drop a late page from before a reload.
- The speak-first switch is hidden unless `me.speak_first`; the stored value is still sent unchanged.
- Pending reminders past `expires_at` get their own "expired" group, deletable.
- Consent and learning help promise only what the page can do (see and fix what Buddy remembers, make Buddy forget everything).
- Held arrow keys on the tabs no longer fire a load per key repeat.

Wizard (`layers.jsx`, `wizard.js`):
- A character change closes and reloads as soon as `/buddy/change` succeeds; a failed personality write shows `wzCharPersonalityLost` and keeps the personality in the draft for Save. The change cannot start while the drawer saves.
- A family's first Buddy shows its character's own voice once, tagged and playable (`ownVoicesOf(character)` from `GET /characters`; `characterVoices` removed).
- English "1 unread alerts" is count-neutral now; a few other English plurals were fixed during integration.

Docs: `docs/backend-v2.md` (Retry-After, characters' voices, `speak_first`, the failed start, the watchdog) and `README.md`.

## Not done

- The live run (sign-up 429 wording, first-Buddy voice step, hidden switch, calls per Talk turn, chart, a safety alert arriving and being deleted, the old token removed) was interrupted. Run it by hand, or in a browser against `npm run dev` at the repo root.
- This round's own review and the check of its findings did not run.
- Nobody has talked to a web Buddy with a real microphone yet (headless Chrome never settles `getUserMedia`).

## Known gaps (from the builders)

- Some English strings still read wrong for n = 1 in places the builders did not own (for example credits, answers, minutes); check `en.js`, `care.en.js`.
- The chart asks for usage by the browser's local dates; the voice service files turns under the child's local date. They differ only when the two time zones disagree.
- If `SPEAK_FIRST` is turned on, Buddy's own greetings count in "answers this week".
- A 30 s family reload in flight when a light refresh lands can briefly show the balance from before the last turn (until the next refresh).
- If a parent leaves the editor while a character change is in flight and the personality write then fails, the notice is not seen (the summary shows no personality).
- `tests/buddy.test.js` scans `backend-v2/src/character/packs.ts` and migration 007 for voice ids; reformatting those lines breaks the scan loudly.
