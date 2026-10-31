# Final login refinement and safe queued switching

Continues from local main `4b00287`. No worktree, second session system, production data access, push, deployment or Firebase rule publication.

## Implemented visual refinement

The login now serves the actual `public/brand/Highimagequilty-.PNG` unchanged, at its original 4800×3000 resolution. Next Image optimization is disabled for this background to avoid lossy re-encoding. Original SHA-256: `a8f8efa13fcbc3bc53944c6ae4b6a90188b7ec13455f45af424f720ce4532709`.

There is no added full-screen dark overlay, background blur, stretching or transform zoom. Responsive `object-fit: cover` preserves aspect ratio; narrow screens naturally crop the sides, with a different mobile focal position. Blur applies only behind the glass card. The default card uses a translucent dark gradient (roughly 22–45% tint), an 18px backdrop blur, a restrained border/shadow and readable white typography. An opaque fallback is limited to the user's reduced-transparency accessibility preference.

The floating upper-left brand card and generic shield are removed. A single official Shumos logo sits inside the centered form above “تسجيل الدخول”. Email/password login, visibility toggle, errors, loading state and password-manager autocomplete remain. The subtle VelonWeb logo/credit opens `https://velonweb.com` in a new tab. No public registration, cosmetic PIN form or public reset link was added.

## Manager emergency access: stopped at the requested security gate

**No second authentication method, four-digit PIN, PIN storage, app device enrollment, app lockout, device registry, revocation endpoint or new credential was implemented.** The login still performs the existing Firebase email/password authentication and staff authorization.

The current architecture persists a Firebase staff session in browser storage (`lib/realtime/staffAuthClient.ts`). A client PIN gate or encrypted local credential with browser-controlled attempt limits does not create a server-enforced device authorization boundary. An attacker can bypass application JavaScript or attack a four-digit local secret offline. There is no trusted device enrollment/verifier, per-device expiry/revocation policy or server-verified credential integration in this application.

