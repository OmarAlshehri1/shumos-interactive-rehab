#!/usr/bin/env bash
# Local-only demo emulators. Never publishes rules.
set -e
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TASK_EMU_DIR=${AF_EMU_DIR:-/private/tmp/shumos-af-emulator}
mkdir -p "$TASK_EMU_DIR"
cp "$ROOT/database.rules.json" "$TASK_EMU_DIR/database.rules.json"
cat > "$TASK_EMU_DIR/firebase.json" <<'JSON'
{"database":{"rules":"database.rules.json"},"emulators":{"auth":{"port":19779},"database":{"port":19770},"ui":{"enabled":false},"hub":{"port":19771},"logging":{"port":19772}}}
JSON
export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
cd "$TASK_EMU_DIR"
exec npx --yes firebase-tools emulators:start --only auth,database --project demo-af-rules
