# Control UX review and local QA

All commands below use loopback demo Firebase services. Never substitute the production project or production database URL. The runtime wrapper supplies fake Firebase configuration, enables the 19 canonical game flags, disables upstream speech, and writes the build to `.next-control-ux`.

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home npx firebase-tools emulators:start --only database,auth --project demo-shumos-unified --config docs/control-ux/firebase.demo.json
python3 docs/control-ux/demo-runtime.py npm run build
python3 docs/control-ux/demo-runtime.py npm run start -- --hostname 127.0.0.1 --port 3399
```

Run browser suites sequentially. They deliberately seed/reset only demo data. Set `PLAYWRIGHT_MODULE` to an installed Playwright package when it is outside this repository. Headful Chromium uses the Mac Metal backend for the existing 3D Display engines.

```sh
node docs/control-ux/qa/browser.cjs
node docs/control-ux/qa/start-all.cjs
QA_SKIP_ROUTES=1 node docs/control-ux/qa/integration-browser.cjs
python3 docs/unified-integration/validate-rules.py
npx vitest run --maxWorkers=4
npx tsc --noEmit
npm run lint
```

`evidence/` contains the actual before/after and responsive screenshots. `start-evidence/` and `integration-evidence/` contain browser reports. Generated evidence directories are intentionally ignored by Git and remain local; rerun the QA scripts to reproduce their reports. Optimized stage images in `public/control-stage-previews/` are application assets; their sources are recorded in `STAGE_IMAGE_PROVENANCE.json`.
