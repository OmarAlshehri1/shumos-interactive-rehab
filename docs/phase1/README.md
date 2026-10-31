# Phase 1 — native end-and-switch and manager backup sign-in

Continues from `97736dd` in the existing main checkout. No worktree, duplicate runtime, production account creation, deployment, push or Firebase rules publication.

## Game switching

Empty owned setups retire automatically through the existing transactional preview cleanup. Selecting another game needs no empty-preview confirmation and preserves its native configuration/difficulty controls.

Started activities use one centered, branded confirmation with exactly **إنهاء السابق وفتح الجديدة** and **رجوع**. Back cancels navigation without issuing an end command. Confirm invokes the registered controller's native end command; Balloon/Runner use their existing `endWithReason` with the genuine “CHANGE_ACTIVITY” reason selected by this action. Other adapters use the same end command as their own native buttons. No summary, score, attempt or rating is manufactured by the shared layer.

The visit/navigation providers remain mounted while only the conflicting native controller is withheld, and native mounting/navigation wait for the active visit to restore. Direct URL/reload entry retains its intended destination as well as intercepted links.

If the previous controller is no longer mounted, the flow restores the original saved patient, opens the existing native route automatically, recovers its snapshot through its existing paused recovery lifecycle and invokes its registered native end command. The therapist does not manually reopen the old game. Conflicting active-visit patient/tab ownership, another staff identity, unavailable recovery and changed session/run identity stop this process. Recovery preparation times out safely after 15 seconds; it never clears the unfinished activity to force navigation.

The original controller remains mounted until the canonical completed state, exact patient/game/run history proof and visit-review acknowledgment permit navigation. The requested internal destination retains its query/hash. A new controller is not mounted while the old controller is authoritative. Existing save-once persistence and visit linkage remain the only history paths. Optional evaluation still permits explicit closing without assigning a rating.

### Registered native adapters (20 canonical games)

| Canonical game | Native engine |
| --- | --- |
| Balloon Quest | bq3 |
| Follow the Footsteps | fp3 |
| Bubble Pop Wall | dome3 |
| Color Chase | cc3 |
| Runner Quest 3D | rq3 |
| Mirror Quest 3D | mirror3 |
| Safe Hex Arena 3D | hex3 |
| Rhythm Steps 3D | rs3 |
| Turn and Go 3D | tg3 |
| Foot Maze 3D | fm3 |
| Body Sequence 3D | bs3 |
| Balance Bridge 3D | bb3 |
| Blooming World 3D | bw3 |
| Harvest Valley 3D | hv3 |
| Shumos Castle Legends 3D | castle3 |
| Fire Rescue 3D | fr3 |
| Pearl Voyage 3D | pv3 |
| Achievement City | ac3 |
| Achievement Forest | af3 |
| Ocean Wonders | ow3 |

These adapters reuse native guarded commands and their history savers. They require connection, native ownership/readiness and a matching session. Games whose native history saver requires recordable activity register direct ending only after that native activity predicate is satisfied: Footsteps, Color Chase, Safe Hex, Rhythm Steps, Turn and Go, Foot Maze, Body Sequence and the three reward games. The bridge does not invent an empty history record for a zero-attempt run.

**Limitations:** Space Pilot and Build Quest retain native end/save controls; their specialist runtimes have no registered shared finalizer in this phase. Legacy rollback engines are not guessed from canonical route names. A live controller owned by another account/window is not forcibly taken over, nor is a conflicting visit reassigned. A native save failure keeps the destination blocked until the existing native save/recovery succeeds. These are reported exceptions, not silent deletion or a second session system. All 22 games remain registered and retain their original graphics, curricula, stages and scoring.

## Manager backup login

The glass login now offers **البريد وكلمة المرور** and **دخول المدير**. Each accepts its account's email/password, using the existing Firebase email/password authentication and the existing active-staff gate. Switching the visible method clears entered credentials and errors. There is no password-only endpoint, PIN, shared-secret fallback, public signup or new credential store. Passwords remain handled by Firebase; no manager password/email is hardcoded or preconfigured.

The backup is a **separate Firebase UID** with an independently chosen password. Forgetting or resetting the ordinary shared account's password does not require the manager to use it. The selected UI method does not elevate permissions: both entry points require an existing active staff identity. The manager mode is not an exclusive new administrative privilege boundary, and the application `admin` role is not a Firebase project IAM role.

