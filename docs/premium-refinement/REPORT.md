# Shumos premium UI refinement — 12 October 2026

Implemented locally in the existing working snapshot. No commit, push, deployment, production configuration change or Firebase rules publication. Prior clinical work and uncommitted game integrations remain in place. The isolated preview/emulators were stopped and the original next-env.d.ts restored.

## Library and shared presentation

The library opens on **All**: 14 unique canonical games in one grid. Filters derive from the existing capability map: Hand 7, Foot 8, detachable controllers 6, Driving 3. Counts include Castle Legends, which is already registered here. Filter launch links preserve their input preference; native guards still validate participation. All lets the therapist choose the native participation mode.

Removed the decorative hero, category descriptions, duplicate game sections and repeated per-card device warnings. Cards retain actual gameplay thumbnails, Arabic/English names, projection badge, central skill tags and launch action. Added simple generic detachable-controller and steering-wheel SVG icons. Library surfaces use the clinical dashboard's Arabic typography, teal accents, pale canvas, compact rounded cards and touch-sized controls.

## Native setup controls

All 14 current modern setups use the shared three-level/three-visible-stage presentation: Balloon, Footsteps, Bubble Pop, Space Pilot, Color Chase, Runner, Build, Mirror, Safe Hex, Fire Rescue, Blooming World, Harvest Valley, Pearl Voyage and Castle Legends. Choices call each game's original handlers. Difficulty selects the first permitted native stage; disabled stages remain disabled. Native names/objectives/counts remain the curriculum source. No stages, metrics or gameplay commands are fabricated.

| Presentation | Settings |
| --- | --- |
| Visible or within native essential controls | Participation/projection, relevant limb or movement choices, movement range, speed, assistance, dose/repetition controls; start, pause, resume, repeat, skip and end/save |
| Expandable additional options where applicable | Rendering quality, target sizing/tolerance, pointer sensitivity/smoothing/dead zone, some obstacle/camera/audio parameters |
| Balloon extra options | Balloon size/count/colors, tolerance and session scope; reduced motion/auto advance/no-Display override in comfort/diagnostics; simulator in its own disclosure |
| Runner extra options | Session stage-range scope; speed, spacing and assistance remain accessible |
| Legacy variants | Original five-stage/rollback controls retained; the shared wrapper does not invent nine stages |

Garden and Harvest start/repeat/end actions now precede their preview; stage groups sit in the setup sidebar. Existing native movement controls remain intact. Some specialized controllers still expose a larger set of meaningful controls, especially Garden/Harvest; this is a refinement of their current panels, not a universal replacement form. Native world graphics were preserved.

## Display and audio

Shared Display introduction provides each registered game's actual objective, a simple visual movement cue, participation instructions derived from the native configuration, and replay. It appears when the engine publishes its native pre-start state. It never starts gameplay or blocks on unavailable speech. Existing game-specific introductions remain.

AudioManager now caps normal/low incidental speech at three events with at least 20 seconds between events, suppresses repeated phrases, removes spoken mistake feedback from its shared Balloon/Bubble/Color handlers, and cancels stale queued speech on supported stage-introduction changes. Countdown, instructions, meaningful completion and existing safety guidance remain exempt. Effects remain available. Pearl's feedback now uses the same shared manager on Display rather than a separate speech caller; its Control preview stays quiet. Mute, unlock and native volume controls remain respected; clinical alerts remain separate.

Introductions deduplicate by game/session/stage with same-tab session storage; replay has a separate key. No bulk paid prefetch expansion, new provider, API key exposure or production speech-setting change. Mock audio tests verify policy; browser QA blocks paid TTS requests. Natural voice quality and physical sound audibility were not tested. Quiet procedural native games were not given unnecessary speech. Stages lacking a new instruction event can receive a stricter session-wide incidental budget; independent legacy speech paths are not claimed universally standardized.

## Thumbnails and results

Audited all 14 thumbnail compositions in [the contact sheet](screenshots/thumbnail-audit.png). Mirror and the other existing representative assets were retained. Bubble Pop now uses a 960×540 WebP crop from the real native DomeScene rendered by Chromium software WebGL, 36,462 bytes. [Provenance](thumbnail-provenance.json) records the fixture, crop and output hash. No generated artwork or stock images were labeled gameplay. This was not a fresh end-to-end gameplay capture for every game.

Saved individual results keep identity, duration, level, completed/skipped stages and therapist notes visible; detailed native metrics and stage rows are expandable. Printing opens the details to retain the full report. Balloon's live completion summary follows the same compact pattern. Other native completion panels retain their own metrics. Existing visit evaluation is reused unchanged; no duplicate clinical scoring model or storage schema was introduced. Long-term analytics/comparable-session trends remain outside this refinement.

## Verification and evidence

- TypeScript validation and isolated production build passed.
- Full Vitest suite: **2,018 passed, 104 skipped**, 169 passing files and 14 skipped files.
- Application lint (`eslint app components lib next.config.ts docs/premium-refinement/qa`) passed separately from generated outputs and historical evidence scripts. Repository-wide lint reports 20 existing CommonJS import errors and one unused-variable warning in Castle/clinical QA scripts; those unrelated scripts were preserved.
- Browser tests use isolated demo Firebase emulators, synthetic staff/patients, Chromium software WebGL and blocked paid TTS. [Browser results](browser-results.json) record library uniqueness/filter preference, tablet overflow, native stage selection for all 14 setups, and the Display introduction with speech unavailable.
- Additional input-instruction regression: 4 tests passed after verifying wheel/pedal/source precedence.
- Native Balloon clinical regression passed with no uncaught page errors: enabled native pause handler, visit break/resume, end/save, rating and assistance evaluation, guarded navigation, immutable history link and saved-result disclosure. [Clinical browser results](game-browser-results.json).
- [Screenshots](screenshots/) include dashboard, library/filter/tablet views, every modern setup, real Bubble Pop scene and Display instructions.
- [Files changed](files-changed.json) compares source hashes against the snapshot taken at this task's start, separating this work from the repository's existing changes.

## Remaining limits

Shared introductions depend on native pre-start publication; adapters that publish only on start do not gain a guaranteed before-start introduction. Legacy rollback forms and every native completion panel were not fully redesigned. Hardware connection, physical iPad/Safari Bluetooth, projector calibration, long-session endurance and natural speech quality require device testing. Category membership does not certify hardware availability.

Castle Legends is included locally; its pre-existing production rules support still needs separate review. Rhythm Steps exists in a separate worktree and was not merged or presented as available. Previous clinical integration limitations remain documented in [the clinical report](../clinical-upgrade/REPORT.md), including adapters without ownership stamps, guest metrics and calibration synchronization. This refinement does not remove those limitations.
