# Display startup and stale-session correction

Verified locally on 2026-10-22. Baseline: the retained production build from the preceding Display authentication release. All browser/database checks used loopback Auth/RTDB emulators, unchanged repository rules, and synthetic identities and sessions. External requests were blocked. Nothing was pushed or deployed.

## Findings and changes

- Staff persistence/token restoration previously started after Display identity initialization. It now starts in parallel, including the staff database handshake. A shared in-flight clock request prevents duplicate handshake listeners. Ownership recovery and the clock handshake can run together, and subscribed canonical ownership avoids redundant recovery downloads when already available. Approval still requires the existing staff credential, a rules-checked write, and a successful read through the independent Display identity.
- Rendering previously equated a valid persisted record with an active game. Ownership repair consequently made an abandoned Balance Bridge setup readable and visible. Display now expires positively identified unstarted previews and completed presentation after the existing 15-second owner-staleness window, using the server-authored publication timestamp. A single local expiry timer handles a controller that stops publishing; no extra polling or data deletion is involved. Ownership repair cannot refresh that timestamp.
- Running, paused, intermediate-stage and ambiguous progress remains visible and recoverable. The homepage offers explicit recovery through the existing game controls, restoring the original patient/walk-in context and rejecting foreign ownership. Completed presentation can be explicitly closed only after rechecking completion, owner, session and revision; patient sessions additionally require the matching saved result. History and private bindings are never removed by this action.
- The shared recovery helper's previous 12-hour cutoff could silently replace valid old progress. Age alone no longer rejects an otherwise validated snapshot. Account, patient, session and live-window isolation remain enforced. Selecting a game or recovery action is required to mount its Control runtime; the homepage does not resume it automatically.

## Measured startup

These are local measurements, not production promises. The owner's approximately ten-second startup was not reproduced. A production device/network trace remains necessary to explain that entire delay.

In the synthetic persisted-preview scenario, with 100 ms added in each direction to Auth HTTP and RTDB WebSocket traffic:

| Click to first detected content | Baseline | Candidate |
| --- | ---: | ---: |
| Cold Display identity | 1.943 s | 1.469 s |
| First reopening | 1.414 s | 1.395 s |
| Second reopening | 1.423 s | 1.464 s |

The cold observation improved by 474 ms (24%). Warm reopenings showed no material improvement. Baseline content was the obsolete game introduction; candidate content was the correct idle screen, so this comparison includes the corrected rendering path. Auth network traces independently confirm overlapping staff and Display initialization.

Unthrottled idle checks reached detected content in 0.390/0.386/0.406 s; a subsequent run measured 0.488/0.355/0.383 s, illustrating normal local variation. Existing scene fades are unchanged; content detection is not the end of the fade animation.

A representative unthrottled cold launch recorded the popup at 113 ms after click. Browser-local `display:*` performance marks measured the remaining timeline relative to navigation start:

| Phase | Milliseconds |
| --- | ---: |
| Auth initialization starts | 299.1 |
| Existing staff identity ready | 315.7 |
| Server clock ready | 324.1 |
| Independent Display identity ready | 325.0 |
| Scoped authorization succeeds | 337.4 |
| Session/presence subscriptions start | 338.3 |
| First Display heartbeat acknowledged | 343.2 |
| Initial session snapshot applied | 344.2 |
| Initial rendered frame | 359.1 |

Marks contain phase names and timing only; they send no telemetry and contain no credentials or session data. They can identify the remaining bottleneck on the owner's device after a separately authorized release.

## Focused validation

- 84 focused unit tests: authentication, authorization/expiry/revocation, diagnostics, revision guards, presentation expiry, completion proof/concurrency, ownership and snapshot recovery.
- Eight emulator checks: legacy no-lease recovery plus seven Display security cases. Four paid-TTS cases were excluded.
- Browser checks: idle Control launch; legacy stale preview stays idle while ownership metadata recovers; one Balance Bridge start; unfinished-game preservation and explicit recovery, including a 13-hour-old controller heartbeat; safe end and return to idle; Display reload before and after ending; no browser runtime errors.
- TypeScript, scoped ESLint, whitespace checks and local production build passed.

No Firebase rules, production configuration, game registrations or game mechanics changed. No full game suites or patient-data operations ran. Temporary configuration, generated builds and raw QA traces are excluded from the commit.
