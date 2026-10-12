#!/usr/bin/env bash
# Runs the app against the LOCAL Firebase emulators only (fake web config; the real .env.local is never read).
# Ports: Next 3632, RTDB emulator 19510, Auth emulator 19609, project demo-tg-rules.  usage: dev-emu.sh [dev|start]
cd "$(dirname "$0")/../../.."
export SHUMOS_BUILD_DIR=${TG_BUILD_DIR:-.next-tg-emu}
export NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-tg-rules.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-tg-rules-default-rtdb.firebaseio.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-tg-rules
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-tg-rules.appspot.com NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1 NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19510 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19609
exec npx next "${1:-dev}" -p 3632 -H 127.0.0.1
