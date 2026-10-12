# Validation evidence and reproduction

Run from the repository root. The scripts are local browser tests, not production tools. They open independent Chrome windows, operate experimental controls, simulate the existing RIGHT_HAND BroadcastChannel and assert authoritative results. They do not use physical Bluetooth.

Automated checks:

```sh
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Browser execution requires Playwright to be available and Google Chrome installed. Set `PLAYWRIGHT_MODULE` to a locally installed Playwright ESM entry if it is not resolvable from this repository; no Playwright package was added to the app. The default Chrome executable in these scripts is the local macOS installation. Adapt that path on another machine.

For these automated runs the server used the application's existing unconfigured-Firebase local demo mode, with a **process-only** environment override:

```sh
env NEXT_PUBLIC_FIREBASE_API_KEY='' npm run dev -- --hostname 127.0.0.1
```

Do not modify `.env.local` or authentication source code. Stop that test server and restart ordinary `npm run dev` afterward. The working development server was restored to its normal configured environment at handoff.

```sh
node docs/spacepilot3d/validation/phase05-ownership.mjs
node docs/spacepilot3d/validation/phase06-browser.mjs
node docs/spacepilot3d/validation/phase07-difficulties.mjs
node docs/spacepilot3d/validation/phase07-performance.mjs
node docs/spacepilot3d/validation/phase07-tiers.mjs
```

Run browser performance checks alone, without another browser benchmark or build competing for the GPU/CPU. The performance script disables Playwright focus emulation and its three background-throttling override flags, explicitly cycles actual window focus, asserts `document.hasFocus()`, and records metrics with Control and Display both visible. Each steady sample covers the latest 240 frame intervals after a 6–6.5 second settling period. It also tests context loss, three Display reloads, failed model loading and recovery. `phase07-performance.json` is the final passing run; the `.txt` files are corresponding console evidence.

The full-browser script uses injected duplicate/outdated messages and a second Display to test authority guards. Its CDP freeze scenario also suppresses outgoing Control messages because the freeze command alone did not stop communication reliably on this Chrome/macOS combination; do not interpret that scenario as independent proof of browser freezing. Actual window minimization and a blocked main thread are separate tests.

Screenshots were captured from the real experimental Display and Control. They are unretouched browser captures. Files named `phase06-*` include earlier visual-review iterations; the final report points to representative `phase07-*` images. A medium-difficulty mission-3 capture omitted some static composited content; the LOW mission-3 capture contains the full HUD and planet and is the representative final image. No reference image was used as gameplay content.
