# Final interactive game library and capability audit

Audit date: 2026-10-11. Scope: the existing `/control/activities`, its canonical launch routes, and the current unified working tree. This report separates owner targets from implemented software and physical verification. No engine curriculum was rewritten to fill the gaps below.

## Completed library implementation

The original library now has four RTL device sections: حساسات اليد (6), حساسات القدم (7), عصي التحكم (6), المقود والدواسات (3), when all modern feature flags are enabled. These are 22 presentation cards referencing **13 unique existing registrations**, routes and history types. Disabled games are filtered using the existing registry; counts follow availability.

The already optimized 960×540 WebP assets are served directly through Next Image (`unoptimized`) to avoid a second transcoding/srcset path; the Chromium check exposed deferred selection for two optimizer variants ([initial attempt](library-evidence/browser-optimizer-attempt.json)). Cards contain Arabic/English names, an actual Display screenshot, a separate verified projection badge, an accurate pending notice where needed, and a large launch target. The same reusable card serves Home. All 13 modern thumbnails are local rendered-game captures, optimized to 960×540 WebP; their total size is 584,186 bytes. They contain a synthetic walk-in name, never patient data. See [provenance](library-evidence/thumbnail-provenance.json). Legacy rollback renderers retain safe existing artwork with an explicit pending-capture notice rather than receiving screenshots from a different engine.

The shared typed URL preference `?input=HAND|FOOT|JOYSTICK|DRIVING|MANUAL` travels through the canonical route. Build Quest's existing room redirect now preserves it. A launch panel inside the existing staff gate consults each game's native adapter and calls existing commands/configuration. It neither creates a session nor transports input itself. Selecting a category does not activate hardware. Unsupported modes are disabled, explained in Arabic, and manual control remains available. Hand activation requires the requested role, connected/calibrated runtime, a pointer no older than 250 ms and distinct devices for dual hands. Native wheel activation requires assigned finite axes and a fresh connected local Gamepad. Native lifecycle/ownership checks remain enforced.

Balloon and Bloom require an explicit projection choice before a new session starts, including direct/Home entry. The selection is published in existing session configuration and selects the existing Display layout. Runner stays WALL with “العرض الأرضي بانتظار التنفيذ”; its BOTH target is not falsely advertised as implemented.

## Complete game table

In the following tables, H = desired hand category, F = desired foot category, J = desired handheld joystick category, D = desired driving category. “9” means three difficulty groups with three stages each; it does not mean nine stages were run in the browser. All software readiness assessments are for the isolated all-modern-flags build. **No physical game/device acceptance was performed in this pass.**

| Arabic name | English name | Canonical ID | Required input | Implemented projection / target | Levels × stages | Software readiness |
|---|---|---|---|---|---|---|
| مغامرة البالونات | Balloon Quest | balloon-quest | H/F/J | WALL + FLOOR / BOTH | 3×3 = 9 | Manual and hand software; foot/joystick pending |
| اتبع الخطوات | Follow the Footsteps | follow-the-footsteps | F | FLOOR / FLOOR | 3×3 = 9 | Manual; physical foot pending |
| فرقع الفقاعات | Bubble Pop Wall | bubble-pop-wall | H/J | WALL / WALL | 3×3 = 9 | Manual and hand software; joystick pending |
| قائد الفضاء | Space Pilot | space-pilot | H/J | WALL / WALL | 3 difficulties × 3 missions; **3 missions/run** | Manual/right-hand software; nine-stage progression gap |
| مطاردة الألوان | Color Chase | color-chase | F | FLOOR / FLOOR | 3×3 = 9 | Manual; physical foot pending |
| عالم البناء | Build Quest | build-quest-3d | H/J | WALL / WALL | 3×3 = 9 | Manual/right-hand software; role-specific joystick pending |
| مغامرة العدّاء | Runner Quest | runner-quest-3d | F | **WALL only / BOTH** | 3×3 = 9 | Manual; floor and physical foot pending |
| المرآة السحرية | Mirror Quest | mirror-quest-3d | H/F/J | WALL / WALL | 3×3 = 9 | Manual/simulated limbs; physical adapters pending |
| الأرض الآمنة | Safe Hex Arena | safe-hex-arena-3d | F | FLOOR / FLOOR | 3×3 = 9 | Manual confirmation; physical foot pending |
| مهمة الإطفاء | Fire Rescue | fire-rescue-3d | D | WALL / WALL | 3×3 = 9 | Manual/local wheel software; hardware/remote relay pending |
| الحديقة التي تستيقظ | Blooming World | blooming-world-3d | H/F/J | WALL + FLOOR / BOTH | 3×3 = 9 | Manual both surfaces; wall hands; physical foot/joystick pending |
| موسم الحصاد | Harvest Valley | harvest-valley-3d | D | WALL / WALL | 3×3 = 9 | Manual/local wheel software; hardware/remote relay pending |
| قارب اللؤلؤ | Pearl Voyage | pearl-voyage-3d | D | WALL / WALL | 3×3 = 9 | Manual/local wheel software; hardware/remote relay pending |

