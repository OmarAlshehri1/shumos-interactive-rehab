# Production rules verification and approved push gate

Release follow-up on 12 October 2026. The owner manually published the unified production Realtime Database rules and then authorized a normal push after verification. This supersedes the pending-publication/push status in the earlier local integration report.

## Read-only checks completed before push

- Firebase CLI read `/.settings/rules` from project `shumos-interactive-rehab`. Parsed deployed JSON exactly equals the approved `database.rules.json` and matching Console copy. Formatting of the returned JSON does not affect the comparison.
- Approved file SHA-256: `b52b8442b808df4df9e38b1ac0279ab6c4d615df942058bea0ec37cb6fb4d5ff`.
- Matching canonical parsed-JSON SHA-256: `50c53c4e01303162a6e4241a97c0f61dfdfdc611c5ff4bf1505723a81aadb58e`.
- Unauthenticated production GET probes for `patients`, `sessions`, `therapyVisits`, `activeTherapyVisits`, `liveSession`, and `presence/display` all returned HTTP 401. No patient response payload was read or stored.
- Production staff record keys and their `active` flags were read through the administrative CLI. Authorization data exists, uses the expected boolean shape, and includes active staff. These administrative reads bypass application security rules; authenticated application writes were not attempted in production.
- The publicly served production app returned HTTP 200. All seven public Firebase configuration fields match the local production configuration, and no demo-emulator configuration was found in the fetched client bundles. Production environment variables were not modified.
- A fresh fetch showed local `main` ahead of `origin/main` by the ten integrated commits, with zero remote-only commits and a clean worktree. Remote main was `e6aa5fda124646dc3e53e7c4d9651758a406ebb1`; the verified integration tip was `915af1163f71fcf3c2287996c094c47453d09474`.
- The approved application source and rule candidate remain unchanged from the release checks: 2,279 unit tests passed (149 skipped), 138 emulator security tests passed, TypeScript/lint/build passed, and the unified production browser flow passed. Exact deployed-rule equality means the emulator permission checks apply to the published policy; actual production authenticated write acceptance is inferred, not tested with patient writes.

GitHub shows a Vercel Production integration and a previously successful deployment for the old main commit. Pushing main may trigger its automatic deployment. No manual deployment command is authorized or used. Actual post-push status must be read from the new commit's GitHub/Vercel deployment records.

No production rules, patient data, live-session state, staff authorization data, or production configuration was changed by these verification commands. Optional game flags and physical hardware acceptance remain separate deployment/device concerns. No physical sensor, projector, or audible-audio acceptance is claimed.
