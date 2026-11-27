# Phase 2 + Phase 3 — local owner review

Review the verified production build at **http://127.0.0.1:3412/control**. Display: **http://127.0.0.1:3412/display**.

Synthetic emulator account only:
- Email: `phase23@shumos.test`
- Password: `SyntheticReview23!`
- Synthetic patient: **اختبار محلي**, number **QA23**.

The review server and isolated Auth/Database emulators remain running. This account and its data exist only in the local demo emulator. No production account was created or activated. The development server used for checks was stopped.

## Phase 2

- Added shared `SetupStart` placement in `ControlWorkspace`. It portals the original native Start element into one centered fixed bottom bar, retaining its handler, prerequisites, loading/disabled state and native refusal messages. It never invokes Start automatically.
- The shared bar respects the sidebar, mobile navigation and safe area, reserves space below content, and hides during active play. Between-stage actions continue through native session controls.
- All 22 registered games have short Arabic activity descriptions. Removed repeated generic setup copy. Existing shared premium settings, difficulty and stage-card layouts remain in use.
- Reward games retain exactly three levels with no subordinate stages.
- Preserved native manual assistance alongside implemented physical input. No new sensor or controller integration was invented. Initial hand-category application uses a fresh calibrated hand only when ready; otherwise it leaves manual participation available.
- Phase 2 verification preceded Phase 3: 31 focused tests passed; browser checks verified one visible native Start at 1440, 820 and 540 pixels and no automatic start.

## Phase 3, by game

| Game | Actual mechanics / behavior | Setup changes |
| --- | --- | --- |
| Castle Legends | New sessions select whole native exercises whose required limbs are entirely within the selected set. Supports all 15 nonempty limb combinations. Legacy mode-based payloads retain their old behavior. Existing nine stages, enemy health, genuine attempts and history remain intact. | Participating limbs first; removed redundant mode, side, coach presentation, movement-scale and reduced-motion controls. Stage cards show enemies and actual movements per enemy. |
| Balloon Quest | The three size scales are **0.85 / 1 / 1.3**; speed scales **0.6 / 1 / 1.4**. Native size and rise-time formulas apply them; goals/scoring remain intact. Hand adapters remain native and manual taps continue to share their scoring guards. Foot launch selects floor/manual participation. | Removed child-name field; patient/visit context supplies identity and original name prerequisites remain. Exactly صغير/متوسط/كبير and بطيء/متوسط/سريع. Right, left and dual-hand choices use existing adapters; unverified options are labeled. Foot/controller launches offer therapist input instead of invented hardware options. |
| Bubble Pop Wall | Retired from new launches; direct URL exposes no new Start. Recovery of an already-started activity stays mounted through its native final save. Dome runtime refuses creation of a fresh session. | Removed from library/device categories and counts. Engine registration, Display, historical records and revivers remain. **21 launchable games; 22 historical engine registrations.** |
| Space Pilot | The real simulation binds stages 1–3 to EASY, 4–6 to MEDIUM and 7–9 to ADVANCED. These are native direction/altitude modes. Recovery restores the saved mode and assistance attribution for the current stage; the next prepared stage follows progression. | Hidden flight mode, altitude-assistance and ring-clearance primary controls. Native defaults and Display/explicit-Start gates remain. |
| Build Quest | Workshop/scoring mechanics unchanged. Existing defaults are high pickup assistance, 650 ms dwell and tolerance 1. Native manual priority over sensor input remains. | Hidden redundant input, pickup-assistance and pickup-region controls; library launch adapter retains supported input application. |
| Mirror Quest | Selected limbs change actual native poses and validation. Where an original stage requires unselected limbs, it reuses compatible native poses with the original stage slot count. Nine stages and 28 attempt slots remain. New results retain participating limbs and native pose IDs. Old payloads/results remain readable. | Added clear multiple-limb selection first. Existing tolerance, hold validation, assistance and manual movement controls remain. |
| Blooming World | New sessions enforce FLOOR, intended dual-foot participation, one activation per region and fixed movement range. An explicit supported input/therapist confirmation starts **2,000 ms of authoritative running-time fill**; only then does native scoring/next-target progression run. Pause, recovery, long clock gaps, end and final-stage skip cancel an unfinished fill without awarding it. Legacy wall/configurable sessions retain old behavior. | Removed participation, motion-range and repetition primary controls. Added visible per-target floor fill and progress indicator. No pressure or weight recognition is inferred. |
| Body Sequence | Sequence/scoring mechanics unchanged. Existing both-feet, spacing 1 and manual-input defaults are retained for new sessions; old configured records remain unchanged. | Hidden right/left-only, spacing multiplier and input-mode controls; therapist tools remain available. |

