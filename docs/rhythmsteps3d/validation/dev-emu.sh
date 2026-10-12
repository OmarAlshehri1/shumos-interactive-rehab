#!/usr/bin/env bash
# Runs the app against the LOCAL Firebase emulators only (fake web config; the real .env.local is never read).
# Ports: Next 3621, RTDB emulator 19500, Auth emulator 19599, project demo-rs-rules.
cd "$(dirname "$0")/../../.."
export SHUMOS_BUILD_DIR=${RS_BUILD_DIR:-.next-rs-emu}
export NEXT_PUBLIC_FIREBASE_API_KEY=fake NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-rs-rules.firebaseapp.com
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-rs-rules-default-rtdb.firebaseio.com NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-rs-rules
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-rs-rules.appspot.com NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1 NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=19500 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=19599
exec npx next "${1:-dev}" -p 3621 -H 127.0.0.1