### Actual input adapters and validation

| Game | Implemented software input | Simulation / missing / unsupported combinations | Physical status |
|---|---|---|---|
| Balloon | Therapist balloon selection; normalized RH/LH/dual hand bridges | Foot and handheld ideas/simulators do not provide physical adapters | End-to-end current game pending |
| Footsteps | Therapist selects/confirms the child's step | Foot movement hints/simulation; no verified BLE foot adapter or absolute position | Pending |
| Bubble | Manual virtual-hand steering; RH/LH/alternating dual sensor runtime | Stage 7 requires two hands; incompatible single-hand sensor mode falls back to manual. No handheld adapter | Pending |
| Space | Manual flight pad/override; normalized RIGHT_HAND local/remote existing input | Library hand selection uses the fresh validated local source; LH/dual and handheld roles absent | Pending |
| Color | Therapist selects/confirms target zones | Foot hints/simulation do not locate the child | Pending |
| Build | Manual piece selection/placement; normalized RH; experimental generic standard Gamepad poller | Generic controller polling is not a right/left/dual handheld adapter or certified Joy-Con support | Pending |
| Runner | Manual lanes/jump/duck, existing simulated foot recognizer/InputHub | Production physical BLE foot transport absent; FLOOR absent | Pending |
| Mirror | Therapist limb sliders and pose confirmation | Simulated hand/foot roles only; real BLE and handheld absent | Pending |
| Hex | Therapist tile selection and safe-transition confirmation | Simulated foot hints only; never derive tile location from an IMU | Pending |
| Fire | Manual steering/throttle/assistance; assigned local Gamepad wheel/pedal axes | Hardware compatibility and cross-device input relay absent | Pending |
| Bloom | Manual region blooming both surfaces; RH/LH/alternating dual hands on WALL | Hand × FLOOR unsupported; foot hints simulated; handheld absent | Pending |
| Harvest | Manual driving/harvesting; configured local Gamepad wheel/pedals | Physical compatibility and cross-device relay pending | Pending |
| Pearl | Manual driving/throttle; configured local Gamepad wheel/pedals | Physical compatibility and cross-device relay pending | Pending |

Existing generic RIGHT_HAND calibration/profile evidence is not evidence that each of these game/device/projection combinations has been physically accepted. This pass used no BLE sensor, handheld joystick, physical wheel or projector installation. No Joy-Con compatibility is claimed.

### Interaction coverage

- **Hands:** desired six games. Software adapters exist in Balloon, Bubble, Space (RH), Build (RH), Bloom (WALL). Mirror is simulated/manual. Physical acceptance of these game integrations remains pending.
- **Feet:** desired seven games. Existing simulation/hint/recognizer code is useful, but none of the seven is certified here as a production physical foot adapter. Manual participation remains available.
- **Handheld joysticks:** desired six games. No game has a complete validated right/left/dual handheld adapter with therapist-selectable no-button/automatic/one-button policy. Build's generic Gamepad experiment does not satisfy that requirement. Choices remain unavailable rather than falsely activated.
- **Driving:** desired three games. All three have configured local Gamepad wheel/pedal software and manual tools. Physical product compatibility, axis acceptance, disconnect testing and Mac-to-iPad relay remain pending.

