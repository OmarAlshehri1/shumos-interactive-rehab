# Game switching and Firebase-only login

The local implementation continues from `bbb45af` and `32afecb`. The owner approved a Firebase email/password-only login redesign after the four-digit access feasibility review.

## Result

- An owned, genuinely empty setup is retired automatically when navigating away or entering another route directly. No recovery warning or history record is created for that setup. Native window ownership is respected; Runner and the original controllers retain their existing account ownership model.
- Cleanup transactions tolerate Firebase's initially empty local cache, then compare and retry against the current server record. They recheck lifecycle, session identity and ownership. A Start that wins the race prevents preview deletion.
- Balloon Quest and Runner teardown now clear only their own session ID under the authenticated owner. Late cleanup cannot erase a newly opened game's live record or patient binding.
- A saved completion is removed from the live presentation when leaving its route, only after matching the exact game/patient/run history key. History is retained. Display reload does not revive a retired setup or completion.
- The login uses the supplied clinic background, centered glass card, official Shumos logo at upper-left, Arabic RTL fields, password visibility, generic Firebase errors and secondary VelonWeb logo/link. The requested marketing copy and public recovery link are removed. There is no public registration.
- `requestStaffPasswordReset` remains unchanged in `lib/realtime/staffAuthClient.ts` for administrator recovery use. Firebase identity, staff activation checks, persisted authentication, sign-out, Display approvals and authorization rules remain unchanged.

## Necessary started-game limitation

A started, paused or unsaved game must still finish through its own native end/save workflow, including the therapy-visit evaluation where applicable, before another game's controller can mount. The next game then opens normally with its native difficulty/settings controls.

Each native setup currently initializes a controller that can publish to the same `/liveSession` record as soon as a child is selected. Unmounting the old controller can also finalize it. Configuring a second native setup while the first game's clinical save is pending would therefore permit competing writers or interrupt the save owner. This implementation keeps the existing guard instead of introducing a second session system, discarding attempts or weakening Start protection. Other windows' active setups remain protected.

## Four-digit access security decision

PIN unlock was **stopped at the requested security gate**. No four-box credential UI, PIN hash, plaintext PIN, client lockout/backoff or alternate Firebase credential was added.

The existing browser-persisted Firebase staff session remains usable independently of a JavaScript PIN screen. A four-digit local secret plus browser-controlled attempt limits cannot enforce manager approval, expiry and revocation of that Firebase session. The repository has no trusted manager-device policy or server-verified PIN boundary. WebAuthn verification can use an authenticator's local verification but cannot promise a website-selected clinic four-digit code.

The owner then selected “Redesign login; retain Firebase only”. Full Firebase staff authentication is the implemented application access method. Managed-device OS locking with its PIN/biometrics is the proposed convenience alternative; device management/OS configuration was not performed by this change. PIN interaction, PIN attempt limiting and PIN recovery tests are consequently not applicable.

References: [Firebase Auth persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [WebAuthn specification](https://www.w3.org/TR/webauthn-3/).

## Focused validation

Only synthetic accounts and records in loopback Auth/Realtime Database emulators were used. Paid TTS requests were intercepted in browser checks. No physical sensors or long gameplay/endurance suites were run.

- 52 focused unit tests: lifecycle/empty-setup classification, account/window ownership, exact history keys, publishers, existing Firebase login/password recovery and Display approval behavior; category discovery asserts all 22 canonical games remain registered.
- 5 new emulator checks: empty live/private cleanup without history, late old teardown versus new setup, foreign-window preservation, Start versus cleanup, and rejection after staff sign-out.
- 9 short existing integration checks: private patient binding, approved Display reconnect, paused progress recovery, revision/lease enforcement, unsaved game versus media, save-once history with confirmed attempts and numbered therapy-visit retention. Its SDK-only Display fixture now explicitly supplies the same expiring approval required by the app; no authorization rule was weakened.
- Browser flow: empty Balloon setup → library → Space Pilot difficulty; direct Balance Bridge setup; native Balloon start → blocked conflicting navigation → native early end → clinical evaluation → saved result → library → Display reload idle. Exactly one saved activity and one linked visit entry remain, with no browser page errors.
- Production login screenshots at 1440×900, 820×1180, 390×844 and 320×640. Checked horizontal fit, centered card, logo placement, real Firebase failure/success, password toggle and VelonWeb link target.
- TypeScript, scoped ESLint, whitespace check and the final Next.js production build pass.

Reproduction helpers: `qa/checks.cjs`, `qa/local.cjs` (`dev`, `build`, `start`), and `qa/browser.cjs`. The browser helper accepts `SHUMOS_SWITCHING_BASE` and `PLAYWRIGHT_MODULE`. These helpers use fixed loopback demo endpoints and child-process release flags; they do not edit `.env.local` or release policy.

Local screenshots are retained in `screenshots/` (ignored by Git); `browser-results.json` records browser checks. Emulators and preview servers started for this task are stopped after verification.

## Scope

No Firebase schema/rules changes, deployment, push, production-data access, game engine/scoring changes, registry edits, sensor changes or media transport changes. Existing unrelated working-tree files are preserved.
