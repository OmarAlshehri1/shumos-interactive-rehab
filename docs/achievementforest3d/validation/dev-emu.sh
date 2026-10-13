#!/usr/bin/env bash
# Runs the app against the LOCAL Firebase emulators only (fake web config; the real .env.local is never read).
# Ports: Next 3754, RTDB emulator 19770, Auth emulator 19779, project demo-af-rules.  usage: dev-emu.sh [dev|start]
cd "$(dirname "$0")/../../.."
export SHUMOS_BUILD_DIR=${AF_BUILD_DIR:-.next-forest}
export NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-af-rules.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-af-rules-default-rtdb.firebaseio.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-af-rules
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-af-rules.appspot.com NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1 NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19770 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19779
exec npx next "${1:-dev}" --webpack -p 3754 -H 127.0.0.1
