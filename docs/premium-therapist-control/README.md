# Therapist Control — Castle Legends reference

Local Phase 1 implementation, 22 October 2026. Baseline: `d69fe68`. No push,
production deployment, rules publication or production-data operations.

## Interaction system

Arabic RTL, light Shumos surfaces and restrained teal selection. Shared components
are `TherapistSection`, `TherapistDisclosure`, `TherapistButton`, `TherapistStatus`
and `TherapistStages`, with scoped typography, spacing, borders, focus outlines,
contrasting labels and touch targets. They are adopted only by Castle and the
existing recovery card. Other game routes retain their existing presentation.

Castle uses essential movement mode, side, seated/standing demonstration, visual
movement size, repetitions, reduced visual motion and participating limbs. Custom
exercises, optional supervised hold, mat targets, rendering quality and audio
remain available under advanced settings. Safety guidance remains visible.

Difficulty selects the native first stage of its group. Each difficulty displays
its existing three stages, with distinct captures from the real Display renderer.
The nine WebP assets were captured using synthetic stage states, with development
overlays hidden in the capture browser. No game art or stage definitions changed.

## Live therapist workspace

Desktop and landscape: child status/preview on the right, therapist panel on the
left. Manual confirmation, assisted success, repeat and movement skip sit directly
below the preview. Pause/resume, native stage navigation, counters and safe end
remain explicit. On tablet widths pause/resume and safe end stay in a fixed bottom
bar, with space reserved so it does not cover the last controls.

The preview deliberately uses a **stage image plus live state**, not a copy of the
child's 3D scene. It reads the same existing `useCastleSession` state as commands:
phase, movement prompt, current stage/encounter, remaining movements and latest
outcome. It is labeled accordingly. Control renders no WebGL canvas; Display keeps
its one original renderer. No extra engine, database listeners, streaming or
scoring system was introduced. Castle has no native speed command, so no speed
control was added.

The existing native commands remain responsible for all gameplay. Configuration
is editable only in the original ready/paused states, repetitions only while
ready. Starting a fresh patient session waits for saved results. Stage changes
and restarts preserve native attempt records; encounter skipping retains its
confirmation dialog. Safe end remains outside secondary settings.

## Existing recovery flow

The compact card follows “بدء جلسة جديدة” on the homepage. It reuses the existing
session classification, ownership checks, transaction-based preview discard,
patient context restoration and game-specific save/end route:

- Unstarted preview: resume setup, explicitly discard owned setup, or fold the
  reminder locally. Folding does not write, delete or release any session.
- Unfinished game: resume or open the game's own safe-end controls. No discard or
  hide action is offered. Pinned patient context is restored before navigation.
- Completed results: open native results/saver. Closing the Display is offered only
  after the existing saved-proof guard permits it.

Homepage scrolling now uses normal document flow. No recovery service or history
schema was added. Existing transactional cleanup still rejects concurrent Start,
foreign windows, changed identity and signed-out callers.

## Verification

Synthetic accounts, patient and sessions only; local Auth/Database emulators with
unchanged repository rules. No real patient records were accessed.

- 32 focused tests passed: Castle engine/state/history, clinical game safety,
  Display presentation expiry, completed-session dismissal and setup cleanup.
- The setup-cleanup test fixture was corrected to provide the current authenticated
  staff identity; it also checks that sign-out during a transaction aborts discard.
- 14 Chrome browser checks passed: compact recovery placement; non-destructive
  hide; owned discard; foreign-window refusal; unfinished recovery/end; three
  difficulty groups and stage cards; native settings; desktop/laptop/tablet scroll;
  synchronized start/pause/resume; real manual commands; tablet safety-bar access;
  native stage progression; safe end; patient result recovery and save once after
  reload; no runtime errors.
- Desktop 1440×1024, laptop 1366×768, tablet landscape 1024×768, tablet portrait
  768×1024. Tablet sizes were tested in desktop Chrome, not on physical iPad/Safari.
- TypeScript, scoped ESLint and one production build passed.
- No full 22-game suites or long-duration tests ran. No game mechanics, curricula,
  Display authentication/rendering, Firebase rules or history schemas changed.

## Browser screenshots

All screenshots contain local synthetic data.

| Experience | Before | After |
| --- | --- | --- |
| Castle setup | [Before](screenshots/before-castle.png) | [After](screenshots/after-castle-setup.png) |
| Homepage recovery | [Before](screenshots/before-home.png) | [After](screenshots/after-home.png) |

[Live therapist workspace](screenshots/after-castle-live.png) ·
[Tablet portrait setup](screenshots/after-tablet-portrait.png)

Physical touch/device acceptance and clinician review remain outstanding. This is
one reference implementation for review, not a rollout across the other games.
