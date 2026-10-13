# Shumos Control UX implementation report

Implementation review snapshot on `main`, based on `1e825b6`. At review time no commit, push, or deployment had been performed. The owner subsequently reviewed this report and authorized committing and pushing the UI/navigation work. Production configuration and Firebase rules remain unchanged.

## Visual changes

- Compact light readiness cards for Display/audio, hands, feet, handheld controllers, and wheel/pedals. Actual runtime status logic remains in place; explanations are expandable. Foot hardware remains honestly marked unconfigured, with activity and projection-calibration links. Generic controller and wheel/pedal icons replace text glyphs.
- All library entries are grouped using the existing capabilities registry: hands 7, feet 13, controllers 6, driving 3. These are **29 category appearances of 19 unique canonical games**. Each specific filter renders only its section and preserves the requested input in the canonical launch URL.
- All 19 canonical setup routes use a light Arabic Control frame and the same hierarchy: essential native settings, three difficulty tabs, the selected level's three visual stage cards, and Start. Rare options remain expandable. Native handlers, permissions, input restrictions, stage prohibitions, and game-specific forms are retained.
- Balance settings use a compact responsive grid. Participation/projection choices are inline near the header, and required projection choices remain visible until confirmed. Control uses document scrolling; the visit bar has a real inset. Start is no longer obscured by the floating participation dock.
- The shared header includes the Arabic/English title, real thumbnail, objective, surface badge, manual-control availability, and patient context. The child's Display modules, game engines, curricula, scoring, sensor interpretation, and history schemas were not redesigned.

## Shared components and stage images

`ControlGameFrame`, `GameSetupLayout` / `NativeSetupSections`, and `StageArtwork` are shared across the canonical routes. Existing `ProgressiveStages`, `AdditionalOptions`, patient context, readiness providers, capabilities metadata, and library launch adapters were reused.

There are **41 optimized stage-specific WebP captures across six games**: Balance 9, Space Pilot 9, Turn & Go 9, Foot Maze 9, Body Sequence 3, Rhythm Steps 2. Other stages use the appropriate existing real gameplay thumbnail, explicitly captioned as representative gameplay. No unrelated stock or generated gameplay images were introduced. Native stage names, objectives, challenge counts, and disabled-stage state drive the cards. [Image provenance](STAGE_IMAGE_PROVENANCE.json) records the source captures.

## Navigation root cause and correction

The original shared guard treated every non-complete live record as unsaved gameplay, including `START_ZONE` setup records. Therapy visit hold logic also counted those previews as running activities. Bloom and Harvest additionally archive empty stage drafts during stage selection.

The shared predicate now recognizes explicit native ready states with no start/progress, including strictly empty Bloom/Harvest draft archives. It checks both Display state and recovery snapshots. Started, paused, recovered, and completed/unsaved states remain protected. The predicate fails closed on unknown or malformed state.

On client-side departure, a Firebase transaction rechecks the session ID, owning Control tab, ready state, and lack of progress before deleting the old preview. A concurrent Start or owner/session change aborts deletion. Private-binding cleanup checks the captured patient/session/version and preserves newer bindings. No history entry is created just by setup browsing. Bridge accepts only this tab's validated foreign-game setup while cleanup completes; another tab's preview stays protected.

## Verification results

| Check | Result |
|---|---|
| Full unit suite | 2,288 passed; 149 skipped, including gated emulator suites |
| Firebase emulator rules | 138 passed across 19 suites |
| TypeScript | Passed |
| Root ESLint | 0 errors; 6 existing warnings in older QA scripts |
| Production build | Passed with all 19 integrated engines enabled and fake loopback Firebase configuration |
| Canonical setup/navigation browser suite | All 19 routes: 3 levels, 3 image cards, browsing does not start gameplay, no false save warning, no stale public live preview, no browsing history |
| Start/configuration browser suite | All 19: selected stage 7 (index 6) reaches Start; native settings preserved; post-start navigation remains blocked |
| Full gameplay/history/visit browser flows | Turn & Go, Foot Maze, Rhythm Steps, Body Sequence, Balance Bridge, Castle: pause → reload → resume → therapist action → end → save once → evaluate → link to visit |
| Parent visit/history | Ends with all six immutable references retained; patient history opens |
| Control/Display | Calibration reaches an independent Display context; no Control or Display page errors in browser suites |
| Responsive browser screenshots | Desktop 1440×1000, iPad landscape 1180×820, iPad portrait 820×1180, smaller tablet 768×1024; seven requested screens at each size; no horizontal overflow |

