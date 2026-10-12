# Local synthetic QA

These drivers target only the isolated demo project `demo-premium-shumos`, preview port 3128, database emulator port 19980 and auth emulator port 19989. They overwrite synthetic demo live/visit fixture paths; never point them at a real project. Paid TTS routes are blocked. Software WebGL is used for native scenes.

Run `generate-fixtures.ts` with the local TSX loader and `NODE_ENV=development` to include all locally enabled registry games. It writes `/tmp/shumos-premium-fixtures.json`. Start Next with `SHUMOS_BUILD_DIR=.next-premium-dev`, the existing validation tsconfig and demo Firebase emulator environment overrides. No `.env.local` edit is needed.

Set `PLAYWRIGHT_MODULE` to an installed Playwright module path and optionally `CHROMIUM_EXECUTABLE` to the testing Chromium binary. Run `node docs/premium-refinement/qa/browser.mjs`; use `SKIP_THUMBNAIL_CAPTURE=1` to refresh UI evidence while preserving the provenance image. After that driver completes, run `node docs/premium-refinement/qa/clinical-browser.mjs` separately. Both use the same single Display presence, so they must run serially.

The native clinical driver confirms pause-before-break, end/save acknowledgement, separate therapist evaluation, guarded navigation, immutable history linking and saved-result disclosure. It tests Balloon Quest, not all 14 full activity completions. The general driver tests all 14 setup adapters and a native Bubble Pop ready/running fixture.
