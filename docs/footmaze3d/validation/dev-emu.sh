#!/usr/bin/env bash
# Runs the app against the LOCAL Firebase emulators only (fake web config; the real .env.local is never read).
# Ports: Next 3660, RTDB emulator 19660, Auth emulator 19669, project demo-fm-rules.  usage: dev-emu.sh [dev|start]
cd "$(dirname "$0")/../../.."
export SHUMOS_BUILD_DIR=${FM_BUILD_DIR:-.next-fm-emu}
export NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-fm-rules.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-fm-rules-default-rtdb.firebaseio.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-fm-rules
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-fm-rules.appspot.com NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1 NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19660 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19669
exec npx next "${1:-dev}" -p "${FM_PORT:-3662}" -H 127.0.0.1