Detailed evidence: [setup/responsive browser report](evidence/browser.json), [19-game startup report](start-evidence/browser.json), [six full integration flows](integration-evidence/browser.json), [unit output](evidence/unit-tests.log), [rules output](evidence/rules-tests.log), [build output](evidence/production-build.log), [lint output](evidence/lint.log). The startup and complete six-game flows cover their stated behaviors; complete end/save/recovery browser cycles were not claimed for the other thirteen games.

### Game coverage

| Canonical game ID | Setup/navigation/images | Start/settings/guard |
|---|---|---|
| `shumos-castle-legends-3d` | Passed | Passed |
| `balloon-quest` | Passed | Passed |
| `bubble-pop-wall` | Passed | Passed |
| `space-pilot` | Passed | Passed |
| `build-quest-3d` | Passed | Passed |
| `mirror-quest-3d` | Passed | Passed |
| `blooming-world-3d` | Passed | Passed |
| `body-sequence-3d` | Passed | Passed |
| `rhythm-steps-3d` | Passed | Passed |
| `foot-maze-3d` | Passed | Passed |
| `turn-and-go-3d` | Passed | Passed |
| `balance-bridge-3d` | Passed | Passed |
| `follow-the-footsteps` | Passed | Passed |
| `color-chase` | Passed | Passed |
| `runner-quest-3d` | Passed | Passed |
| `safe-hex-arena-3d` | Passed | Passed |
| `fire-rescue-3d` | Passed | Passed |
| `harvest-valley-3d` | Passed | Passed |
| `pearl-voyage-3d` | Passed | Passed |

## Before/after and representative screenshots

- Homepage: [owner's before](evidence/home-before.png) → [desktop after](evidence/desktop-home.png), [portrait after](evidence/ipad-portrait-home.png).
- Library: [grouped All](evidence/desktop-all.png), [foot filter](evidence/desktop-foot.png).
- Older setup: [Balloon Quest](evidence/desktop-older-balloon.png).
- Balance: [owner's before](evidence/balance-before.png) → [after](evidence/desktop-balance.png).
- New setups: [Turn & Go](evidence/desktop-turn.png), [Body Sequence](evidence/desktop-body.png).
- Each of these seven screens also has matching `ipad-landscape-*`, `ipad-portrait-*`, and `small-tablet-*` evidence in the same directory.

Compared with the supplied negative references, the equipment explanations are folded away, the library has device sections, Balance has a light background with settings ahead of illustrated stages, and browsing setup no longer opens the save-warning dialog. Started gameplay still opens that dialog.

## Firebase and release status

`database.rules.json` and `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` are unchanged and remain identical, SHA-256 `b52b8442b808df4df9e38b1ac0279ab6c4d615df942058bea0ec37cb6fb4d5ff`. Security tests loaded that candidate only into local demo emulators. No production Firebase access was used for this UI task.

## Known limits and remaining work

- Real Bluetooth, foot sensors, detachable controllers, wheel/pedals, and physical projection calibration were not tested. Their existing verification limits remain visible; manual operation remains available.
- Tablet sizes were tested in Chromium, not on a physical iPad or Safari. Upstream speech was intercepted during browser QA.
- Browser testing enabled all integrated engines. Production flags and legacy rollback configurations were not changed or separately browser-tested.
- Remaining stages deliberately use honestly labelled representative captures. More stage captures can be added later without changing gameplay.
- No failing automated check remains. The owner reviewed this report and authorized release. Physical device verification remains subject to the limits above. [Local QA instructions](README.md) describe how to reproduce the checks.
