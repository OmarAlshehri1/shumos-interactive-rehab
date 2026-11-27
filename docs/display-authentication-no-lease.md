# Display authentication incident — local correction, 2026-10-15

Baseline production release: `a86f72d`. Work stayed on existing `main`. No production database writes, account changes, rule changes, configuration changes, push or deployment were performed during this investigation. Game implementations and clinical schemas were not edited.

## Confirmed production blocker

Read-only ownership metadata showed a persisted Balance Bridge (`bb3`) setup without `liveSession/controllerUid`, no controller lease, an active native staff owner, and an unexpired Display approval matching that owner. The deployed security rules exactly matched the repository.

Read-only requests to the real production database, restricted with `auth_variable_override`, returned:

- **401** for the existing Display identity reading its own approval.
- **200** for the approving staff identity reading that approval and lease metadata.

The Display rule correctly requires the canonical `controllerUid` to match its approver whenever a live session exists. The previous recovery helper returned immediately unless a matching lease already existed. The homepage does not acquire a game lease; closing a game window can remove its lease while leaving its canonical setup. Thus the helper skipped the necessary repair and approval renewal could not resolve the denial. The earlier test seeded a lease and missed this path.

These production requests exercised deployed rules and ownership metadata, not an owner browser token. No patient record, private session binding or game payload was requested in production. The owner's console capture was requested but has not been supplied; additional owner-specific errors cannot be ruled out without it.

## Browser reproduction and correction

The existing `a86f72d` production build was served locally without rebuilding. In Chrome on macOS, the test signed in through the real Firebase SDK, clicked the actual Display link, and reproduced the reported failure with the production-shaped no-lease state and unchanged production rules. Control remained signed in, staff persistence was present in the new Display window, and a staff approval was written. Display stayed failed; Chrome DevTools captured two Firebase `permission_denied` WebSocket responses. This distinguishes the reproduced failure from missing cross-window login storage.

The correction in `recoverDisplaySessionOwner.ts` accepts an absent lease only after validating the native session and proving its owner is the authenticated staff member. It then uses the existing protected `claimControllerLease()` before repairing only `controllerUid` and the revision. Existing rules reject a competing fresh owner. Foreign ownership, private legacy bindings and invalid sessions remain excluded. Native window ownership, heartbeat, gameplay, results and private patient binding remain unchanged.

`authClient.ts` and `displayAuthorization.ts` now log the failing authorization phase and a bounded Firebase error code. `displayAuthDiagnostics.ts` excludes raw messages, credentials, UIDs and database values. No additional login, token URL, password, pairing or QR step was added.

## Focused checks

- The new no-lease regression failed against the exact old helper and passed against the candidate.
- 43 focused unit tests passed for Firebase identity bootstrap, staff persistence, Display authorization, safe diagnostics and Display revision handling.
- The expanded ownership recovery emulator regression passed: absent and existing leases recover; foreign native/lease owners remain excluded; native data and private binding are preserved.
- Seven focused Display security emulator cases passed; four unrelated paid-TTS cases were deliberately excluded.
- Chrome checks passed against the candidate and its single production build: actual login and popup, silent authorization, real heartbeat, correct Balance Bridge rendering and manual start, Display reload, brief reconnect, Control reload, active second-tab isolation and unauthorized denial.
- TypeScript, scoped ESLint, whitespace checks and exactly one production build passed. No full game suites or endurance tests ran.

## Release boundary

Firebase rules need no update. No Vercel configuration change is indicated by this confirmed failure. All 22 registrations, YouTube, patient history and prior UX changes are preserved.

This is a locally verified candidate, not a claim that production is resolved. Full signed-in browser tests used isolated Auth/RTDB services with the deployed rules; the independent production evidence is the real server's restricted rule denial above. After explicit approval to release this local commit, the owner must sign in at the canonical production Control URL, click Display in the same Chrome profile, confirm its heartbeat and representative game, and confirm reload recovery. Use a synthetic session with no patient record selected. If the error remains, capture the sanitized `[display-auth]` phase/code and browser console errors. Owner confirmation is required before declaring resolution.
