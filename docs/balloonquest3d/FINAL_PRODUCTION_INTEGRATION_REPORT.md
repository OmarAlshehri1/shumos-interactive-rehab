# Balloon Quest — Final production integration report (2026-10-10)

Written for: the project owner, ahead of the batch deployment. Nothing was committed, pushed, deployed or published.

Most of this brief was already delivered by B3–B6 (see `PHASE_B6_FINAL_REPORT.md`). This pass re-verified it and closed one gap.

## 1. Old game replaced? Yes
`/control/balloon-quest` serves the redesigned game under the unchanged id `balloon-quest`. Display routing picks the engine from the live session itself (`engine: "bq3"`), so a legacy session in flight still renders with the legacy module.

## 2. Library cards: exactly one
Registry has a single `balloon-quest` entry (route unchanged). The legacy game lives only at `/control/balloon-quest-legacy`. Browser run listed one Balloon Quest card.

## 3. Therapist manual selection
The Control shows the live balloon map (same simulation, same identities). A tap selects that exact balloon, which pops on the Display; scoring is exactly-once. Taps work in every input mode.
**Gap fixed in this pass:** when a sensor mode lost its input the game held, and taps were ignored. Now a therapist tap while held for lost input resumes the session and keeps it from re-holding for 20 s after each tap (`MANUAL_GRACE_MS`). The sensor takes over again when it returns. Change: `lib/balloonquest/controlRuntime.ts` (+ test in `input.test.ts`).

## 4. Cross-device Firebase sync
Existing `liveSession` path, staff auth, lease and Display presence. Control is authoritative; Display derives positions from a shared deterministic clock (1 Hz samples), no per-frame streaming (~1.5 writes/s). Real two-window run: Control vs Display position difference 0.00 % (Easy) and 0.07 % (Advanced rising). Stale/duplicate events are rejected by revision, run and input-event ids (unit tests).

## 5. Nine stages
Re-run today on a fresh production build: all nine stages completed by 45 therapist taps from a separate Control window; Display showed the completion scene.

## 6. RIGHT_HAND
Reuses the existing runtime; BLE, calibration, filters and assignments untouched. Verified with a **simulated** RIGHT_HAND only. LEFT_HAND / both hands are offered as "تجريبي". Foot and handheld are simulation only and not offered in production.

## 7. History compatibility
Existing `/sessions` shape; version marker on each stage result; legacy five-stage records are rendered as recorded and never remapped. One record per run; duplicates impossible (immutable ids). Walk-in behaviour unchanged.

## 8. Files
No new product files this pass. Modified: `lib/balloonquest/controlRuntime.ts`, `lib/balloonquest/__tests__/input.test.ts`. Created: this report and `DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`. Earlier files: see the B6 report.

## 9. Tests (this pass)
| Gate | Result |
|---|---|
| Vitest, full repo | 133 files passed, 2 skipped; 1,709 tests passed, 17 skipped |
| ESLint, whole repo | clean |
| `tsc --noEmit` | one error in another agent's in-progress Space Pilot file (`lib/spacepilot3d/firebaseControlRuntime.ts`: missing `./history`), none in Balloon Quest. It appeared in the main tree but did not stop the scratch-copy production build, so re-check before the batch. |
| Production build (scratch copy, emulator env) | succeeds |
| Firebase emulator rules (Auth + RTDB, current merged rules) | 4/4 allow/deny tests pass |
| Browser flow A (production build, separate Display and Control windows, emulators) | 15/15 pass |

## 10. Not re-run this pass
Browser flows B (pause/resume/restart/skip/end/reload/legacy rollback), C (sensor simulation, input loss) and local mode passed in B6 and were not repeated; the new manual-fallback behaviour is covered by the unit test, not a browser run. No artificial network-delay or offline test was run; the evidence for delay tolerance is the real Firebase round trip measured above and the unit-tested stale/duplicate handling. No test used a real iPad, projector or sensor.

## 11. Hardware tests still required
RIGHT_HAND WT901 with moving balloons (tolerance, disconnect/reconnect, recenter, and the new manual take-over); LEFT_HAND; wall/floor installs; mirrored hand alignment; projector latency and frame rate; real iPad touch on the balloon map; 60-minute soak; supervised therapist pilot. Foot/handheld adapters are not built.

## 12. Rules, flag, rollback
**Rules: Balloon Quest needs no rules change.** `DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` is a byte copy of the current merged `database.rules.json`, which also contains the unpublished Build Quest and Runner Quest changes, so it is the file to publish for the whole batch.
Flag: the game is on by default; `NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1` (rebuild) restores the legacy game on the canonical route. Immediate fallback: `/control/balloon-quest-legacy`. Roll back with the flag, not by redeploying an older commit (older builds misread new history records).

## 13. Steps before batch push and deploy
1. Resolve the Space Pilot type error with its owner; re-run `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build` (in a scratch copy if the other dev server is running).
2. Publish the complete rules file from the Firebase Console, then smoke-test staff login and Display anonymous read.
3. Preview deploy (flag unset); one nine-stage session with a test patient; check history and the legacy route.
4. Run section 11 hardware checks.
5. Promote to production after explicit approval.

## Status
The essential software requirements pass. The two caveats above (the Space Pilot type error, and browser flows B/C/offline tests not re-run this pass) mean I am not using the "release candidate ready" sign-off line; the earlier B6 status stands: **local release candidate, awaiting hardware validation and batch deployment approval.**
