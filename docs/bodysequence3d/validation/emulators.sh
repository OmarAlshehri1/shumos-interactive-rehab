#!/usr/bin/env bash
# Starts isolated Firebase EMULATORS (RTDB 19610, Auth 19709, project demo-bs-rules) with the repo's database.rules.json copied into a scratch project dir.
# Needs Java 21: PATH includes /opt/homebrew/opt/openjdk@21/bin. Never touches production or the shared emulator ports other work may use.
set -e
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
P=${BS_EMU_DIR:-/tmp/bs/proj}
mkdir -p "$P"
sed 's#../../../database.rules.json#database.rules.json#' "$ROOT/docs/bodysequence3d/validation/firebase.emulator.json" > "$P/firebase.json"
cp "$ROOT/database.rules.json" "$P/database.rules.json"
export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
cd "$P" && exec npx firebase-tools emulators:start --only auth,database --project demo-bs-rules
