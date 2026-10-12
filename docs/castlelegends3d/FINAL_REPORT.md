# Shumos Castle Legends — implementation report

Implemented locally on 12 October 2026. Canonical ID: `shumos-castle-legends-3d`. Native Control route: `/control/shumos-castle-legends-3d`; child presentation resolves through the existing `/display`.

**Delivery status:** all nine stages are playable and passed native Control/Display emulator testing. Production activation is pending owner review and publication of the separate Firebase rules candidate. No production infrastructure, active rules, authentication architecture, patient database or hardware stack was changed. No commit, push or deployment was performed. Visuals use original stylized procedural art; console-reference character fidelity and physical projector acceptance remain unfulfilled quality targets, so this is not claimed as fully accepted production delivery.

## Gameplay and rehabilitation

- Automatically walking third-person hero with a following camera, stone path, distant geometric castle and safe encounter stops. No child walking/aim/attack controls, deadlines, damage to the hero or failure penalties.
- Six distinct guardian types with Arabic names, visible red health bars, articulated hit reactions and magical defeat/disappearance. Confirmations trigger sword movement, energy travel, rings, particles and light; later biomes use different colors, guardian forms and phase counts.
- Nine functioning stages, with chapter/reward presentation and optional repeat, stage selection or encounter bypass. Boss phases contain additional therapist-confirmed rounds; no faster or stronger movement is required.
- A separate full-body articulated instructor shows neutral/target cycles, orange participating limbs, anatomical right/left labeling and green feedback only after confirmation. It supports seated/standing presentation, limited movement amplitude, optional therapist-observed holds and replay.
- Hands, legs and combined modes; right, left or bilateral participation; individual limb inclusion and exercise subsets. The selected subset repeats as a sequence. Mixed exercises demonstrate only permitted limbs, rather than forcing all four.
- Optional physical-mat instructions use blue/orange/green targets. The mat is passive; the therapist chooses and observes the target. No foot placement, weight-bearing, joint-angle or body-tracking claims.
- Manual success, assisted success, exercise skip, replay, pause/resume, encounter bypass, restart with confirmation, safe ending, results and a fresh session preserving accessibility settings. Skipping an exercise causes no damage; bypassed encounters do not earn a defeated-guardian/stage-completion claim.
- High/low graphics, reduced motion, mute and volume. Original synthesized attack/victory cues require a gesture on each audio-producing surface. There is no paid TTS or downloaded music.

## Native architecture and shared integration

`useCastleSession` reuses `useLiveGameController`, `LiveRecordPublisher`, `controlTabId`, recovery/takeover decisions, controller lease/presence and `HistorySaver`. The authoritative state is encoded in `liveSession.session.castle3.payload`, not a new database or communication channel. Display only decodes and renders; it never awards progress or writes gameplay.

Reload recovers running sessions as paused; real network interruption pauses local state, retains the paused pending checkpoint and publishes it on reconnection. Other active windows are blocked until explicit takeover; the previous window stands down. History uses the existing immutable `sessions/{patientId}/{sessionId}` save-once repository. Walk-ins are explicitly not saved as patients.

History records mode/settings, attempted exercises, therapist confirmations, assists, exercise skips, defeated encounters, completed/incomplete stages and active-play duration. Restarted attempts retain their visit IDs. The live checkpoint tracks encounter bypasses; stored stage rows show them as incomplete rather than defeated. No accuracy, reaction-speed or clinical efficacy score is invented. Native patient history and analytics distinguish this game from the legacy accuracy games.

Library: one canonical entry, Arabic/English titles, WALL projection, HAND/FOOT browsing membership and a manual launch adapter. Sensor, joystick and driving adapters are not advertised as implemented. The thumbnail is a real rendered gameplay capture, resized to 640×360; hashes/provenance are recorded in the shared thumbnail inventory.

## Stage matrix

The default is three confirmations per round. The therapist can choose one through six before starting a stage. Higher phases increase repetitions/variety, not physical demands.

