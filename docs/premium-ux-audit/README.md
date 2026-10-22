# Therapist UX audit — 22 October 2026

Local refinement of the existing Arabic RTL Control interface, based on `0251c48`. The local commit hash is supplied in the delivery message. Nothing was pushed or deployed.

## Findings and corrections

| Finding | Correction |
| --- | --- |
| Confirmation dialog at the viewport’s top-left, with the wrong Arabic font | Explicit fixed insets and auto margins; native top-layer dialog portalled inside the existing Control font scope. At 1366×768 the representative dialog moved from x=0/y=0 to a centered 560px surface. |
| Separate dialog patterns, inconsistent Cancel/focus behavior | Shared `ControlDialog` for patient forms, visit review, navigation guards and native confirmations; keyboard containment, Escape, opener focus restoration, safe initial focus, disabled controls and non-dismissible pending saves. |
| Duplicate patient-number error was visible but unannounced | Existing error message now has an alert role; repository and validation unchanged. |
| Small metadata, inconsistent button sizes/radii and faded disabled controls | Extended existing Control tokens and components: Arabic font, 24/18px heading hierarchy, readable metadata, 46px main controls, consistent focus and card treatments. Child preview typography is excluded. |
| Crowded stage actions and missing stage context in four workspaces | Shared two-column action layout; original stage name/progress surfaced in TurnGo, FootMaze, Rhythm and BodySequence. Original callbacks and disabled conditions retained. |
| Mirror manual controls lost their limb labels during relocation | Move each existing limb label, range and direction group together beneath the preview. |
| Empty preview target pushed fallback artwork outside the clipped preview | Place the honest, labelled fallback in the existing preview box using contain sizing; no fabricated live image. |
| Large selectable maps repeated the full preview | Keep native selectable maps alongside assistance actions, preserving viewBox, selection handlers and game targets. |
| Primary dashboard calibration clutter, undersized navigation/sign-out | Move calibration access to “إعدادات العرض” in shared navigation; maintain back/Display links and touch targets, with tablet header spacing. |
| Inconsistent role names and verbose YouTube labels | Professional “الأخصائي” copy, compact YouTube actions and an authorized read-only Display presence indicator. Capture permissions, signaling, transport and action guards unchanged. |
| Tiny visit/history metadata and engineering error copy | Readable, consistent existing cards and form controls; concise errors without changing records, calculations or clinical meanings. |

Shared work is concentrated in `control.css`, `ControlWorkspace`, `ControlDialog`, `TherapistConfirmation`, `SectionCard`, navigation and existing page styles. Native controller edits are presentation wrappers, labels and accessibility attributes. No new game controller or parallel design system was introduced.

## Browser review and verification

- Real local Chrome, Firebase Auth/Database emulators and synthetic staff/patient/visit/session records; requests restricted to local hosts. No production patient access.
- Reviewed login, home/equipment, library/categories, all 22 setup routes, patient registry/profile, visit creation/detail, activity history/clinical summaries, YouTube, navigation, recovery, errors and empty states.
- Reviewed all 22 active layouts: **21 through fresh native Start**, Space Pilot through a valid, decoder-checked, already-started paused recovery record. Space Pilot fresh Start is separately blocked as described below. No readiness acknowledgements were forged.
- Desktop 1440×900, laptop 1366×768, landscape 1180×820 and portrait 820×1180: no horizontal overflow in checked setup/live routes and the 32 general-page checks. Main live controls retained touch heights and native disabled states. Portrait layouts intentionally scroll vertically.
- Screenshot review led to further corrections for missing limb labels, unreadable stage badges, fallback clipping and oversized maps. The affected layouts were rechecked after those changes.
- Focused Castle browser flow: neutral setup; explicit Start; Control/Display synchronization; 16:9 preview; assistance/repeat; permitted previous/next; Cancel/Escape; confirmed restart preserving attempts; pause/resume; navigation guard; End & Save with exactly one synthetic history record after duplicate clicks. No application-owned browser-native dialogs or runtime errors in that flow.
- Focused patient dialog checks: centering at all four sizes; keyboard containment and restored focus; announced duplicate-number error; genuine pending emulator save with disabled actions and blocked dismissal; exactly one synthetic patient created. Library retains 22 canonical routes and calibration navigation works.
- **26 focused tests passed across 8 files**: dialog, navigation, setup, library, visit presentation and patient formatting. TypeScript and scoped ESLint passed. One production build passed; final screenshot-driven label/style refinements were then checked through TypeScript, scoped lint and the affected browser layouts.
- Source contract comparison against `0251c48`: original action/input handlers, disabled properties, values and bounds preserved across 20 reviewed controller/settings files. No full 22-game gameplay suites or endurance tests were run.

## Separate functional limitation: Space Pilot fresh Start

An existing readiness/rendering cycle blocks a new Space Pilot session even with an authenticated connected Display:

1. `lib/display/sessionPresentation.ts` suppresses native rendering while `gameState === "START_ZONE"`.
2. Space Pilot publishes its initial ready lifecycle as START_ZONE.
3. `SessionAuthority.canPlay()` requires a current visible, ready Display acknowledgement.
4. The renderer-mounted `firebaseDisplayRuntime` supplies that acknowledgement, so it cannot become ready while the renderer is suppressed.

The browser reproduction agrees with the source path. This behavior exists in the base commit and was left intact because this task explicitly excludes Control/Display synchronization changes. Treat it as a separate functional blocker before a future release; do not describe all 22 fresh-start flows as passing. The paused recovery fixture only establishes active-layout coverage.

Physical sensor pairing, physical iPad behavior, real YouTube tab capture/audio and production behavior were not verified. No media failure is hidden or claimed resolved. Firebase rules, authentication, engines/graphics, scoring/history schemas, sensor interpretation and media transport are unchanged. The four pre-existing untracked files remain untouched and excluded.

## Reviewed before/after screenshots

All screenshots use synthetic data. Representative laptop captures compare the released baseline and local candidate; live images can differ in animation frame. Profile and visit captures include the full page.

| Screen | Before | After |
| --- | --- | --- |
| Home | [Before](screenshots/before-home.png) | [After](screenshots/after-home.png) |
| Library | [Before](screenshots/before-library.png) | [After](screenshots/after-library.png) |
| Setup | [Before](screenshots/before-setup.png) | [After](screenshots/after-setup.png) |
| Active workspace | [Before](screenshots/before-workspace.png) | [After](screenshots/after-workspace.png) |
| Confirmation | [Before](screenshots/before-dialog.png) | [After](screenshots/after-dialog.png) |
| Patient profile | [Before](screenshots/before-profile.png) | [After](screenshots/after-profile.png) |
| Therapy visit | [Before](screenshots/before-visit.png) | [After](screenshots/after-visit.png) |
| YouTube | [Before](screenshots/before-youtube.png) | [After](screenshots/after-youtube.png) |