Castle's old repetition setting is a **base number of movements per encounter phase**, not always the total needed to defeat an enemy. The total is base × the existing stage phase multiplier (1, 1, 2, 1, 1, 2, 1, 2, 3). The new label is “الحركات لكل طور من المواجهة”; stage metadata shows the resulting total. The curriculum was not reduced or renumbered.

## Hardware and asset limitations

- No physical devices were connected or certified during these checks. Balloon left/dual hands have native adapters but remain unverified on real hardware. Foot hardware remains unverified; unsupported foot/controller adapters were not added.
- Space Pilot prioritizes a therapist gesture over a physical pointer and requires safe physical pickup when releasing it. Build Quest preserves its existing 1.8-second manual-priority interval. These prevent competing sources from scoring or steering twice; they do not blend two authoritative inputs.
- Castle and Mirror limb selection expresses intended activity and native targets; it does not claim automatic anatomical recognition.
- The only existing Balloon thumbnail is `public/library-thumbnails/balloon-quest.webp`; it contains a success message. No clean existing stage capture was found, so it was retained. No replacement gameplay screenshot was fabricated.

## Final verification

| Check | Result |
| --- | --- |
| Focused unit/regression tests, 20 files | **242 passed, 0 failed** |
| Firebase ownership/history/visit emulator checks | **14 passed, 0 failed** |
| Setup-only browser checks across all remaining routes | **21 passed**; exactly one visible native Start, no automatic gameplay |
| Responsive shared Start | Passed at desktop, tablet and mobile widths |
| Representative browser lifecycle | Balloon settings/context; Castle selected limb and genuine confirmation; Bloom floor and delayed fill; cancel/end-and-switch; exactly-once history and visit linkage; Display synchronization/reload passed |
| TypeScript | Passed |
| Scoped ESLint | Passed |
| `git diff --check` | Passed |
| Production build | **One build, passed**; no deployment |
| Exact owner-review URL, production server | Passed: synthetic staff login, 21 activities, Mirror setup and empty-setup retirement |

Final test runs have no unresolved failures. Earlier test iterations corrected synthetic fixture clock/source fields, browser selectors for portal-rendered controls, and old expectations superseded by the owner-approved launch/mode changes. No full 22-game browser gameplay or endurance suite was run.

## Firebase and compatibility

No Firebase rules or production configuration were changed or published. No production patient data was read or modified. No authentication, staff authorization, manager login, Control/Display authorization, controller ownership or YouTube system was replaced.

No database migration is required. New optional native payload fields distinguish Castle limb filtering, Mirror participation/actual native pose IDs and Bloom timed floor activation. Mirror history adds optional participation/pose-ID metadata. Existing result versions and legacy readers remain compatible. Bubble retirement is enforced in application launch paths; its historical engine identity remains registered.

## Git state

HEAD remains **ccd9125**. No add, commit, push, reset, clean, stash, branch, worktree, deploy or rules publication was performed. Every task change is uncommitted. Next-generated TypeScript config formatting/build-path additions were removed; the original tracked config is unchanged.

The following pre-existing untracked files were preserved untouched:
- `.auth-incident.firebase.json`
- `docs/display-authentication-no-lease.md`
- `tsconfig.auth-incident.json`
- `tsconfig.integration.json`

## Modified/new task files

