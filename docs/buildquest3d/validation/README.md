# Cross-device validation

All evidence here uses isolated demo Firebase Auth/Realtime Database emulators. Harnesses hardcode loopback database/auth endpoints and fake accounts. Do not redirect them to a real Firebase project. Chrome touch emulation is not physical iPad validation.

- `cross-device.mjs` → `cross-device.json`: development nine-stage manual workflow, independent Display, history, lifecycle/recovery and normalized sensor simulation; default origin port 3148.
- `production-cross-device.mjs` → `production-cross-device.json`: enabled production touch movement/placement and bounded denied-history recovery; default port 3158. Temporarily strengthens history-write denial only in its demo emulator and restores the full candidate rules.
- `rollback.mjs` → `rollback.json`: disabled production routes/authenticated library; port 3168.

Install/use Java 21 and Firebase CLI. Create an isolated emulator configuration with demo project `demo-buildquest`, Auth port 19099, Database port 19000, hub 19400, log 19450, UI disabled, and a copy of root `database.rules.json`. Start only Auth/Database. Existing agents may own 9000/9099; leave them alone.

Use a credential-free source snapshot and the existing dependencies. Public demo environment: fake API key; project/auth-domain `demo-buildquest`/`demo-buildquest.firebaseapp.com`; database URL `https://demo-buildquest-default-rtdb.firebaseio.com`; fake app ID/sender/storage values; `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1`, database port 19000, auth port 19099. Feature flag true for development/enabled production; false for rollback. Build/start snapshots with webpack. Never copy the real `.env.local` into a validation snapshot.

Run focused rules tests with `BUILD_QUEST_EMULATOR=1 npx vitest run lib/buildquest3d/__tests__/rules.emulator.test.ts`. These tests contain positive and negative assertions; all data is in the demo namespace. For the complete 1,725-test run, the isolated copies of the existing Balloon/Runner rules suites were redirected from 9000/9099 to 19000/19099 without changing their assertions or workspace originals. Load the complete candidate rules into their separate demo namespaces (`demo-bq3-default-rtdb`, `demo-rq3-default-rtdb`) via emulator-only admin REST, then run `BUILD_QUEST_EMULATOR=1 BQ3_RULES_EMULATOR=1 RQ3_RULES_EMULATOR=1 npm test` in the snapshot.

Browser harnesses use `PLAYWRIGHT_MODULE` if provided; their recorded local fallback is the installed Playwright package. They launch Chrome with WebGL and create separate contexts. Start the corresponding snapshot server first, then run `node docs/buildquest3d/validation/<harness>.mjs` from the repository root. Production history tests must not overlap rules fixtures that clear active markers or replace candidate emulator rules.

TypeScript, ESLint, both production builds and diff whitespace checks passed. The final Console rules copy matches the candidate tested by the emulators. No live rules publication or patient-data writes occurred.