### Curriculum, manual controls and history

Source exports are recorded in [source-curricula.json](library-evidence/source-curricula.json). Stage counts derive from actual exported definitions, not prompt titles. Twelve modern engines expose nine stages and stage selection. Space exposes three mission plans at three difficulties (nine configurations), but runs only three missions and has no arbitrary mission picker/skip. Its history correctly reflects the current maximum of three; it must not be relabelled as a nine-stage run.

| Game | Progression / stage selection / completion | Manual gameplay and assistance | History compatibility |
|---|---|---|---|
| Balloon | Nine definitions; start-at difficulty/stage; completion/advance/restart/skip | Select actual balloons, pause/resume/end/results; configurable forgiving controls. No separate assisted-hit counter | Per-stage `engine:bq3` identifies 3-stage format; unmarked legacy remains 5/stages per difficulty |
| Footsteps | Nine; selector and next-stage completion | Confirm step, assisted confirmation, restart/skip/end/results | Version 2 `fp3` stage / `fp3-forest` session payloads; existing save-once/history integration |
| Bubble | Nine; stage selector/completion | Virtual-hand controls, manual confirmation/help and lifecycle controls | Version 2 `dome3` payloads; existing save-once/history integration |
| Space | Three missions/run; progression within run; **no arbitrary mission selector/skip** | Hold flight directions/neutral and sensor override, guidance, pause/resume/restart/end/results | Version 2 ring results (`sp3-rings`); legacy version 1 star results remain separate |
| Color | Nine; selector/completion | Pick zone then confirm, assisted confirmation, lifecycle/skip/results | Version 2 `cc3` stage / `cc3-garden` session payloads; existing save-once/history integration |
| Build | Nine; selector/completion | Pick/place pieces, assistance, restart/skip/end/results | Version 1 `build3` payloads; existing save-once integration |
| Runner | Nine; stage/range selector and completion | Lane/jump/duck; obstacle assistance; restart/skip/end/results | Version 1 `rq3` results; completed/skipped counts kept distinct |
| Mirror | Nine; selector/completion | Limb sliders/pose confirmation and assistance; lifecycle/skip/results | Version 1 `mirror3` payloads; existing save-once/history integration |
| Hex | Nine; selector/round completion | Start warning, select tile, confirm safe transition, assistance/safety/pause/skip/results | `hex3` payloads; existing save-once/history integration |
| Fire | Nine; selector/completion | Steering/throttle, assisted mission actions, lifecycle/skip/results | Version 1 `fr3` payloads; existing save-once/history integration |
| Bloom | Nine; selector/completion | Confirm bloom/help, repeat/skip region or stage, restart/end/results | Version 1 `bw3` payloads; existing save-once/history integration |
| Harvest | Nine; selector/completion | Steering/throttle, assisted cell harvest, lifecycle/skip/results | Version 1 `hv3` payloads; existing save-once/history integration |
| Pearl | Nine; selector/completion | Steering/throttle and assisted voyage actions; lifecycle/skip/results | Version 1 `pv3` payloads; existing save-once/history integration |

Start/pause/resume/restart/stage selection/completion/end/results and save-once were reviewed in existing controls, engines, repositories and tests. Representative browser gameplay actions are recorded separately below. Browser “endClicked” records an end action, not proof that every confirmation dialog was accepted or that a patient history record was saved. Screenshots used walk-ins; patient history was exercised through automated fixtures, not real patients.

History schema/readers were not changed by the library pass. Existing transaction-based immutable save-once paths remain authoritative. Legacy Balloon, Footsteps, Bubble, Color and Space rollback variants retain their original five-stage-per-difficulty structure (15 total definitions). Old results are not reinterpreted. Retired Feed the Animals history remains readable; live retired-game writes remain rejected. No discontinued routes were restored.

### Feature flags

