# Balloon Quest — Phase B6 final report: integration, legacy replacement, release candidate

**Status: LOCAL RELEASE CANDIDATE READY (software).** Nothing was deployed, pushed, committed or written to the real Firebase project. Real-hardware validation and deployment approval are still outstanding.

## 1. Integration status

| Requirement | Result |
|---|---|
| B3–B5 re-verified before integrating | Yes: 9 stages, Easy stationary, Medium/Advanced rising with continuous spawning, no time failure, target availability, hit-test/position agreement, scoring, RIGHT_HAND, lifecycle (suite re-run, see section 7). Two real defects were found and fixed while integrating (section 8). |
| New game is the default at `/control/balloon-quest` and its Display flow | Yes (realtime and local mode). |
| Same game identity, library entry, therapist auth, start/pause/resume/restart/skip/end, summary | Preserved (`balloon-quest`, one library card, staff login gate, existing end-reason sheet, patient chip, lease and connection badge). |
| Legacy kept as rollback, removed from normal selection | Yes: `/control/balloon-quest-legacy` + build flag; not in the library. |
| Historical data untouched and never reinterpreted | Yes (section 5). |
| Other games | Unchanged; route smoke and full test suite pass. |

## 2. Files

**Created (B6):**
* `lib/balloonquest/live.ts` (live-record body, strict reviver, write coalescer), `lib/balloonquest/rollback.ts`
* `lib/control/balloonquest3d/useBalloonQuest3DRealtimeControl.ts` (production driver: staff auth, lease, presence, publisher, history save)
* `components/control/balloonquest3d/BalloonQuestControl.tsx` (production screen, realtime + local)
* `components/display/balloonquest3d/game/{BalloonQuest3DView,BalloonQuest3DLiveDisplay,Bq3SkyBackground}.tsx`, `components/display/games/BalloonQuestDisplayRouter.tsx`
* `lib/sessions/balloonQuestVersion.ts`, `lib/sessions/buildStoredBalloonQuest3DSession.ts`
* `app/control/balloon-quest-legacy/page.tsx`
* Tests: `lib/balloonquest/__tests__/{live,rules.emulator}.test.ts`, `lib/sessions/__tests__/balloonQuest3DHistory.test.ts`, `lib/realtime/__tests__/bq3LiveRecord.test.ts`, additions to `runtime.test.ts`
* Evidence: `docs/balloonquest3d/validation/b6/`, `screenshots/b6/`, `video/balloon-quest-release-candidate.mp4`

**Modified, minimal and targeted (shared files; unrelated uncommitted work in them was preserved):**
`app/control/balloon-quest/page.tsx`, `components/display/DisplayScreen.tsx`, `components/display/gameDisplayRegistry.tsx`, `components/control/library/BalloonQuestThumbnail.tsx`, `components/control/patients/{LastProgressCard,PatientSessionHistorySection,SessionDetailScreen}.tsx`, `lib/analytics/patientAnalytics.ts`, `lib/control/useRealtimeControllerSession.ts` (one guard), `lib/games/registry.ts` (description string only), `lib/realtime/{types,sessionRepository}.ts`, `lib/sessions/{types,sessionHistoryRepository,resumeSuggestion}.ts`.
Also touched from B3–B5: `lib/balloonquest/{types,stages,arabic,controlRuntime,controlMount}.ts`, `input/types.ts`, and the Control/Display game components (panels extracted, `embedded` stage, therapist-tap mode).

**Not modified:** `database.rules.json`, `firebase.json`, `package.json`, lockfile, anything under `lib/physicalInput` (BLE driver, calibration, filters), `SensorRuntimeProvider`, the shared layout, Space Pilot files. The other agent was working concurrently (a Space Pilot legacy-route pattern and `gameThumbnails.tsx` appeared during this phase); their changes were left alone and the combined tree typechecks and passes the full suite.

## 3. Production routes and registry

