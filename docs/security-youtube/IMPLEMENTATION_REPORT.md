# Shumos security, reliability and native YouTube — local review report

Baseline: `main` at `fb869e3e09cfb790c7ec4f5f867bdd9421e91d54`. The initial tree was clean. Existing Claude/Codex processes were inspected without terminating them; no unrelated source changes were observed. The existing prerelease backup was present (approximately 3.1 GiB), and a fresh recoverable source archive of the baseline was created at `/private/tmp/shumos-before-youtube-fb869e3.tar` (192 MiB). The recently released Control UX is preserved.

**No production patient records were read/exported/changed. No push, deployment, Firebase production rule publication or production environment change occurred. All application changes remain local for review.**

## PART A — SECURITY AND RELIABILITY

### Confirmed findings and fixes

| Severity | Finding | Local change / verification |
|---|---|---|
| High | `presence/display` previously granted its entire subtree to any authenticated identity. Anonymous/non-staff clients could forge therapist audio/pointer commands or delete them with a presence replacement. | Therapist commands now require active staff, with strict metadata schemas. Media also requires the shared lease and an absent game. Display receives field-specific telemetry permissions; it cannot replace/delete the command subtree. Synthetic emulator regression coverage. Requires later rules publication. |
| Medium | Lease timestamps were not schema/time bounded. A malformed or far-future heartbeat could defeat stale-owner recovery. | Require owner/claimedAt/updatedAt, validate types and timestamp ranges, deny undeclared fields. Future/missing timestamps and unauthorized takeover tested. Requires later rules publication. |
| Medium | TTS error diagnostics logged raw upstream/network text, which may reflect names, request text or provider credentials. | Log only status/error category; redact reflected server key from response errors. Regression test simulates provider reflection of clinical text and secret. Existing speech status/cooldown behavior retained. |
| Medium (reliability) | A delayed one-shot Firebase read could overwrite a newer subscription event; read callbacks could arrive after unsubscribe. | Shared initial-read helper uses the authoritative subscription and ignores late/disposed callbacks. Regression test covers stale initial data and unsubscribe. |
| Medium (reliability) | Display disconnect handling used replacement `set`, which erased commands. | Merge `update` preserves command fields through disconnect; emulator regression verifies telemetry changes preserve commands. |
| Medium (reliability) | Media cleanup after unsubscribing could abort on an empty Firebase local cache instead of contacting the server. | Temporary cache-retaining listener lives through the owned command transaction and is removed in `finally`. Shared route guard also handles client departure. Unit and browser regression coverage. |
| Medium (reliability) | Long outages release the shared lease; playback resume must reacquire it. | Explicit action reclaims the existing lease, subject to existing ownership rules. Old queued heartbeats cannot silently revive expired media. Browser long-outage/explicit-resume regression. |

Patient-profile, immutable game-history and therapy-visit rules remain structurally unchanged. Synthetic tests cover unauthorized staff/anonymous access, patient/session association, save-once history, visits, safe ownership, stale revisions and calibration delivery. This is not an exhaustive security proof.

### Shared reliability and devices

Existing visit model tests use simulated time for **30, 45, 60 and custom 17-minute** durations, expiry/overtime, pause/resume/break accounting, reload restoration, ending once and immutable linkage. Shared session/history tests cover recovery and interrupted/duplicate saves. Readiness tests reject stale/disconnected Display and audio flags. Calibration tests retain active-staff command writes and restricted anonymous Display access to the non-patient projection command.

Physical-input tests exercise the existing hand runtime, role assignment, dual-sensor simulations, protocol parsing, stale input/contact gates and reconnect behavior. Right/left hand mappings remain independent. Foot mappings remain unconfigured/unverified; wheel/pedal readiness depends on explicit assignment and reported browser capabilities. Manual therapist control is unchanged. WT901 IMUs do not independently prove absolute foot position, pressure or projected contact.

**PHYSICAL HARDWARE UNVERIFIED:** real WT901 sensors, physical floor contact, Bluetooth reconnects, iPad/Safari, gamepads, steering wheel/pedals, projector calibration and audible Display output. No game graphics, stages, scoring, curricula or game-specific movement systems were changed.

### Remaining security risks / not implemented

- **High — existing unpaired anonymous Display trust:** an authenticated anonymous Firebase identity is not proof of an approved clinic screen. The existing live presentation stream may include the personalized child first name; private patient profiles/IDs/visit notes/history remain denied. Telemetry acknowledgements also do not prove a physical device generated them. Paired-device authorization is **NOT IMPLEMENTED** here; changing that policy requires a compatible device enrollment/access plan. The existing authorization policy was not silently replaced.
- **High — existing public `/api/tts` quota exposure:** its server key is private, but the endpoint is not currently restricted to approved staff/paired displays. Logging/privacy were improved; a full authorization/distributed quota boundary is **NOT IMPLEMENTED**. Making it staff-only would break the current anonymous Display speech contract. This remains a production-hardening blocker until that boundary is resolved.
- **Policy boundary:** active staff currently share the clinic patient registry. Per-patient staff assignment is **NOT IMPLEMENTED**. Cross-patient record/path mismatches and unauthorized identities are denied; this does not imply isolation between every two authorized clinicians.
- YouTube rate limiting/cache are bounded **per warm server instance**, not globally distributed. Google project quota restrictions are required; a distributed application budget is **NOT IMPLEMENTED**.

