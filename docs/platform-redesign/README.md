# Shumos platform redesign

Local implementation for owner review. No push, deployment, Firebase rule publication, production records, or external messaging.

## Design system and architecture

The existing Arabic IBM Plex Sans Arabic typography and official Shumos logo anchor one Control design system. The palette uses teal `#167d68`, ink `#213e36`, warm canvas `#f5f7f5`, white surfaces, quiet green tints, and borders `#e1e8e2`. Shared tokens in `app/control/control.css` define type, 8px spacing, 20px cards, 11px controls, 46px form fields, focus outlines, and error/status colors. Shared surfaces, stage selectors, dialogs, readiness cards, library cards, and native workspace slots consume the same scale. Child-facing Display artwork retains its own theme.

The right sidebar provides الرئيسية، الأنشطة، المرضى، يوتيوب and the existing projection calibration route. Tablet navigation retains icons with Arabic labels; phones use bottom navigation. A compact account/header bar replaces repeated corner logos and navigation strips. The existing document navigation guard still owns active-game transitions. Contextual back links and existing sign-out destination rules remain. `/` now leads to the existing authenticated `/control` workflow.

## Pages and interactions

- **Login:** official logo, welcome card, show/hide password, Arabic errors, browser validation, keyboard focus, and Firebase email recovery. Recovery uses the same isolated staff Auth instance, Arabic email language, and a neutral response for unknown accounts. No registration, PIN, password storage, recovery-code storage, or alternative authentication was added.
- **Dashboard:** immediately reachable therapy/quick-session choices, separate Display/audio, hand, foot, controller, and wheel/pedal readiness cards, and recent patients. No sensor readiness or pairing is fabricated. Existing Display authorization and audio activation remain required.
- **Activities:** all 22 canonical games, existing categories and real thumbnails, capability filtering, unique-game count, and original launch parameters. Category membership and game registry contents are unchanged.
- **Patients:** the clinical profile now spans the content width. A horizontal identity card shows only stored first name, clinic number, active state, and creation date. Visits occupy a wide panel beside ratings, latest stored notes, independent activity history, and existing analytics. No diagnosis, demographics, or clinical measurements were invented. Existing edit/deactivate actions remain.
- **Visits:** recorded title, number, date, therapist, rating, duration, activity count, and notes are grouped in readable cards. All visits remain accessible; the compact ratings visualization shows up to 12 rated visits. Existing calculations and native result details remain authoritative.
- **Game setup and active controls:** shared cards, fields, stage selection, buttons and statuses cover all 22 canonical routes. The three reward games retain exactly three levels without subordinate stages. Desktop preview remains on the right, original assistance directly beneath it, therapist actions on the left. Starting scrolls the workspace into view, and portrait pause/end controls respect the sidebar. Original handlers and engines stay mounted. A suspended native game now has a paused presentation label; this does not change clinical safety checks. Balloon Quest exposes its existing refused-Start reason instead of silently remaining in setup.
- **YouTube:** surrounding surfaces match Control; the original tab-sharing transport, browser capture request, favorites, signaling and Display controls are unchanged.

## Therapist identification and security

Each new therapy visit requires an explicitly entered `اسم الأخصائي`. The form does not use the shared account's display name and clears the draft only after a successful visit start, so returning to a cached setup page cannot silently reuse it. The name is saved to the existing `Visit.therapistName` field. Authenticated `ownerUid` and `controlTabId` remain separate and unchanged. Typed names are attribution, not verified identities or authentication. Quick sessions retain their existing metadata requirements.

No clinical schema, Firebase permissions, or security rules were changed. No migration/security blocker was encountered. Recovery relies on the clinic's existing Firebase email/password account and access to its mailbox; real inbox delivery was not exercised. The minimal staff recovery process is the Firebase reset link through the controlled clinic mailbox or its administrator, without a custom PIN or weaker patient-record access.

## Validation and evidence

All checks use synthetic records and isolated Firebase Auth/Realtime Database emulators (`demo-shumos-unified`, loopback ports 19949/19940). Paid TTS requests are intercepted in browser QA.

