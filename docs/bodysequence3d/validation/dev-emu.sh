#!/usr/bin/env bash
# Runs the app against the LOCAL Firebase emulators only (fake web config; the real .env.local is never read).
# Ports: Next 3732, RTDB emulator 19610, Auth emulator 19709, project demo-bs-rules.  usage: dev-emu.sh [dev|start]
cd "$(dirname "$0")/../../.."
export SHUMOS_BUILD_DIR=${BS_BUILD_DIR:-.next-bs-emu}
export NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-bs-rules.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-bs-rules-default-rtdb.firebaseio.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-bs-rules
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-bs-rules.appspot.com NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1 NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19610 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19709
exec npx next "${1:-dev}" -p 3732 -H 127.0.0.1