## PART B — YOUTUBE INTEGRATION

**IMPLEMENTED:** `/control/youtube`; compact fourth navigation tab; Arabic light/teal responsive result cards; favorites below results; protected `/api/youtube/search`; official Data API v3 search with Arabic/English, embeddable/syndicated filters, strict Safe Search, 12-item pagination, explicit submit, bounded body/query, caching and rate/error/setup states. Metadata contains no fabricated durations or results.

**IMPLEMENTED:** personal `youtubeFavorites/<staffUid>/<videoId>` persistence in the existing project, with one-record-per-video keys, heart toggles, strict metadata and cross-staff denial. Favorites are independent of patient records and remain available without a search API key.

**IMPLEMENTED:** existing Display presentation-command infrastructure (`presence/display/youtubeCommand` and acknowledgement), shared controller lease/tab identity, command IDs/revisions, stale expiry, heartbeat/reload handling, single official IFrame Player, play/pause/resume/restart/seek/mute/unmute/volume/stop/switch, guarded game transitions, explicit Display audio gesture, error/Open on YouTube fallback, owned exit/end cleanup. The Display game audio manager is disposed while video is shown; Control's timer audio remains separate.

**IMPLEMENTED:** parent visit remains mounted and timing; opening media does not automatically pause or create clinical game results. The existing explicit break policy remains authoritative. Video activity logging is **NOT IMPLEMENTED** because the current visit schema has only games/exercises; no fabricated evaluation or schema duplication was introduced.

**PRODUCTION CONFIGURATION REQUIRED:** server-only `YOUTUBE_API_KEY`, enable/restrict YouTube Data API v3, conservative project quota limits, manual publication of the reviewed local rules to the existing correct project, owner-authorized application release, and real device/search/player acceptance. [Exact setup and QA instructions](README.md).

**REAL SERVICES NOT VERIFIED:** real search has no configured key. The real IFrame smoke was attempted with an official public developer demo video, but Google redirected the script request to its unusual-traffic challenge. No challenge/restriction was bypassed. Actual playback, ad behavior, embed availability and audible Safari/iPad playback remain unverified. Official docs: [search API](https://developers.google.com/youtube/v3/docs/search/list), [IFrame API](https://developers.google.com/youtube/iframe_api_reference).

### Local verification

- TypeScript: passed.
- Shared platform/YouTube/history/visit/physical-input unit suite: **425 passed**, 20 skipped (emulator-gated cases tested separately).
- Local Firebase security suites: **28 passed** across shared platform, therapy visits and YouTube. Synthetic loopback data only.
- Lint: **0 errors, 6 existing warnings** in older QA scripts; no new implementation lint warnings.
- Production build: passed with **all 19 canonical flags enabled**, fake loopback Firebase and external speech/search keys disabled.
- Registry remains **19 canonical games**; YouTube is not a game registry entry. No patient-history or visit schema changes, duplicate backend, second Firebase project, or separate authentication system.
- Browser: search/player responses explicitly **MOCKED**, except the real authenticated missing-key response and attempted real embed. **17 browser checks passed**, with no Control/Display page errors: personal favorites/reload; second-tab denial; play/pause/resume/seek/mute/volume; Display reload; short reconnect; long Control outage/explicit resume; English search/restart/switch; embed errors; explicit Display autoplay gesture; two iPad viewport layouts; natural end; stop; parent visit; and client exit cleanup. Actual physical hardware is not simulated acceptance.

### Screenshots and evidence

Local generated artifacts (intentionally excluded from Git): [iPad landscape](evidence/youtube-ipad.png), [iPad portrait](evidence/youtube-portrait.png), [mock browser report](evidence/browser.json), [attempted real-player report](evidence/browser-real.json). These are synthetic QA views, not real search/playback claims. Reproduction scripts are retained in `qa/`.

### Rules candidate / release gate

`database.rules.json` matches `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`, candidate SHA-256 `6e56f47b287a249f99455df2c4c0da69a5acc97afd141bc4d98684a89455f235`. Existing patient/history/visit/game rule subtrees and calibration command subtree are unchanged. Additions/hardening affect personal favorites, Display presence permissions/commands and controller lease validation.

**Local review only. Do not ship this feature under the old permissive Display-command rules.** The new YouTube implementation requires owner review, key/quota setup and candidate rule publication before an authorized release. Full platform production-hardening cannot be declared complete while the existing unpaired Display and public TTS authorization risks remain unresolved.

Final cleanup: only this task's verified loopback Next server (port 3399) and Auth/RTDB emulator CLI (ports 19949/19940) were gracefully stopped after verification. Other Claude/Codex sessions, editors, unrelated emulators and production services were left running.