* `/control/balloon-quest` → `BalloonQuestControl` (realtime: staff gate + lease + Firebase; no Firebase configured: local channel). Registry entry unchanged (`id balloon-quest`, `route /control/balloon-quest`, `nameAr مغامرة البالونات`, `nameEn Balloon Quest`, `sensorCompatible: true`); only the Arabic description now describes stationary or rising balloons over three levels. No duplicate entry.
* `/control/balloon-quest-legacy` → original controller (rollback route, hidden from the library).
* Display: `GAME_DISPLAY_MODULES["balloon-quest"]` is a router that picks the redesigned or the legacy module **from the live session's own shape** (`engine: "bq3"` tag), never a guess, so a session in flight always renders with the engine that started it.
* Display extras for the redesigned game: calm sky behind the letterboxed stage (no legacy leaves/birds), no TTS prefetch for the legacy line set (paid), calm scenes only on the child screen.
* Library thumbnail now uses the new balloon art on the sky.
* Foot sensors / handheld controllers are not offered in production (they exist only as simulations); LEFT_HAND and both hands are offered and labelled "تجريبي".

## 4. Legacy rollback procedure

1. **Immediate, no deploy:** therapists open `/control/balloon-quest-legacy` (or bookmark it).
2. **Default route back to legacy:** set `NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1`, rebuild and redeploy. `/control/balloon-quest` and the local-mode Display then serve the original game.
3. Realtime Displays need no change: they render whichever engine a session was started with.
4. **Data:** nothing to migrate or delete. Records written by the redesigned game remain valid. Roll back with the flag, **not** by redeploying an older commit: a build without the B6 history readers would show new records as five-stage and derive an accuracy from wrong-colour touches.
5. To remove the redesigned game from use entirely, revert `app/control/balloon-quest/page.tsx` (one file).

## 5. Firebase and history compatibility

**No rules or schema change is required.** The redesigned game is published under the existing `balloon-quest` game id:
* `liveSession.session` carries the fields every consumer already reads (`sessionId, seed, config.childFirstName (1–30), gameState, currentDifficulty, currentStage, createdAt`) plus `engine: "bq3"` and a `bq3` block with the versioned Control→Display messages. Balloon positions are never stored; the Display derives them from the simulation clock. Revisions are strictly increasing as the rules demand; a coalescing publisher writes each state change at once (one write in flight) and a clock sample at most once a second. Measured over a full nine-stage session: **≈ 1.5 writes/s** (revision 1 → 169 in 116 s).
* The record is parsed by its own strict reviver (RTDB drops nulls/empty arrays; malformed records are treated as "no session" and never rendered). The legacy controller never adopts a `bq3` record.
* **History** is stored in the existing `/sessions/{patientId}/{sessionId}` shape. Because the rules reject unknown top-level fields, the version rides on each stage result (`engine: "bq3"`, free-form under the rules). Readers use it to: show "من ٣" vs "من ٥", never derive an accuracy for the new game (its `incorrect` field holds informational wrong-colour touches), exclude them from the "incorrect attempts" analytics metric, label them "لمسة ببالون بلون آخر", and compute resume suggestions with 3 stages. **Legacy five-stage records are shown exactly as recorded, are never mapped onto three-stage levels, and the profile card says the updated game starts from the beginning.** Each run of a session is its own immutable record (`<sessionId>-r2`, …).
* Duplicate selections are prevented by the authoritative engine (exactly-once per balloon and input event); pause, resume and restart are engine-level and verified through Firebase.

