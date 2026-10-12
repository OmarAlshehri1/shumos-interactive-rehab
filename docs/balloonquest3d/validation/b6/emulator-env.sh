# Emulator-only environment for the release-candidate copy. No real Firebase config is copied into the scratch tree.
export NEXT_PUBLIC_FIREBASE_API_KEY=fake-key
export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
export NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://demo-bq3-default-rtdb.firebaseio.com
export NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-bq3
export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-bq3.appspot.com
export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1
export NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
export NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1
export NEXT_PUBLIC_FIREBASE_EMULATOR_PORT=9000
export NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=9099
export MUNSIT_TTS_ENABLED=false
export MUNSIT_API_KEY=