| Canonical game | Existing build flag / behaviour |
|---|---|
| Balloon | `NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1` chooses legacy; modern default |
| Footsteps | `NEXT_PUBLIC_FOOTSTEPS_3D=true` production opt-in; development default on |
| Bubble | `NEXT_PUBLIC_BUBBLE_POP_WALL_3D=0` rollback; modern default |
| Space | `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true` production opt-in; development default on |
| Color | `NEXT_PUBLIC_COLOR_CHASE_3D=true` production opt-in; development default on |
| Build | `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED=true` production opt-in; development default on |
| Runner | `NEXT_PUBLIC_RUNNER_QUEST_3D=1` production opt-in; development on unless `0` |
| Mirror | `NEXT_PUBLIC_MIRROR_QUEST_3D=true` production opt-in; development default on |
| Hex | `NEXT_PUBLIC_SAFE_HEX_ARENA_3D=true` production opt-in; development default on |
| Fire | `NEXT_PUBLIC_FIRE_RESCUE_3D=true` production opt-in; development default on |
| Bloom | `NEXT_PUBLIC_BLOOMING_WORLD_3D=true` production opt-in; development default on |
| Harvest | `NEXT_PUBLIC_HARVEST_VALLEY_3D=true` production opt-in; development default on |
| Pearl | `NEXT_PUBLIC_PEARL_VOYAGE_3D=true` production opt-in; development default on |

No known game flag was found configured in the workspace `.env.local` during the audit. The isolated production validation explicitly enabled all modern flags. This is not a claim that an unconfigured production deployment exposes all 13 games. Runtime feature-flag changes require the existing rebuild/restart process.

## Missing work and prioritized follow-up

These are audit findings requiring the owner's next-pass scope approval, not changes silently made to game engines.

1. **Shared physical input infrastructure (large):** extend the existing physicalInput/InputHub/runtime transport once for real foot and role-assigned handheld devices. Preserve calibration, freshness, role isolation, disconnect neutralization, manual override and session ownership. Implement joystick no-button/automatic/one-button policies only where the native game supports them. Validate actual hardware before claiming compatibility.
2. **Runner (medium/large):** implement and test a distinct FLOOR camera/layout, publish the projection setting through existing session config, and validate the physical foot transport. Keep current WALL badge until complete.
3. **Space (medium/large):** implement the approved nine-stage curriculum/progression, therapist arbitrary stage selection and skip, versioned results and migration-safe readers. Decide whether LH/dual hand support belongs in that pass. Preserve current 3-mission history semantics.
4. **Mirror (large):** connect genuine hand/foot adapters to the existing limb model; implement handheld role policies. Validate pose thresholds and therapist override. Current simulation must remain explicitly marked.
5. **Balloon (medium):** connect approved physical foot/handheld modes and validate both surface/input combinations. Decide whether a distinct assisted-hit history metric is required. Capture legacy rollback thumbnail (small).
6. **Footsteps / Color / Hex (medium each after shared work):** consume real foot movement as hints with therapist confirmation; never infer absolute child position. Validate per-game safety, role assignment and disconnect behaviour. Capture legacy Footsteps/Color thumbnails (small).
7. **Bubble (medium):** validate hand roles/dual alternation in the physical dome integration; implement handheld adapter/button policies after shared infrastructure. Keep two-hand stage validation enforced.
8. **Build (medium):** validate RH end-to-end; replace/extend generic Gamepad experiment with explicit approved handheld roles and confirmation policies, without duplicating the engine.
9. **Bloom (medium/large):** validate wall hands; provide approved physical feet/handheld integration and explicitly resolve HAND × FLOOR limitations. Both surface cameras already exist; projector-scale calibration remains a separate physical check.
10. **Fire / Harvest / Pearl (medium shared, then medium acceptance per game):** validate actual wheel/pedal products, calibrations, stale/disconnect neutralization and therapist takeover. If required, relay normalized input through existing platform transport to the Display device; current local polling is not cross-device hardware support.
11. **Coverage/assets (small to large depending item):** capture Space and Bubble legacy rollback thumbnails; run physical acceptance matrices and real projector calibration; add approved Space nine-stage and Runner floor tests when implemented. Full nine-stage patient-bound browser runs, reload/multi-device ownership and every manual assistance/skip variant remain additional acceptance work. Automated coverage passes but does not replace these physical/end-to-end checks.

