# Display recovery and shared UX — local verification, 2026-10-15

Baseline: `5d6baf9` on existing `main`. Existing untracked Phase 1/3 reports were preserved. No new application, worktree, backend, game engine, clinical schema or security rule was introduced.

## Confirmed production cause

Read-only inspection found an existing Balance Bridge (`bb3`) setup with no top-level `liveSession/controllerUid`. Its native owner matched both the current controller lease and the unexpired Display approval. Production rules exactly matched the repository: they correctly denied Display access because the required controller identity was absent. Email/password and anonymous identity providers were enabled. No patient records or live game payload were requested during production inspection; only configuration and ownership/lifecycle metadata were inspected.

This prevented Display bootstrapping from the homepage: the legacy canonical setup denied access, and the homepage had no game publisher to replace its missing authorization metadata. The foreground also rendered nothing before the initial authorized session read, explaining the reported sky-only screen.

## Local correction

- `recoverDisplaySessionOwner.ts` runs before silent approval. It accepts only a validated native session already owned by the authenticated staff member with a matching current lease. It adds the existing `controllerUid` field and increments the revision. Existing rules recheck lease, native ownership and revision at write time. It never changes the native window ID, native heartbeat, game state, results or private patient binding. Foreign ownership, missing leases and legacy in-record patient bindings remain denied.
- The update is limited to authorization metadata. Replacing the entire old record would revalidate its historical native heartbeat and fail, or require incorrectly faking a new heartbeat.
- Display now shows a concise connecting/error state and retry action while authorization or the initial session read is unavailable.
- Shared setup cards place complete settings above levels on all 22 canonical routes. Native configuration handlers and curricula remain intact. The three reward games keep exactly three native levels and no stages.
- YouTube retains the existing authenticated server search, Firebase favorites and Display command protocol. It adds an official embedded Control preview, explicit child-screen action, responsive browsing cards, loading state, return-to-results action and one-click favorite playback. Preview and Display actions retain the active-game guard. Other displayed choices are real search results, not fabricated recommendations.

## Focused verification

- 76 unit/UI tests across 14 suites passed, covering authorization, staff persistence, Display revision guard, navigation, reward setup, stage compatibility, preview embed validation, search endpoint behavior, favorites/model, video transitions and active-game safety.
- Seven focused security emulator tests passed; four unrelated paid-TTS cases were deliberately excluded.
- One additional emulator regression reproduced the production legacy denial, recovered it with unchanged rules, compared the complete unchanged native session and private binding, and rejected foreign session/lease ownership.
- Production-build browser checks passed: independent Control/Display windows, real Display heartbeat, correct Balance Bridge rendering and manual start, Display and Control reloads, brief reconnect, second-tab isolation, and unauthorized Display denial.
- Production-build UI checks passed on all 22 setup routes: stacked settings/levels, responsive width, no horizontal overflow, contextual back navigation and exactly three reward levels. Existing patient session/visit links and historical exercise records were preserved.
- YouTube UI checks used explicit synthetic search fixtures through the existing endpoint contract: loading, pagination, Firebase favorites/reload persistence, official Control and Display iframe mounting, child command, pause/resume/stop, return to results, quick session without a patient record, desktop/iPad viewport scrolling, and denial after canonical gameplay was confirmed active. An active parent visit remained open and its saved exercise records unchanged.
- TypeScript, scoped ESLint and whitespace checks passed. Exactly one production build passed with all 22 rollout flags enabled and isolated local Firebase services. No full game mechanics suites or endurance tests ran.

## Release status and limits

No push, deployment, production rules, environment variables or production data were modified. No Firebase rules or Vercel configuration correction is required for this application fix. Production behavior must be rechecked after an explicitly approved application deployment; local success does not establish a production resolution. Official YouTube frames and the command flow were checked; third-party video availability, autoplay/audio policies and physical iPad/Safari playback require device verification. Generated screenshots, browser scripts, build output, credentials and raw configuration responses are excluded from the commit.