- 97 focused unit/component tests passed across 20 files: auth/recovery, shell/back links, canonical registry, stage/reward selectors, thumbnails/capabilities, readiness/audio, dialogs, visit presentation/repository/numbering, safe formatting, workspace status, and the latest recorded rating when a newer visit is unrated.
- TypeScript and scoped ESLint passed; `git diff --check` passed.
- Final production build passed with the existing game release switches enabled only in its child process. Production smoke checks passed for authentication, root redirect, 22 unique canonical games, patient profile, and preserved YouTube controls.
- Browser checks covered login/recovery, navigation, readiness, profiles, visit setup/detail, all 22 native setups, filter launch parameters, explicit attribution, guarded native start/pause/resume/end, result save, clinical evaluation, visit completion, and sign-out. The single saved native result is linked once, and all 14 historical fixture visits remain unchanged.
- Screens reviewed at **1440×900**, **1366×768**, **1180×820**, and **820×1180**. Main screens and a representative active workspace have no horizontal overflow. A native modal was checked for focus containment, Escape, and focus restoration.
- One existing library test asserted capability-list order against registry order. Its assertion now checks membership without changing either production order.
- The production release switches are deliberately unchanged. The existing Runner switch uses `1`, while most other game switches use `true`; the local QA launchers supply their existing opt-ins without editing `.env.local`.

[Browser results](browser-results.json) · [Production smoke results](production-results.json)

Representative screenshots (synthetic data; retained locally under the existing screenshot ignore policy):

| Surface | Before | After |
| --- | --- | --- |
| Login | [Before](screenshots/before-login.png) | [After](screenshots/final-login.png) |
| Dashboard | [Before](screenshots/before-home.png) | [After](screenshots/final-home.png) |
| Library | [Before](screenshots/before-library.png) | [After](screenshots/final-library.png) |
| Patient profile | [Before](screenshots/before-patient.png) | [After](screenshots/final-patient.png) |

[Recovery](screenshots/password-recovery.png) · [Visit details](screenshots/after-visit-detail.png) · [Patient dialog](screenshots/patient-dialog.png) · [Laptop workspace](screenshots/active-workspace-laptop.png) · [Portrait workspace](screenshots/active-workspace-820x1180.png) · [Navigation guard](screenshots/active-navigation-guard.png) · [Clinical evaluation](screenshots/activity-evaluation.png) · [Saved native results](screenshots/saved-native-results.png)

Every canonical setup also has a `screenshots/setup-<game-id>.png` capture. Logs are local `unit-tests.log`, `clinical-summary-tests.log`, `typescript.log`, `eslint.log`, and `build.log`.

## Verification limits

Chrome viewport emulation is not real iPad/Safari verification. Physical Bluetooth sensors, foot adapters, controllers, wheels/pedals, real projectors, real email inbox delivery, and original-YouTube browser tab capture/audio were not hardware-tested. YouTube control availability was verified; no media transport issue was masked by the redesign. Real hardware, browser capture permissions, and Safari should be reviewed on clinic equipment. No full game-engine or endurance suites were run.

## Preservation and reproduction

Work stayed in the main checkout. Local and remote `main` were verified at baseline `69ffd2735ea01886bf19d7eeebd8726c399cb102`. The pre-existing untracked `.auth-incident.firebase.json`, `docs/display-authentication-no-lease.md`, `tsconfig.auth-incident.json`, and `tsconfig.integration.json` remain untouched and excluded from this change.

No game engine, graphics, scoring/progression, curriculum, physical-input transport, save-once recovery logic, patient schema, historical clinical records, Firebase rule, or YouTube transport was edited. The original Control providers remain in the existing order. The old per-page navigation component was replaced by the persistent shared shell; contextual links remain ordinary guarded links.

QA helpers live in `qa/`. `checks.cjs` runs only focused tests with existing release flags. `local.cjs build` and `local.cjs start` build/serve a loopback demo production app on port 3412. `seed.cjs` writes only the fixed loopback synthetic fixtures and saves temporary browser state under `/private/tmp`; it must never target a real project. `browser.cjs` expects the demo dev app on port 3411. Set `PLAYWRIGHT_MODULE` to an already installed Playwright package when it is not on the normal module path. Start isolated Auth/RTDB emulators with a temporary copy of the existing rules before browser QA. `production-smoke.cjs` targets the local production preview. Do not publish these emulator settings.
