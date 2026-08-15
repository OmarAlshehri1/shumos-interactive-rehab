import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { connectDatabaseEmulator, type Database, getDatabase } from "firebase/database";

/**
 * Firebase Web SDK bootstrap for Realtime Database + Anonymous Auth only
 * (no Firestore, Storage, Analytics, or Messaging — this app doesn't use
 * them). The Web config below is NOT a secret: Firebase's own docs are
 * explicit that this config is safe to ship in client bundles, because
 * access control is the job of Realtime Database Security Rules (see
 * database.rules.json) plus, as of Task 8, Firebase Authentication — not
 * config secrecy. MUNSIT_API_KEY is a real secret and lives entirely
 * server-side (app/api/tts/route.ts) — nothing here ever touches it.
 */
interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !databaseURL || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }
  return { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId };
}

let cachedConfig: FirebaseWebConfig | null | undefined;

function getConfig(): FirebaseWebConfig | null {
  if (cachedConfig === undefined) cachedConfig = readConfig();
  return cachedConfig;
}

/**
 * The one explicit switch between "this deployment talks to Firebase" and
 * "this deployment uses the local in-memory demo adapters" (lib/demo,
 * lib/control/useLocalControllerSession). Deliberately static — computed
 * once from which env vars are PRESENT, not from whether a connection
 * attempt currently succeeds. A production deployment that has Firebase
 * configured but is temporarily offline must show a disconnected state,
 * not silently fall back to a local single-device session — see the Task 6
 * report's "local demo adapters" section for why.
 */
export function isRealtimeEnabled(): boolean {
  return getConfig() !== null;
}

let app: FirebaseApp | null = null;

/**
 * Lazily initializes (once) and returns the shared Firebase app instance —
 * Auth and Realtime Database must share the same app so they agree on
 * which project they're talking to. Only called from within lib/realtime/
 * (firebaseClient.ts itself and authClient.ts) — no UI component or other
 * adapter should import firebase/app directly.
 */
export function getFirebaseApp(): FirebaseApp {
  const config = getConfig();
  if (!config) {
    throw new Error(
      "Firebase is not configured (missing NEXT_PUBLIC_FIREBASE_* env vars). " +
        "Check isRealtimeEnabled() before calling getFirebaseApp().",
    );
  }
  if (!app) {
    app = getApps().length > 0 ? getApps()[0]! : initializeApp(config);
  }
  return app;
}

let db: Database | null = null;
let emulatorConnected = false;

/**
 * Dev/test-only: point at the local RTDB emulator instead of the real
 * cloud project when explicitly requested. Unset in every real deployment
 * — see the report for how this was used to verify two-device sync
 * locally without touching the real clinic database. Exported so
 * authClient.ts can apply the equivalent switch for the Auth emulator.
 */
export function getEmulatorConfig(): { host: string; databasePort: number; authPort: number } | null {
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
  const databasePort = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT;
  const authPort = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT;
  if (!host || !databasePort || !authPort) return null;
  return { host, databasePort: Number(databasePort), authPort: Number(authPort) };
}

/**
 * Lazily initializes (once) and returns the Realtime Database instance.
 * Only ever called from lib/realtime/sessionRepository.ts — no UI component
 * or other adapter should import firebase/database directly.
 */
export function getRealtimeDb(): Database {
  if (!db) {
    db = getDatabase(getFirebaseApp());
  }

  const emulator = getEmulatorConfig();
  if (emulator && !emulatorConnected) {
    emulatorConnected = true;
    connectDatabaseEmulator(db, emulator.host, emulator.databasePort);
  }

  return db;
}
