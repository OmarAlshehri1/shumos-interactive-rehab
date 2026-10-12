# Local evidence commands

All emulator/browser evidence uses literal local endpoints and a `demo-castle` namespace. Never run these seed scripts against production. The scripts use this workstation's existing cached Playwright, with no added application dependency.

```sh
python3 docs/castlelegends3d/prepare-rules.py
npx vitest run --maxWorkers=4
npx tsc --noEmit -p tsconfig.castle.json
SHUMOS_BUILD_DIR=.next-castle-prod SHUMOS_TSCONFIG=tsconfig.castle.json npm run build
```

The browser tests used Next dev on 3387, Database emulator on 19921, Auth emulator on 19922, emulator project `demo-castle`, and Java 21. The private temporary Firebase config pointed its rules at the review candidate, never `database.rules.json` deployment. `SHUMOS_CASTLE_QA=1` enables the development-only renderer harness. `native-browser.cjs` seeds a fictitious local staff/patient, completes nine stages using actual Control, and checks shared history. `reliability.cjs` follows it with new-session, network and takeover checks. `security.cjs` uses authenticated/anonymous emulator identities for rejection checks. `browser.cjs` covers the renderer curriculum with accelerated QA ticks; `capture.cjs` records the thumbnail and a short frame-time sample.

`full-parallel-timeout.log` retains the initial CPU-contention timeout. `spacepilot-timeout-rerun.log` and `full-final.log` record the successful reruns. Skipped tests remain skipped; physical hardware and production deployment are not represented by these logs.