WebAuthn supplies authenticator-backed public-key credentials; it does not expose a website-selected four-digit manager PIN for verification. A genuine in-app approved-device method would require a trusted verifier/authentication integration, enrollment and revocation policy, and Firebase authorization integration (potentially device claims/registry and rule enforcement). That is a separate security design and was not introduced silently. See the [WebAuthn specification](https://www.w3.org/TR/webauthn-3/).

### Smallest practical alternative and exact incident workflow

Recommended operational setup: provision the existing shared login in an OS-protected password manager on a manager-controlled clinic device. This is password autofill using the strong existing Firebase credential, not a second PIN credential or an app-enrolled device. Chrome can require Windows Hello on PC or the screen lock on Mac before autofill; this setting must be explicitly enabled. [Official Chrome instructions](https://support.google.com/chrome/answer/95606?hl=en).

1. **Prepare once:** an authorized administrator signs in with the existing staff account on the clinic device and saves the credential for the real Shumos origin in the manager's protected OS/browser profile. Enable device verification for password filling. Provision a manager-controlled recovery mailbox or delegated Firebase recovery authority before an incident; the owner remaining the sole recovery contact would leave a dependency that application code cannot remove.
2. **Staff forget the password:** the manager opens Shumos on that prepared device, chooses the saved credential in the email/password fields, authenticates to the OS using its PIN/biometrics, then presses “تسجيل الدخول”. The saved strong password is submitted to Firebase normally. The manager need not remember it or request a fresh code from the owner for each use. PIN length and lockout belong to the OS/device policy; the site cannot guarantee exactly four digits.
3. **Password changed or vault unavailable:** an administrator with the prearranged recovery authority requests the existing Firebase password reset, and the manager follows the email delivered to the account mailbox, updates the shared credential and updates the vault. The existing `requestStaffPasswordReset` helper is preserved; there is no new public reset control. [Firebase password recovery](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email).
4. **Device lost/replaced:** the clinic's device administrator locks/removes the old OS profile or wipes the managed device; an authorized Firebase administrator rotates the exposed shared credential and revokes sessions, then provisions the replacement through full Firebase login. A lost-device OS PIN alone cannot sign in from a new browser. [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions).

This alternative needs **no new Firebase rules/schema/backend code**, but it needs actual device/vault and recovery-access provisioning by the clinic. Those device settings were not changed or tested here. The application cannot detect whether that OS provisioning happened, so it does not display a misleading “approved device” badge or emergency-PIN tab. If neither a prepared vault nor manager-accessible recovery authority exists, independent emergency access is not currently available. Existing Firebase/Display revocation behavior remains unchanged; the proposal does not add per-device Firebase revocation to a shared account.

## Game switching: implemented compromise and explicit stop

Owned empty previews still retire automatically without warnings, history writes or obsolete Display playback. The existing transactional cleanup, ownership checks and exact game/patient/run save proof are preserved.

For a started activity, a guarded link now remembers the requested internal destination, including query/hash, while keeping the current native controller mounted. The therapist chooses “متابعة إنهاء النشاط”, ends through the game's native tools and saves or explicitly closes the existing optional clinical review. No rating or clinical field is fabricated. Navigation continues automatically only after the existing `canLeave` guard confirms the live save and visit requirements. The pending destination can be cancelled in the dialog or status notice. Removal/replacement of the original activity or a changed run invalidates the pending move; it cannot redirect a different controller. No second writer is mounted while save/evaluation is pending.

**Automatic native finalization and configuring a second setup while the old activity is pending were stopped.** They were not implemented or disguised as a renamed warning. The current safe compromise requires native ending/evaluation, then automatically continues the original navigation so the therapist does not select the destination twice.

The architecture investigation found:

- `ControlWorkspace` portals native controls; it has no shared awaitable finalize operation.
- Balloon/Runner runtime commands, Space Pilot's Firebase runtime and reward-game reducers have different end/save contracts. Some require an end reason; others construct different partial summaries. Unmounting a controller can dispose its publisher and trigger asynchronous history work, so unmount is not a reliable finalize-and-ack API.
- Native setup pages initialize publishers once the child is selected, before Start. Mounting another native setup while the old controller remains authoritative introduces competing writers.
- `VisitProvider` previously released its hold when a result was linked, before the review dialog was acknowledged. The production browser check caught this race. Review acknowledgment now lives in the provider, using the existing tab-scoped review IDs: linking alone cannot release the navigation hold. Saving or explicitly closing the optional review releases it. Automatically filling an evaluation would fabricate clinical input.

Immediate second-game configuration would require extracting controller-free setup views plus explicit finalize/save acknowledgments across native integrations and preserving the old controller's lifetime until completion. That is a substantial cross-game lifecycle refactor, not a safe navigation-guard toggle. No engine, scoring, stage, curriculum, sensor adapter, media transport or save-once history implementation was changed.

## Focused verification

Synthetic staff/patients and isolated loopback Auth/Database emulators only. Paid TTS is intercepted in browser QA. No physical device provisioning, full 22-game gameplay suite or endurance run.

- 53 focused unit tests: lifecycle/empty-setup classification, ownership, history keys, publisher behavior, existing Firebase login/reset and Display approval, plus visit-history presentation; the library test confirms all 22 canonical games.
- 5 setup/ownership emulator tests and 9 short save-once/Display/recovery integration tests.
- Browser: original 4800×3000 image, translucent surface and blur, one logo above the heading, no floating brand/shield, responsive desktop/tablet/mobile fit, VelonWeb target, password visibility, real Firebase error/success, empty setup switching and difficulty selection.
- Native started-game browser flow: cancel the modal request; cancel the pending banner; retain a third request; end natively; remain in the game during evaluation (including a 2.5-second delay beyond the save-proof polling interval); automatically navigate after saving. Exactly one history record and one linked visit activity remain. Display reload stays idle.
- TypeScript, scoped ESLint, whitespace checks and the final production build.

PIN input/wrong-attempt/lockout and manager device-enrollment/revocation tests are **not applicable** because that authentication portion was stopped. Existing Firebase/Display authorization tests do not imply a new manager-device access system.

Actual screenshots are retained locally under `screenshots/` (ignored by Git); `browser-results.json` records the final browser checks. Helpers are `qa/local.cjs` and `qa/browser.cjs`; the latter accepts `SHUMOS_SWITCHING_BASE` and `PLAYWRIGHT_MODULE`. Focused suites reuse `../game-switching/qa/checks.cjs`. Demo environment overrides and release flags apply only to QA child processes.

No Firebase schema/rules or backend changes. Test services are stopped after verification. Unrelated working-tree files are preserved.
