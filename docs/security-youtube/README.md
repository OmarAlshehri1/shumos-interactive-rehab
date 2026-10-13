# Local YouTube integration and security review

The new activity is `/control/youtube`; it is separate from the canonical 19-game registry. Changes are local for owner review. Nothing has been pushed, deployed or published, and production configuration is unchanged.

## Required production configuration — owner action after review

1. In the intended Google Cloud project, enable **YouTube Data API v3**. Create a server API key, restrict it to that API, and configure the project's quotas conservatively. Do not enable paid services or increase quota automatically. Search and every Load More page consume quota; consult the current [official search documentation](https://developers.google.com/youtube/v3/docs/search/list) and [quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost).
2. Configure **`YOUTUBE_API_KEY`** as a server-only environment variable in the intended Vercel environment. Never use `NEXT_PUBLIC_YOUTUBE_API_KEY`, put the key in source, or use an HTTP-referrer restriction intended for browser keys. For a server with fixed egress, IP restrictions may also be appropriate; Vercel egress must be assessed before imposing those restrictions. No environment variables were changed by this task.
3. Review and manually publish the tested **local rules candidate** to the correct existing Firebase project before releasing this feature. `database.rules.json` and `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` must match. Do not release new commands under the old permissive Display-presence rules. No rules have been published by this task.
4. After owner authorization, release the reviewed application. Verify search with the real key, public embeddable video playback, and a physical Display audio gesture. Actual search requires a valid key; real playback was blocked by Google's unusual-traffic challenge in this development environment.

The server verifies the supplied Firebase ID token through the existing project's official Auth REST `accounts:lookup` endpoint and reads only that identity's own `staff/<uid>/active` record with the same ID token. No Firebase Admin secret, second authentication service or new database is introduced. [Firebase Auth REST reference](https://firebase.google.com/docs/reference/rest/auth/) and [authenticated RTDB REST requests](https://firebase.google.com/docs/database/rest/auth).

Requests require active staff. Search is explicit-submit, 12 results per page, limited to 120 characters, with a 2-KiB bounded body, six requests per minute per UID per warm server instance and a bounded two-minute/100-entry memory cache. Limits are **not distributed across Vercel instances**. Configure Google project quotas as the hard cross-instance cap; shared distributed throttling is a future improvement. Neither search queries nor tokens are logged by this code. Do not put patient data in search text. The server follows no upstream redirects and returns bounded metadata and error codes, never provider keys or raw errors.

## Native Firebase integration

- Personal favorites: `youtubeFavorites/<staffUid>/<11-character-videoId>`, containing exactly `videoId`, `title` (1–200 characters) and `channel` (up to 120). No arbitrary URLs, HTML fields, patient IDs or clinical metadata. Same video ID is one record; removal deletes it. Only that active staff identity can read/write its favorites. No favorites are added to patient history.
- Playback desired state: existing `presence/display/youtubeCommand`, using the existing `controllerLease` and `controlTabId()` conventions. Commands include session and command UUIDs, monotonic revision, current video ID, playing/paused/stopped state, seek position, volume/mute and bounded timestamps. Heartbeats update only owned matching commands. Other active tabs cannot silently overwrite them.
- Display acknowledgement: `presence/display/youtubeStatus`, limited to the current command ID and allowed states/position/timestamp. A delayed initial Firebase read cannot replace a newer subscription event. Duplicate/out-of-order commands are ignored; stale media expires after 15 seconds without a Control heartbeat. Long Control outages require explicit resume and safe lease reacquisition.
- Game switching: existing shared navigation guard remains authoritative. Media preparation transactionally clears only owned empty previews or owned finalized, proven-saved results. Rules require `liveSession` to be absent before media commands are accepted; Display gives any game record priority. History formats and game mechanics are untouched.
- Exiting/ending media stops/destroys the player and cleans only the owned command. Cleanup retains the Firebase command cache through its transaction, then removes the temporary listener. Parent therapy visits stay mounted, continue timing, and use their existing explicit break policy. Video activity logging is not added because the current visit schema accepts only games/exercises.

The official [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) uses `youtube-nocookie.com`, the current Display origin, official controls and branding. Content is never downloaded/rehosted. Ads, recommendations, unavailable videos, embed restrictions and browser audio restrictions remain possible. A direct **تفعيل صوت العرض** gesture is offered; Control cannot bypass autoplay policy. Actual player events determine playback feedback. Shumos game speech/ambience is disposed while media occupies Display; the existing Control visit alert is separate. Safari/iPad volume support and physical audio remain unverified.

## Reproduce local checks

Use synthetic data only. The scripts deliberately use `127.0.0.1`, ports 19940/19949/3399, and demo namespaces. They must never be pointed at production. Browser QA resets its **own demo namespace**.

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home python3 docs/security-youtube/qa/start-emulators.py
python3 docs/control-ux/demo-runtime.py npm run build
python3 docs/control-ux/demo-runtime.py npm run start -- --hostname 127.0.0.1 --port 3399
PLATFORM_DB_PORT=19940 PLATFORM_AUTH_PORT=19949 python3 docs/unified-integration/validate-rules.py lib/realtime/__tests__/platformRules.emulator.test.ts lib/therapyVisits/__tests__/rules.emulator.test.ts lib/youtube/__tests__/rules.emulator.test.ts
PLAYWRIGHT_MODULE=/path/to/playwright node docs/security-youtube/qa/browser.cjs
npx tsc --noEmit
npm run lint
npx vitest run app/api/tts/__tests__/route.test.ts lib/youtube/__tests__/model.test.ts lib/youtube/__tests__/search.test.ts lib/youtube/__tests__/cleanup.test.ts lib/realtime/__tests__ lib/therapyVisits/__tests__ lib/liveGame/__tests__ lib/sessions/__tests__ lib/physicalInput/__tests__
```

Browser tests mock search/player responses explicitly and intercept upstream speech. The authenticated real endpoint's missing-key state is also checked. `REAL_PLAYER=1` attempts an actual official public video embed with mocked search; it does not establish real search coverage. Screenshots, browser reports, logs and failures remain in ignored local `evidence/`. The physical Input tests are simulations/protocol tests, not hardware acceptance.