New sign-ins now recheck staff activation even when the same UID previously signed out; prior asynchronous allowlist results cannot authorize a later sign-in cycle. An inactive/unapproved identity can leave its rejection screen: if Display revocation is denied, logout proceeds only after confirming that identity is inactive, whose grants are already unusable under existing rules. Active accounts and failed authorization reads still fail closed on revocation failure.

The manager cannot use this UI to overwrite/end another UID's unfinished clinical activity or impersonate that UID's therapy visit. Existing controller-lease, Display grant and per-visit ownership boundaries remain. The backup permits authorized manager access, not a forced takeover of unsaved staff work.

### Exact owner setup (production actions are NOT performed here)

1. An authorized Firebase project administrator opens the existing project's **Authentication → Users → Add user**. Use a distinct manager-controlled email and a long, unique password with letters, numbers and symbols, entered privately. The existing Email/Password provider must be enabled, as for ordinary staff. Do not create this account from the public application or reuse the shared account's UID/password.
2. Copy the manager's new Firebase Authentication UID.
3. In **Realtime Database → Data**, add an entry in the existing allowlist at `staff/<MANAGER_UID>`:

   ```json
   { "active": true, "role": "admin" }
   ```

   This is the existing schema. Never put the password in this record, source, `.env` or another database node.
4. Open Shumos, select **دخول المدير**, and enter that manager email/password. The manager can use these credentials independently during a forgotten-shared-password incident; no owner-supplied code is required per use. Actual therapist attribution and ownership use the manager's real UID.
5. To revoke access, set this existing entry's `active` to `false` and disable the Firebase Auth user as appropriate. Existing rules enforce inactive-staff rejection and invalidate grants approved by inactive staff. Future sign-ins recheck activation. This change does not add instant UI erasure of already displayed data or a new per-device authorization system.

The person performing setup needs trusted project administration permissions for Authentication user management and Realtime Database data writes, for example **Firebase Authentication Admin** (`roles/firebaseauth.admin`) plus **Firebase Realtime Database Admin** (`roles/firebasedatabase.admin`), with access to the intended project/console. A project owner/Firebase Admin already managing these resources can perform it. Do not grant those console IAM roles to the clinic manager merely to use Shumos: the app account needs only its authorized staff record. Client rules keep `staff/$uid` writes disabled, even for app-role `admin`; the public client cannot activate itself. [Official Firebase product IAM roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product), [Authentication IAM permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth).

## Verification

Synthetic accounts/patients in isolated loopback Auth/Realtime Database emulators only. No production accounts/data were created or activated. Browser TTS requests were intercepted. No physical sensors, full-game suite or endurance testing.

- **74 focused tests:** 55 shared lifecycle/auth/registry tests, 4 native-finalizer boundary tests, 1 visit-presentation test, 5 empty-setup/ownership emulator checks and 9 short save-once/Display/recovery integration checks.
- Real browser Firebase logins: ordinary staff, distinct authorized manager UID/password, wrong shared password for the manager, unapproved manager rejection, inactive-account logout, same-UID deactivation/reactivation, and no public registration.
- A separate manager browser context cannot mount/end the ordinary staff account's active native controller.
- Empty preview replacement and native difficulty selection; Back preserves the started activity; closing its browser page then directly opening a new game URL automatically recovers/ends the old native Balloon controller and opens Space Pilot after save/review. Exactly one result and one visit entry remain for that run; Display reload stays idle.
- Mounted Achievement Forest: two real native confirmations survive shared ending and create exactly one additional result/visit entry. Closing optional review leaves its rating absent/null.
- All 20 registrations are type checked and protected by the common matching-session/save gates. Browser gameplay smoke tests cover Balloon and Achievement Forest, not a complete run of every game.
- TypeScript, scoped ESLint, whitespace checks and the production build pass. Actual desktop/mobile login and shared-dialog screenshots are retained locally in `screenshots/` (ignored by Git); `browser-results.json` records browser outcomes.

QA helpers: `qa/local.cjs` (`dev`, `build`, `start`) and `qa/browser.cjs` (`SHUMOS_SWITCHING_BASE`, `PLAYWRIGHT_MODULE`). Existing focused scripts/tests are reused. Demo credentials and release switches apply only to QA child processes; `.env.local` is untouched. Test services are stopped after verification.

## Rules/schema and remaining work

No Firebase rules or schema changes and no new backend. The owner must manually provision the manager Auth user and its existing-format staff entry. No production account is silently installed. Space Pilot/Build Quest, legacy rollback variants, conflicting/foreign ownership and no-recordable-activity states retain their native safeguards. Unrelated files remain untouched. No push or deployment.
