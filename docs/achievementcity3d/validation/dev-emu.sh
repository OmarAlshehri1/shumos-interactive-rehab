#!/usr/bin/env bash
# Runs the app against the LOCAL Firebase emulators only (fake web config; the real .env.local is never read).
# Ports: Next 3743, RTDB emulator 19760, Auth emulator 19769, project demo-ac-rules.  usage: dev-emu.sh [dev|start]
cd "$(dirname "$0")/../../.."
export SHUMOS_BUILD_DIR=${AC_BUILD_DIR:-.next-ac-emu}
export NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-ac-rules.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-ac-rules-default-rtdb.firebaseio.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ac-rules
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-ac-rules.appspot.com NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1 NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19760 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19769
exec npx next "${1:-dev}" -p 3743 -H 127.0.0.1