Modern thumbnails are complete. Five rollback renderer asset sets are pending accurate captures. No history compatibility blocker was found in current automated checks. No current library/build/security blocker remains; desired gameplay/hardware gaps above remain explicit.

## Exact files changed by this library pass

The workspace already contained extensive concurrent game and shared-platform changes. This list identifies the additive library work; it does not attribute the entire Git diff to this pass.

**Presentation and typed launch:**

- `lib/games/library/capabilities.ts` — membership, owner projection targets, typed requests, freshness/role helpers.
- `components/control/library/presentation.ts` — four sections, availability filtering, truthful projection/hardware notices and Runner description.
- `components/control/library/GameLibraryScreen.tsx` — existing library sections/counts/navigation.
- `components/control/library/GameCard.tsx` — real assets, independent badges, input-aware canonical links.
- `components/control/library/library.module.css` — responsive section/image styling.
- `components/control/library/realGameThumbnails.ts` — canonical actual assets and rollback guards.
- `components/control/library/launch/LibraryLaunchBoundary.tsx`, `launch.module.css` — staff-gated preference/configuration bridge and explicit projection confirmation.
- `app/control/layout.tsx` — boundary nested inside existing StaffAuthGate.
- `app/control/build-quest-3d/page.tsx` — preserve typed input through existing room redirect.
- `lib/games/registry.ts` — Balloon verified modern BOTH versus legacy FLOOR, without duplicate registration.

**Native additive adapter hooks (existing engines/session commands preserved):**

