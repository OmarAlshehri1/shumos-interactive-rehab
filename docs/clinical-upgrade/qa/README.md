# Local QA reproduction

These scripts only address `127.0.0.1:3118` and the `demo-clinical-visits` Firebase emulators at ports 19970 (database) / 19979 (auth). They use synthetic data and clear their own demo visit/live-session fixtures. Run serially: Shumos has one shared active game and one Display presence.

Use an installed Playwright package via `SHUMOS_PLAYWRIGHT_MODULE` (or install Playwright in your test environment) and optionally an existing Chromium executable via `SHUMOS_CHROMIUM_PATH`. No dependency was added to the application for browser QA.

1. Start the database/auth emulators for `demo-clinical-visits` with `database.rules.json`. Use isolated hub/logging ports 19971/19972 if another emulator is running.
2. Run `CLINICAL_RULES_EMULATOR=1 npx vitest run lib/therapyVisits/__tests__/rules.emulator.test.ts`. This creates the local synthetic staff account and patients used by the browser scripts. Re-running the suite requires fresh auth emulator fixtures because its test email is intentionally fixed.
3. Start Next dev on port 3118 with `SHUMOS_BUILD_DIR=.next-clinical-dev`, `SHUMOS_TSCONFIG=docs/clinical-upgrade/tsconfig.validation.json`, and all `NEXT_PUBLIC_FIREBASE_*` values pointing to `demo-clinical-visits`. Set emulator host/ports using the existing `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_EMULATOR_PORT`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT` switches. Never run these tests against a production preview configuration.
4. Run `node docs/clinical-upgrade/qa/browser.cjs`, then `game-browser.cjs`, then `audio-browser.cjs` serially. Screenshots and JSON results go to `docs/clinical-upgrade/`.
5. Run `npx vitest run`, `npx tsc -p docs/clinical-upgrade/tsconfig.validation.json --noEmit`, changed-file ESLint, and an isolated `SHUMOS_BUILD_DIR=.next-clinical-build SHUMOS_TSCONFIG=docs/clinical-upgrade/tsconfig.validation.json npx next build`.

The validation config intentionally excludes stale default `.next` route validators. It extends the repository's actual TypeScript settings. Production builds still compile/check all application source. Next’s generated `next-env.d.ts` is a shared generated file; preserve another task’s initial content after isolated checks.
