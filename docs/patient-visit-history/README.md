# Local patient visit history validation

Read [the implementation report](IMPLEMENTATION_REPORT.md) for behavior, schema, screenshots and release requirements.

All commands below use synthetic data only. The browser harness clears **only** the local `demo-shumos-unified-default-rtdb` namespace. Do not run it against a production endpoint; endpoints in the harness are fixed to loopback.

1. Run focused tests: `npx vitest run lib/therapyVisits/__tests__ lib/sessions/__tests__`.
2. Start the local emulators with Java 21: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home python3 docs/security-youtube/qa/start-emulators.py`.
3. Build using fake local configuration: `python3 docs/control-ux/demo-runtime.py npm run build`.
4. Serve that build: `python3 docs/control-ux/demo-runtime.py npm run start -- --hostname 127.0.0.1 --port 3399`.
5. Run `node docs/patient-visit-history/qa/browser.cjs`. Set `PLAYWRIGHT_MODULE` to a locally installed Playwright package if it is not installed in this repository. It creates synthetic staff and patients, runs the actual UI, and records ignored local screenshots/results.
6. After browser testing, run the shared local rules suites:

```sh
PLATFORM_DB_PORT=19940 PLATFORM_AUTH_PORT=19949 python3 docs/unified-integration/validate-rules.py \
  lib/realtime/__tests__/platformRules.emulator.test.ts \
  lib/therapyVisits/__tests__/rules.emulator.test.ts \
  lib/therapyVisits/__tests__/numberingRules.emulator.test.ts \
  lib/youtube/__tests__/rules.emulator.test.ts
```

The rules helper resets local demo authentication accounts, so do not run it concurrently with the browser harness. Run TypeScript, lint and the final build after any subsequent source changes. Stop only the validation processes you started, after verifying their PIDs and commands.
