# Unified Shumos integration — local release gate

The final result stays on local `main`. No push, manual deployment, production environment change, or Firebase production rule publication is authorized in this phase.

## Reproduce local validation

Use an isolated Firebase Auth/Realtime Database emulator with project `demo-shumos-unified`, Auth `127.0.0.1:19949`, Database `127.0.0.1:19940`, Hub `19960`, and logging `19970`. Configure its database rules to the repository's `database.rules.json`. Do not point these scripts at Production.

- `python3 docs/unified-integration/validate-rules.py` loads the final rules into the suites' **demo** namespaces and clears this isolated project's demo accounts/fixtures. Run it before browser QA; it deliberately invalidates existing demo logins.
- `npx vitest run --maxWorkers=1` runs the applicable unit suite. Rules suites are opt-in and run separately above.
- `npx tsc --noEmit` and `npm run lint` check the application.
- `python3 docs/unified-integration/demo-runtime.py npm run build` builds all canonical games with fake emulator credentials and explicit feature flags. It overrides the Firebase configuration without changing `.env.local`.
- `python3 docs/unified-integration/demo-runtime.py npm run start -- --hostname 127.0.0.1 --port 3399` starts that production build on loopback.
- `PLAYWRIGHT_MODULE=/absolute/path/to/playwright node docs/unified-integration/browser.cjs` runs the unified browser test. It resets only the local demo namespace, uses separate Control/Display browser contexts, and intercepts speech upstream requests. Chromium uses the local graphics backend. Physical movement and audible speech are not simulated acceptance tests.

The browser test checks 19 unique canonical library registrations and all 19 Control routes with fresh live-record fixtures. It then runs the six new games under one real native parent visit, verifies pause/reload/resume, saves each real game result, verifies its parent reference and save-once behavior, and finishes the visit. Registration tests separately verify all 19 shared Display mappings. The Control calibration command is checked on a separate Display context.

`merge-game-rules.py` records the additive branch reconciliation approach. The committed final JSON additionally contains reviewed fixes for shared stage-result fields, settings shapes, early-ended Rhythm Steps history, all visit game IDs, and the existing presence-channel calibration command. The helper alone does not reproduce those later fixes; the matching final JSON files are the authoritative candidate for publication review.

Generated videos, raw sensor datasets, debug logs, build outputs, and most screenshots remain local and ignored. Only required application assets and thumbnail provenance sources are retained in Git.
