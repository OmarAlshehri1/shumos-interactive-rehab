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

/**
 * AUTH ISOLATION HARDENING — two entirely separate NAMED Firebase app
 * instances, one per surface, instead of one shared default app:
 *
 *   "staff"   — /control's real email/password staff identity
 *   "display" — /display's silent, limited anonymous identity
 *
 * Firebase's SDK memoizes `getAuth(app)`/`getDatabase(app)` PER APP
 * INSTANCE — two different named apps therefore always get two entirely
 * separate Auth objects (separate signed-in user, separate persisted
 * session) and two separate Database connections (each authenticating with
 * its OWN app's token), even though both talk to the exact same underlying
 * Firebase project/config.
 *
 * ROOT CAUSE this fixes: staffAuthClient.ts (staff) and authClient.ts
 * (display) both used to call `getAuth(getFirebaseApp())` against the SAME
 * default app — the exact same Auth object, not "deliberately separate" as
 * their own doc comments claimed. Next.js App Router's client-side
 * navigation keeps one JS/Auth-SDK context alive across route changes in
 * the same tab, so a therapist opening /control (signs in as staff), then
 * — same tab/profile — opening /display, had /display's onAuthStateChanged
 * fire immediately with the STAFF user and never call signInAnonymously():
 * the projector tab silently ran under the therapist's real UID. Two named
 * apps make that structurally impossible — /display's Auth instance has no
 * way to ever observe /control's signed-in user, in the same tab or not.
 *
 * Only called from within lib/realtime/ (this file, authClient.ts,
 * staffAuthClient.ts) — no UI component or other adapter should import
 * firebase/app directly.
 */
type FirebaseSurface = "staff" | "display";

const apps: Partial<Record<FirebaseSurface, FirebaseApp>> = {};

function getFirebaseApp(surface: FirebaseSurface): FirebaseApp {
  const config = getConfig();
  if (!config) {
    throw new Error(
      `Firebase is not configured (missing NEXT_PUBLIC_FIREBASE_* env vars). Check isRealtimeEnabled() before calling get${surface === "staff" ? "Staff" : "Display"}FirebaseApp().`,
    );
  }
  const appName = `shumos-${surface}`;
  if (!apps[surface]) {
    apps[surface] = getApps().find((existing) => existing.name === appName) ?? initializeApp(config, appName);
  }
  return apps[surface]!;
}

/** /control's staff Firebase app — the ONE app staffAuthClient.ts, staffRepository.ts, patientRepository.ts, and sessionHistoryRepository.ts ever touch. */
export function getStaffFirebaseApp(): FirebaseApp {
  return getFirebaseApp("staff");
}

/** /display's anonymous Firebase app — the ONE app authClient.ts ever touches. Never shares an Auth/Database instance with getStaffFirebaseApp() above. */
export function getDisplayFirebaseApp(): FirebaseApp {
  return getFirebaseApp("display");
}

const dbs: Partial<Record<FirebaseSurface, Database>> = {};
const emulatorConnected: Partial<Record<FirebaseSurface, boolean>> = {};

/**
 * Dev/test-only: point at the local RTDB emulator instead of the real
 * cloud project when explicitly requested. Unset in every real deployment
 * — see the report for how this was used to verify two-device sync
 * locally without touching the real clinic database. Exported so
 * authClient.ts/staffAuthClient.ts can apply the equivalent switch for the
 * Auth emulator.
 */
export function getEmulatorConfig(): { host: string; databasePort: number; authPort: number } | null {
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
  const databasePort = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT;
  const authPort = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT;
  if (!host || !databasePort || !authPort) return null;
  return { host, databasePort: Number(databasePort), authPort: Number(authPort) };
}

function getDb(surface: FirebaseSurface): Database {
  if (!dbs[surface]) {
    dbs[surface] = getDatabase(getFirebaseApp(surface));
  }
  const db = dbs[surface]!;
  const emulator = getEmulatorConfig();
  if (emulator && !emulatorConnected[surface]) {
    emulatorConnected[surface] = true;
    connectDatabaseEmulator(db, emulator.host, emulator.databasePort);
  }
  return db;
}

/**
 * The Realtime Database connection authenticated as the STAFF app — used by
 * lib/realtime/sessionRepository.ts's control-side calls, and by every
 * staff-only data layer (patientRepository.ts, staffRepository.ts,
 * sessionHistoryRepository.ts). Never passed to /display.
 */
export function getStaffDb(): Database {
  return getDb("staff");
}

/**
 * The Realtime Database connection authenticated as the DISPLAY app — used
 * by lib/realtime/sessionRepository.ts's display-side calls
 * (useRealtimeDisplaySession.ts, components/display/DisplayScreen.tsx).
 * Never passed to /control's staff-only reads/writes (patients, sessions,
 * staff, controllerLease, presence/controller are all rule-gated to active
 * staff anyway — this is defense in depth, not the only boundary).
 */
export function getDisplayDb(): Database {
  return getDb("display");
}