| Stage | Environment | Guardians | Rounds per guardian | Reward |
|---|---|---|---|---|
| 1 | Enchanted forest | Forest guardian | 1 | Beginning flame |
| 2 | River and stone bridge | Forest guardian, stone golem | 1 | River jewel |
| 3 | Forest gate towers | Ancient guardian | 2 | Forest gate opens |
| 4 | Crystal valley | Crystal sentinel, stone golem | 1 | Valley crystal |
| 5 | Ancient temple colonnade | Shadow knight, crystal sentinel, shadow knight | 1 | Temple seal |
| 6 | Fortified kingdom | Stone golem, ancient guardian | 2 | Kingdom light |
| 7 | Castle approach | Shadow knight, crystal sentinel, ancient guardian | 1 | Castle arrival |
| 8 | Interior galleries and arches | Shadow knight, ancient guardian | 2 | Throne doors |
| 9 | Crystal throne hall | Ancient crystal king | 3 | Castle Legends victory |

## Exercise matrix

| Mode | Original exercises | Configuration |
|---|---|---|
| Hands | Right/left/both arm raises, open/center, right/left forward reaches, supported comfortable hold | Side, limbs, exercise subset, amplitude, seated/standing, optional hold |
| Legs | Feet open/center, right/left outward movement, right/left mat targets | Same settings plus optional colored mat target; no jumping or automatic position detection |
| Combined | Open arms/feet, right-arm/left-foot, left-arm/right-foot, comfortable center sequence | Permitted limbs only; therapist can reduce the demonstrated combination |

The instructor is a visual demonstration, not a clinical measurement. Optional hold duration is instruction text; the therapist observes it and confirms rather than an automatic timer awarding success.

## Files

Dedicated game files:

- `lib/castlelegends3d/{curriculum,engine,live,history,registration,useSession}.ts`
- `lib/castlelegends3d/__tests__/engine.test.ts`
- `components/castlelegends3d/{rig,world,scene,useAudio}.ts`
- `components/castlelegends3d/{CastleCanvas,CastleView,CastleControl,CastleThumbnail,CastleQA}.tsx` and `castle.module.css`
- `app/control/shumos-castle-legends-3d/page.tsx`
- `components/display/games/CastleLegendsDisplayModule.tsx`
- `app/dev/castle-legends/page.tsx`: development-only evidence harness, gated by `SHUMOS_CASTLE_QA=1` and unavailable in production. It tests the actual reducer/renderer without writing patient data; it is not a production launcher.
- `public/castlelegends3d/thumbnail.png`
- This documentation directory, validation logs/scripts and screenshots.

Shared edits:

- Canonical registry, capabilities, thumbnail resolver, launch presentation and Display module registry.
- Live-session type union and strict revival branch.
- Stored-history union/revival, patient history row/detail and analytics exclusions for nonclinical metrics.
- AudioManager excludes Castle Legends from speculative TTS and platform ambience; it uses its own original cues.
- Three existing registry/thumbnail membership tests and the voiced-game test exclusion updated for the additional canonical game.
- `.gitignore` ignores isolated `.next-*` output directories; `next.config.ts` accepts `SHUMOS_TSCONFIG`; `tsconfig.castle.json` excludes stale default build route validators. The original `tsconfig.json` was restored after Next's automatic local-preview edits.
- Shared thumbnail provenance adds one row.

The two dirty sensor/prototype files present at the start, existing untracked work and other games' source were left untouched. Work stayed in the existing writable checkout with dedicated game directories, ports and build outputs; no worktree/reset/clean was performed. Shared integration files were clean when the additive edits began. No unresolved merge step remains in the application source.

## Visual assets and licensing

Hero, articulated instructor, guardians, vegetation, masonry, grass, crystals, architecture, cloth, effects and material textures are original procedural Three.js geometry/canvas assets authored here. Original synthesized sound cues use Web Audio. No proprietary game characters, downloaded model packs, image backdrops, new rendering packages or copyrighted soundtrack were added. The supplied reference JPEGs informed atmosphere only and were not copied into game assets. Existing platform fonts/branding remain under their existing provenance.

Only the currently selected stage is constructed. Vegetation, path stones, rocks and crystals use instancing. Frame cleanup cancels animation, disconnects resize observation and disposes geometry/material/texture/shadow resources; React remounts reuse a healthy browser context rather than forcibly losing it.

## Verification and evidence