**Emulator verification (Firebase Auth + Realtime Database emulators, project `demo-…`, the repo's unchanged `database.rules.json`, byte-identical copy checked):** 4/4 tests (`BQ3_RULES_EMULATOR=1`): every lifecycle state of the live record accepted; the exact multi-location update `publishSession` performs accepted; negative controls rejected (non-increasing revision, empty name, 31-character name, missing `currentStage`, unauthenticated, non-staff); history record accepted, stage-result marker accepted, a **top-level** version field rejected (why the marker lives on stage results), overwrite rejected, second run accepted, legacy shape still accepted, stage 6 rejected. No rules were deployed.
An optional future hardening (an explicit top-level `engineVersion` validator) is **not** proposed here because the current approach is sufficient; it would need a rules deployment and its own approval.

## 6. Sensor integration status

| Input | Status |
|---|---|
| RIGHT_HAND (existing WT901 runtime) | Reuses the final normalised pointer through the existing runtime: no new smoothing, no new Bluetooth, calibration/assignments untouched, freshness 250 ms, recenter priming. **Software-verified with a simulated RIGHT_HAND against moving balloons in the production screen**; the real device has not been used with the new engine. |
| LEFT_HAND, both hands | Offered, labelled "تجريبي" (pending real validation). |
| Foot sensors, handheld controllers | Simulation only; **not offered in production**. |
| Keyboard | Development aid, still available (labelled). |
| Therapist taps | Default input in production (works with no sensor). |
Pointer mirroring to the Display (the platform's virtual hand) is unchanged shared behaviour and was not verified on real hardware.

## 7. Test results

| Gate | Result |
|---|---|
| TypeScript (whole repo) | 0 errors |
| ESLint (whole repo, includes `docs/`) | exit 0, no output |
| Full Vitest | **117 files passed, 1 skipped; 1,551 tests passed, 4 skipped** (the 4 are the emulator-only rules tests, run separately: 4/4) |
| Balloon Quest related tests | 127 passed + 4 emulator-only |
| Production build (scratch copy, emulator-only env) | succeeds; new Display prototype routes 404 |
| Route smoke on the production build | all control routes of the other games, `/display`, library, patients: 200 |

## 8. Browser validation (real Chrome, two windows, production **build** against the emulators)

* **Flow A (15/15):** staff login; child name prefilled from the selected patient; Display (anonymous window) renders the redesigned ready screen from the Firebase record with no legacy garden; Control sees the Display connected; start; live record carries game id, patient id and child name; Control vs Display positions agree (**0.01 %** of stage height, Easy and Advanced); **all nine stages completed** (45 correct picks); child completion scene; **exactly one history record**, game id `balloon-quest`, 9 completed stage results all tagged, no accuracy stored, 45 correct.
* **Flow B (19/19):** floor layout and reduced motion reach the Display; scoring; pause (calm message); resume; restart; skip; Display reload recovers; existing end-reason sheet → history record carries the end reason; no derived accuracy; **leaving mid-session saves it as ended early, clears the live record and returns the Display to the waiting world**; the library lists exactly one Balloon Quest entry; the legacy route loads; **a legacy session started from the rollback route still renders on the Display with the legacy module**.
* **Flow C (10/10, development server because the input simulator is hidden in production):** production input list (therapist, right hand, keyboard, left hand ‹experimental›, both hands ‹experimental›; no foot/handheld); RIGHT_HAND mode refuses to start without live input; with simulated RIGHT_HAND a Medium stage with rising balloons completes (4 contacts); Display shows stage-complete; input loss holds with a calm message; recovery auto-resumes; keyboard selection works.
* **Local mode (7/7):** no Firebase configured: no login, redesigned Control, Display linked over the local channel, scoring mirrored, end sheet, thank-you.
* Prototype suites from B3–B5 (wall/floor, reduced motion, five simulated sources, hold/recovery, reload, second-controller lock) were not repeated.

Defects found by these runs and fixed: **(1)** a second *run* of a session reused the session id, so its history record could never be saved (records are immutable by id) → each run now has its own key; **(2)** in an earlier step, `new-run`/`start-at` no-ops surfaced as refusals in the therapist UI; **(3)** the Control only sent clock heartbeats while playing, so a Display could mistake a long pause for a vanished Control → idle heartbeat added. Harness-only issues, not product defects: dev-server cold compile, a synthetic-mouse limitation in this Chrome (pointer/key events were dispatched in the page instead), and the pre-existing single `presence/display` node being cleared by a previous browser's disconnect when runs overlap.

## 9. Evidence
* Screenshots (real, from the production build): `docs/balloonquest3d/screenshots/b6/` — Display ready, Easy, **correct selection** (pop + «أحسنت!»), **stage progress**, **stage completion**, Medium, Advanced, session complete, **Therapist Control** (ready, live, final summary), game library, floor layout, legacy rollback route and a legacy session on the Display, local mode.
* Video: `docs/balloonquest3d/video/balloon-quest-release-candidate.mp4` (164 s of the Firebase-driven child Display, a full nine-stage session).
* Scripts, results and gate outputs: `docs/balloonquest3d/validation/b6/`.

## 10. Known limitations
* **No voice lines or new audio** for the redesigned game (the legacy game speaks Arabic via paid TTS); the platform's existing waiting-world ambience can still be playing (mute toggle exists). Product decision needed.
* A live session cannot be **resumed** after the Control tab is reloaded or closed (the record is cleared on in-app navigation; a hard reload/close leaves a stale record and loses the partial history, as in the legacy flow). Leaving through the back link saves a partial history record.
* Library card still says "لعبة أرضية" (registry has one surface per game; the game supports wall and floor through its settings).
* Display placement is cosmetic-synchronised from a 1 Hz Firebase clock (extrapolated); hit-testing is authoritative on the Control, so a slow network only delays what the child sees.
* The `/presence/display` node is a single shared slot (pre-existing): two Displays or a stale disconnect can clear it.
* Legacy-record "resume" is intentionally not offered for the new game.
* Hand cursor on the Display (mirrored RIGHT_HAND) is existing platform behaviour; not verified with the redesigned stage on real hardware.

## 11. Physical hardware tests still required
RIGHT_HAND WT901 with the new moving-balloon engine (contact radius/tolerance per child, disconnect and reconnect, recenter); LEFT_HAND and two-sensor operation; wall and floor installations (orientation, safe margins, readability at distance, black/white balloons in room light); the mirrored hand's alignment on the real projector; real-GPU frame rate and projector latency; a supervised therapist pilot (instructions, goal sizes, wrong-colour feedback, whether voice is needed); a ≥ 60-minute soak on the production build; foot and handheld adapters remain unbuilt.

## 12. Exact deployment steps (not executed — awaiting approval)
1. Review the diff (the shared-file hunks above) and re-run the gates: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build`.
2. Confirm `git diff database.rules.json` is empty — **no rules deployment is needed**.
3. Deploy a **preview** (not production) to Vercel with the normal Firebase env, leaving `NEXT_PUBLIC_BALLOON_QUEST_LEGACY` unset.
4. On staging/preview with a test patient: run one nine-stage session, check the Display, the saved history record (marker on stage results, no accuracy) and the legacy route.
5. Run the hardware checks in section 11 on the clinic machines.
6. Promote to production after explicit approval. Keep `/control/balloon-quest-legacy` available for the agreed period.
7. Rollback = section 4.

To reproduce the emulator checks: install `firebase-tools@13` **outside** the repo (Java ≥ 11; CLI 15 needs Java 21), copy `database.rules.json` + `firebase.json` into a scratch folder, `firebase emulators:start --only database,auth --project demo-bq3`, then `BQ3_RULES_EMULATOR=1 npx vitest run lib/balloonquest/__tests__/rules.emulator.test.ts`. For the browser flows build/run the app with the variables in `validation/b6/emulator-env.sh` (never with the real `.env.local`), seed with `validation/b6/seed.mjs`, and run `e2e-prod*.mjs` one at a time.

BALLOON QUEST LOCAL RELEASE CANDIDATE READY — Awaiting hardware validation and deployment approval.