- [app/control/bubble-pop-wall/page.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/app/control/bubble-pop-wall/page.tsx>)
- [components/castlelegends3d/CastleControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/castlelegends3d/CastleControl.tsx>)
- [components/castlelegends3d/CastleSettings.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/castlelegends3d/CastleSettings.tsx>)
- [components/control/achievementcity3d/AchievementCityControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/achievementcity3d/AchievementCityControl.tsx>)
- [components/control/achievementforest3d/AchievementForestControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/achievementforest3d/AchievementForestControl.tsx>)
- [components/control/balloonquest3d/BalloonQuest3DControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/balloonquest3d/BalloonQuest3DControl.tsx>)
- [components/control/balloonquest3d/BalloonQuestControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/balloonquest3d/BalloonQuestControl.tsx>)
- [components/control/balloonquest3d/__tests__/setupChoices.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/balloonquest3d/__tests__/setupChoices.test.ts>)
- [components/control/bloomingworld3d/BloomControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/bloomingworld3d/BloomControl.tsx>)
- [components/control/bodysequence3d/Settings.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/bodysequence3d/Settings.tsx>)
- [components/control/bubblepopwall3d/RetiredActivity.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/bubblepopwall3d/RetiredActivity.tsx>)
- [components/control/buildquest3d/BuildQuestControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/buildquest3d/BuildQuestControl.tsx>)
- [components/control/library/GameLibraryScreen.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/library/GameLibraryScreen.tsx>)
- [components/control/library/__tests__/categoryNavigation.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/library/__tests__/categoryNavigation.test.ts>)
- [components/control/library/__tests__/presentation.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/library/__tests__/presentation.test.ts>)
- [components/control/library/launch/LibraryLaunchBoundary.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/library/launch/LibraryLaunchBoundary.tsx>)
- [components/control/mirrorquest3d/MirrorControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/mirrorquest3d/MirrorControl.tsx>)
- [components/control/nav/ControlShell.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/nav/ControlShell.tsx>)
- [components/control/oceanwonders3d/OceanWondersControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/oceanwonders3d/OceanWondersControl.tsx>)
- [components/control/setup/GameSetupLayout.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/setup/GameSetupLayout.tsx>)
- [components/control/setup/__tests__/progressive.test.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/setup/__tests__/progressive.test.tsx>)
- [components/control/spacepilot3d/SpacePilot3DControl.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/spacepilot3d/SpacePilot3DControl.tsx>)
- [components/control/ui/ControlWorkspace.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/ui/ControlWorkspace.tsx>)
- [components/control/ui/workspace.module.css](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/control/ui/workspace.module.css>)
- [components/display/bloomingworld3d/GardenView.tsx](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/display/bloomingworld3d/GardenView.tsx>)
- [components/display/bloomingworld3d/garden.module.css](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/display/bloomingworld3d/garden.module.css>)
- [components/display/bloomingworld3d/scene.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/components/display/bloomingworld3d/scene.ts>)
- [docs/phase23-local-review.md](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/docs/phase23-local-review.md>)
- [lib/balloonquest/__tests__/runtime.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/balloonquest/__tests__/runtime.test.ts>)
- [lib/bloomingworld3d/__tests__/engine.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/bloomingworld3d/__tests__/engine.test.ts>)
- [lib/bloomingworld3d/engine.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/bloomingworld3d/engine.ts>)
- [lib/bloomingworld3d/live.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/bloomingworld3d/live.ts>)
- [lib/bloomingworld3d/registration.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/bloomingworld3d/registration.ts>)
- [lib/bubblepopwall3d/useSession.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/bubblepopwall3d/useSession.ts>)
- [lib/castlelegends3d/__tests__/engine.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/castlelegends3d/__tests__/engine.test.ts>)
- [lib/castlelegends3d/engine.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/castlelegends3d/engine.ts>)
- [lib/games/__tests__/phase23Mechanics.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/games/__tests__/phase23Mechanics.test.ts>)
- [lib/games/library/capabilities.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/games/library/capabilities.ts>)
- [lib/games/library/filters.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/games/library/filters.ts>)
- [lib/games/registry.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/games/registry.ts>)
- [lib/games/setup/introduction.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/games/setup/introduction.ts>)
- [lib/mirrorquest3d/engine.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/mirrorquest3d/engine.ts>)
- [lib/mirrorquest3d/history.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/mirrorquest3d/history.ts>)
- [lib/mirrorquest3d/live.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/mirrorquest3d/live.ts>)
- [lib/spacepilot3d/__tests__/nineStage.test.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/spacepilot3d/__tests__/nineStage.test.ts>)
- [lib/spacepilot3d/rings.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/spacepilot3d/rings.ts>)
- [lib/spacepilot3d/sessionAuthority.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/spacepilot3d/sessionAuthority.ts>)
- [lib/spacepilot3d/worldGameplay.ts](</Users/omaralshehri/All/Visual projects/shumos-interactive-rehab/lib/spacepilot3d/worldGameplay.ts>)

