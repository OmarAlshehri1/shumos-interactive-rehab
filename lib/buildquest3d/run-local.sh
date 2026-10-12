#!/usr/bin/env bash
set -euo pipefail
buildquest_repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
buildquest_copy=$(mktemp -d /private/tmp/buildquest3d-local.XXXXXX)
rsync -a --exclude '.git' --exclude '.aws' --exclude '.codex' --exclude '.agents' --exclude '.next' --exclude 'node_modules' --exclude '.env*' --exclude 'docs' --exclude 'tools' --exclude '*.tsbuildinfo' --exclude '*.log' "$buildquest_repo/" "$buildquest_copy/"
ln -s "$buildquest_repo/node_modules" "$buildquest_copy/node_modules"
printf 'Build Quest local copy: %s\nControl: http://127.0.0.1:%s/control/build-quest-3d\n' "$buildquest_copy" "${BUILDQUEST_PORT:-3108}"
cd "$buildquest_copy"
exec env NEXT_PUBLIC_FIREBASE_API_KEY='' NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN='' NEXT_PUBLIC_FIREBASE_DATABASE_URL='' NEXT_PUBLIC_FIREBASE_PROJECT_ID='' NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='' NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID='' NEXT_PUBLIC_FIREBASE_APP_ID='' MUNSIT_API_KEY='' node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port "${BUILDQUEST_PORT:-3108}"