- `components/control/balloonquest3d/BalloonQuest3DControl.tsx`
- `components/control/footsteps3d/FootControl.tsx`
- `components/control/bubblepopwall3d/DomeControl.tsx`
- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/control/colorchase3d/ColorChaseControl.tsx`
- `components/control/buildquest3d/BuildQuestControl.tsx`
- `components/control/runnerquest3d/RunnerQuest3DControl.tsx`
- `components/control/mirrorquest3d/MirrorControl.tsx`
- `components/control/safehexarena3d/HexControl.tsx`
- `components/control/firerescue3d/FireRescueControl.tsx`
- `components/control/bloomingworld3d/BloomControl.tsx`
- `components/control/harvestvalley3d/HarvestControl.tsx`
- `components/control/pearlvoyage3d/PearlVoyageControl.tsx`

**Concurrent evidence-script lint integration:** `eslint.config.mjs` recognizes the newly added Pearl validation `.cjs` scripts as CommonJS for the import-style rule; `docs/pearlvoyage3d/validation/e2e-play.cjs` drops two unused diagnostic variables. Runtime behaviour and test assertions are unchanged.

**Tests:** `components/control/library/__tests__/{presentation,buildLaunch,thumbnails}.test.ts`; `lib/games/__tests__/colorChaseRegistry.test.ts`; `lib/buildquest3d/__tests__/{libraryIntegration,registration,rules.emulator}.test.ts`. Existing assertions were updated to recognize verified BOTH, the nested authenticated boundary and retired live-game rejection; no engine/security assertion was weakened.

**Assets/evidence:** `public/library-thumbnails/{balloon-quest,follow-the-footsteps,bubble-pop-wall,space-pilot,color-chase,build-quest-3d,runner-quest-3d,mirror-quest-3d,safe-hex-arena-3d,fire-rescue-3d,blooming-world-3d,harvest-valley-3d,pearl-voyage-3d}.webp`; this report; files under `docs/release/library-evidence/` listed in the validation evidence below.

No game engine, history schema, Firebase rules, authentication system or live patient records were edited by this library pass. Other agents' current game/rules changes were preserved and tested in an isolated copy of the unified working tree. No commit, push, deployment or rules publication was performed.

## Validation evidence

Validation used synthetic staff/walk-in fixtures, isolated app ports 3337–3342 and isolated Firebase Database/Auth ports 19670/19679. Navigation/gameplay evidence uses port 3340; final loaded-thumbnail screenshots use the final delivery build on port 3342. The final build also includes direct optimized-WebP loading. Next documentation was read before code changes, including server/client composition and asynchronous page search parameters.

| Check | Result | Evidence |
|---|---|---|
| Standalone TypeScript | Passed in isolated current build tree | [typescript.log](library-evidence/typescript.log) |
| Full source ESLint | Passed, zero errors/warnings; generated `.next*` outputs excluded | [eslint.log](library-evidence/eslint.log) |
| Full Vitest | 152 files passed, 13 emulator suites skipped by normal run; 1,911 tests passed, 93 skipped | [vitest.log](library-evidence/vitest.log) |
| Final focused library/integration tests | 6 files, 23 tests passed after final launch-panel changes | [focused.log](library-evidence/focused.log) |
| Explicit Firebase emulator rules | 14 suites, 94 tests passed against unchanged current candidate, including platform rules | [rules.log](library-evidence/rules.log) |
| Production webpack build | Passed, including TypeScript and all enabled canonical routes | [build.log](library-evidence/build.log) |

An earlier root TypeScript attempt encountered stale generated Next types referring to the retired game. Fresh isolated generated types and the production build pass; the retired game was not restored and concurrent Next caches were not overwritten. Initial transient contention/selector failures were resolved or explicitly retained as harness attempts in browser evidence. Final acceptance relies on the successful current-source runs, not earlier failures.

All 22 thumbnails loaded successfully on both desktop and mobile in the final direct-WebP build, with four visible category icons, no horizontal overflow and no page errors. An unavailable wheel was rejected and manual fallback remained enabled. All 22 category links were clicked and preserved the requested input, including the Build room redirect. Unauthenticated library/game entry showed the existing login without cards or an input dock. Desktop/mobile overflow checks passed. Hand selection without a fresh calibrated device was rejected, and unavailable joystick roles retained manual fallback. Both FLOOR games prevented start before explicit selection and started after it.

The representative browser runs started all 13 games with separate visible Control and Display contexts. All reported zero application page errors. Actual manual actions were performed: Balloon correct selection (goal 0→1), Footsteps reached-step confirmation (step 0→1), Bubble virtual-hand steering, Space held flight direction, Color target-zone confirmation, Build piece placement, Runner lane move, Mirror right-arm change (0→0.35), Hex safe tile confirmation, Fire throttle, Bloom bloom confirmation, Harvest throttle/harvesting, Pearl throttle. Browser traces record which pause/resume/assistance/end commands were exercised. Source/tests cover the broader lifecycle; **no full nine-stage browser run is claimed**.

- [All-game browser evidence](library-evidence/browser-manual-supplement.json) and [corrected native-selector rechecks](library-evidence/browser-manual-rechecks.json). The first pass had four manual-action locator misses; rechecks use native test IDs/keyboard selection and uppercase tile state, preserving the original attempts.
- Each game has `<canonical-id>-display.png` and `<canonical-id>-control.png` in this folder. Balloon's renderer is DOM/2.5D, so canvas count zero is expected.
- [Navigation, responsive/auth/input and floor checks](library-evidence/browser-navigation.json).
- [Final loaded-thumbnail and local-wheel rejection evidence](library-evidence/browser-final-visual.json).
- [Desktop library](library-evidence/library-desktop-final.png), [mobile library](library-evidence/library-mobile-final.png), [unavailable hardware](library-evidence/unsupported-input.png), [staff authentication](library-evidence/staff-authentication.png).
- [Balloon FLOOR](library-evidence/balloon-quest-floor-display.png), [Bloom FLOOR](library-evidence/blooming-world-3d-floor-display.png). Floor selection is checked against existing live configuration/layout; this is software verification, not projector calibration.

The library implementation and capability audit can be accepted independently of the explicitly recorded next-pass engine/hardware targets. Acceptance does not certify unavailable foot/joystick adapters, Runner floor, a Space nine-stage ladder, real hardware, or a deployed build.