## Current `git status --short`

```text
 M app/control/bubble-pop-wall/page.tsx
 M components/castlelegends3d/CastleControl.tsx
 M components/castlelegends3d/CastleSettings.tsx
 M components/control/achievementcity3d/AchievementCityControl.tsx
 M components/control/achievementforest3d/AchievementForestControl.tsx
 M components/control/balloonquest3d/BalloonQuest3DControl.tsx
 M components/control/balloonquest3d/BalloonQuestControl.tsx
 M components/control/bloomingworld3d/BloomControl.tsx
 M components/control/bodysequence3d/Settings.tsx
 M components/control/buildquest3d/BuildQuestControl.tsx
 M components/control/library/GameLibraryScreen.tsx
 M components/control/library/__tests__/categoryNavigation.test.ts
 M components/control/library/__tests__/presentation.test.ts
 M components/control/library/launch/LibraryLaunchBoundary.tsx
 M components/control/mirrorquest3d/MirrorControl.tsx
 M components/control/nav/ControlShell.tsx
 M components/control/oceanwonders3d/OceanWondersControl.tsx
 M components/control/setup/GameSetupLayout.tsx
 M components/control/setup/__tests__/progressive.test.tsx
 M components/control/spacepilot3d/SpacePilot3DControl.tsx
 M components/control/ui/ControlWorkspace.tsx
 M components/control/ui/workspace.module.css
 M components/display/bloomingworld3d/GardenView.tsx
 M components/display/bloomingworld3d/garden.module.css
 M components/display/bloomingworld3d/scene.ts
 M lib/balloonquest/__tests__/runtime.test.ts
 M lib/bloomingworld3d/__tests__/engine.test.ts
 M lib/bloomingworld3d/engine.ts
 M lib/bloomingworld3d/live.ts
 M lib/bloomingworld3d/registration.ts
 M lib/bubblepopwall3d/useSession.ts
 M lib/castlelegends3d/__tests__/engine.test.ts
 M lib/castlelegends3d/engine.ts
 M lib/games/library/capabilities.ts
 M lib/games/library/filters.ts
 M lib/games/registry.ts
 M lib/games/setup/introduction.ts
 M lib/mirrorquest3d/engine.ts
 M lib/mirrorquest3d/history.ts
 M lib/mirrorquest3d/live.ts
 M lib/spacepilot3d/__tests__/nineStage.test.ts
 M lib/spacepilot3d/rings.ts
 M lib/spacepilot3d/sessionAuthority.ts
 M lib/spacepilot3d/worldGameplay.ts
?? .auth-incident.firebase.json
?? components/control/balloonquest3d/__tests__/
?? components/control/bubblepopwall3d/RetiredActivity.tsx
?? docs/display-authentication-no-lease.md
?? docs/phase23-local-review.md
?? lib/games/__tests__/phase23Mechanics.test.ts
?? tsconfig.auth-incident.json
?? tsconfig.integration.json
```