| Check | Result |
|---|---|
| Full Vitest, `--maxWorkers=4` | **1,985 passed; 98 skipped; 161 passed test files, 13 skipped** |
| Final focused engine + thumbnail checks | See `validation/final-focused.log` |
| Changed-file ESLint | Passed, no diagnostics |
| Isolated TypeScript | Passed; also passed as part of the final production build |
| Production Next.js build | Passed compilation, TypeScript and all page generation; no deployment |
| Curriculum unit tests | Every stage in every mode, health/attack guard, skips, pause/recovery, limb restrictions, restart audit, malformed snapshots, fresh sessions and save-once |
| Actual native browser, separate Control/Display contexts | **All nine stages completed manually at normal speed**, using all three modes; confirmed/assisted damage, Control reload, Display reload and safe ending |
| Shared patient history | One completed record; remained one after reload; actual native session-detail page rendered it |
| Real browser network/takeover checks | Fresh session, offline pause/reconnect checkpoint, second-window block, explicit takeover disabling original window, safe termination all passed |
| Local rules security | Anonymous live read allowed; anonymous history read/gameplay write denied; stale revision and wrong owner denied |
| Renderer QA harness | Nine stages completed with screenshots, mobile capture, no page errors; harness progression was accelerated for coverage and is distinguished from the normal-speed native test |
| Physical sensor testing | **Not performed**; no hardware adapter is claimed |
| Projector/device acceptance | **Not performed** |

The first all-worker full-suite run timed out in an existing Space Pilot guided-flight test while several browsers/builds competed for CPU. That unchanged 20-test file passed on its own, then the complete suite passed with four workers. The initial headless Metal browser could not create WebGL; visible GPU Chromium passed. The initial Java 20 emulator attempt failed; the installed Java 21 runtime then passed. These were corrected verification-environment issues, not silently skipped acceptance tests.

Captured screenshots:

- [Native Control](screenshots/native-control.png) and [native Display](screenshots/native-display.png): real shared-session gameplay. Development captures include existing platform diagnostic overlays.
- [Clean gameplay thumbnail source](screenshots/thumbnail-source.png): same actual renderer, 1280×720; dedicated QA capture without development platform overlays.
- [Forest](screenshots/stage-1.png), [crystal valley](screenshots/stage-4.png), [throne hall](screenshots/stage-9.png), [mobile](screenshots/mobile.png) and [low quality](screenshots/low-quality.png).
- Nine native stage-completion captures: `screenshots/native-stage-1.png` through `native-stage-9.png`.
- Machine-readable evidence: `validation/{native-browser,browser-qa,rules-security,reliability-browser,performance}.json`.

## Performance observations

Local visible Chromium on macOS Metal, development build, one forest sample of 100 frames: **16.7 ms median, 18.2 ms p95** (approximately 60 fps). High quality sampled 373 render calls / 272,730 triangles, including instructor; low quality sampled 254 calls / 98,522 triangles. These are one local rendering sample, not a multi-hour memory, battery, tablet or projector benchmark. High quality caps pixel ratio at 1.65; low quality caps it at 1, reduces vegetation and disables shadows. Stage-dependent geometry counts vary rather than all nine worlds remaining resident.

## Remaining acceptance and production steps

1. Review `DATABASE_RULES_CANDIDATE.json` against the latest active rules. `prepare-rules.py` regenerates the candidate from the current repository rules, preserving other games. The candidate was exercised only on isolated local emulators. **Active `database.rules.json` is unchanged**, and no Firebase Console or deploy command ran. Current production rules reject this new canonical ID until the owner approves and publishes an appropriate merged update.
2. Obtain owner visual acceptance. The scenes are functioning original stylized 3D, but authored console-quality skinned characters, bespoke motion-capture animations, detailed physically based asset art and full cinematic fidelity of the reference screenshots have not been delivered. The supplied screenshots show the actual achieved quality.
3. Validate on the physical projector/browser/tablet and the actual clinical workflow. No clinical suitability/efficacy is asserted by software tests.
4. Physical WT901 integration remains unverified/unimplemented for this game. Existing shared hardware infrastructure is preserved; manual confirmation always works without sensors. No four-device BLE validation, automatic leg balance/weight-bearing, pressure input, camera tracking, or exact mat-position detection is claimed.
5. Audio currently provides original attack/victory cues; a full adventure ambience/footstep/music production remains an art/audio enhancement. Optional hold timing stays therapist-observed.
6. The bounded live audit supports up to 600 exercise attempts and 90 stage visits per session. A completed/ended session can start a new independent history record with the same accessibility settings. No soak test to these limits was performed.

Browser validation scripts are retained under `validation/`; their existing Playwright dependency path and macOS Metal renderer reflect this workstation. Test accounts, patient and admin writes in those scripts are restricted to literal localhost `demo-castle` emulator endpoints, not production accounts. No physical input was simulated or tested; the inputs in the native browser tests were actual manual therapist UI actions.
