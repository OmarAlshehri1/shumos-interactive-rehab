# Local validation

Use a credential-free source snapshot of the **current working tree**, not HEAD: the shared platform baseline is uncommitted. Never copy `.env.local`, `.git`, `.next`, or production credentials into the snapshot. Reuse installed dependencies.

The captured run used Next.js production build/start with webpack, port 3120, Chrome on macOS, and Firebase Auth/Database emulators on loopback ports 19199/19100. Use fake Firebase web config with project `demo-mirror`, database URL `https://demo-mirror-default-rtdb.firebaseio.com`, `NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1`, `NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19100`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19199`, and `NEXT_PUBLIC_MIRROR_QUEST_3D=true`. Java 21 is required by the installed Firebase CLI.

`browser.mjs` seeds only the local `demo-mirror-default-rtdb` emulator namespace. It logs in real emulator staff accounts, uses independent staff/anonymous browser contexts, performs all 28 poses across nine stages with limb sliders, and records screenshots, video, fallback, history, recovery, ownership and rendering metrics. Set `MIRROR_BASE`, `MIRROR_EVIDENCE`, `PLAYWRIGHT_MODULE`, and `PLAYWRIGHT_BROWSERS_PATH` for another machine. No application test bypass, fabricated screenshots, BroadcastChannel game transport, or production data is used.

Commands in the original source tree:

```sh
npx tsc --noEmit
npm run lint
npm test
MIRROR_RULES_EMULATOR=1 npx vitest run lib/mirrorquest3d/__tests__/rules.emulator.test.ts
PLATFORM_RULES_EMULATOR=1 PLATFORM_DB_PORT=19100 PLATFORM_AUTH_PORT=19199 npx vitest run lib/realtime/__tests__/platformRules.emulator.test.ts
node docs/mirrorquest3d/validation/browser.mjs
```

Load the candidate `database.rules.json` into each **local** test namespace through the emulator admin endpoint `http://127.0.0.1:19100/.settings/rules.json?ns=...` before rules tests. Namespaces: `demo-mirror-default-rtdb` (browser), `demo-mirror-rules-default-rtdb` (Mirror rules), `demo-rules-default-rtdb` (shared platform rules). A secondary emulator namespace otherwise starts with permissive default rules and cannot provide valid security-test evidence. Use different namespaces to prevent parallel fixtures from overwriting live browser sessions.

Production availability is opt-in with `NEXT_PUBLIC_MIRROR_QUEST_3D=true`. Development enables the card unless explicitly false. Physical WT901 pose recognition is unavailable in both cases; this flag only enables the software game. Candidate rules have not been published to Firebase.
