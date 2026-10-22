import { get, onValue, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getDisplayDb, getDisplayFirebaseApp, getStaffDb, isRealtimeEnabled } from "./firebaseClient";
import { getStaffIdToken, subscribeToStaffAuthState } from "./staffAuthClient";
import { markDisplayStartup } from "@/lib/display/startupTiming";
import { recoverDisplaySessionOwner } from "./recoverDisplaySessionOwner";
import { logDisplayAuthFailure } from "./displayAuthDiagnostics";

/** Scoped approval metadata for the existing anonymous Display identity, never a staff credential. */
export const DISPLAY_ACCESS_PATH = "presence/displayAccess";
export const DISPLAY_ACCESS_TTL_MS = 30 * 60 * 1000;
export const DISPLAY_ACCESS_REFRESH_MS = 60 * 1000;

type Approval = { approvedBy: string; issuedAt: number; expiresAt: number };

const watchers = new Map<string, { listeners: Set<(authorized: boolean) => void>; allowed: boolean; stop: () => void }>();
const suspendedStaff = new Set<string>();
const refreshers = new Set<() => void>();
const pendingApprovals = new Set<Promise<void>>();
let preparingStaff: Promise<void> | undefined;
let displayServerOffset = 0;
export function displayServerNow(): number { return Date.now() + displayServerOffset; }
let clockInFlight: Promise<number> | undefined;

function staffServerClock(): Promise<number> {
  return clockInFlight ??= (async () => {
    await new Promise<void>((resolve, reject) => {
      const stop = onValue(ref(getStaffDb(), ".info/connected"), snapshot => {
        if (snapshot.val() !== true) return;
        queueMicrotask(() => stop());
        resolve();
      }, reject);
    });
    const offset = await new Promise<unknown>((resolve, reject) => {
      onValue(ref(getStaffDb(), ".info/serverTimeOffset"), snapshot => resolve(snapshot.val()), reject, { onlyOnce: true });
    });
    if (typeof offset !== "number" || !Number.isFinite(offset)) throw Error("Server time unavailable");
    displayServerOffset = offset;
    markDisplayStartup("clock-ready");
    return offset;
  })().finally(() => { clockInFlight = undefined; });
}

/** Restore the existing staff credential while the independent Display identity initializes.
 * No extra auth listener, database read, approval, or sign-in is created here. */
export function prepareDisplayAuthorization(): void {
  preparingStaff ??= getStaffIdToken().then(async token => {
    markDisplayStartup("staff-ready");
    if (token) await staffServerClock();
  }).catch(() => {});
}

export function watchDisplayAuthorization(uid: string, callback: (authorized: boolean) => void): () => void {
  let entry = watchers.get(uid);
  if (!entry) {
    entry = { listeners: new Set(), allowed: false, stop: () => {} };
    watchers.set(uid, entry);
    const current = entry;
    entry.stop = startAuthorization(uid, allowed => {
      current.allowed = allowed;
      current.listeners.forEach(listener => listener(allowed));
    });
  }
  entry.listeners.add(callback);
  callback(entry.allowed);
  const current = entry;
  return () => {
    current.listeners.delete(callback);
    if (!current.listeners.size) { current.stop(); watchers.delete(uid); }
  };
}

function startAuthorization(uid: string, callback: (authorized: boolean) => void): () => void {
  let stopped = false, staffUid: string | null = null, busy = false;
  let approvalWritten = false;
  let canonicalOwner: unknown;
  let serverOffset = 0;
  let stopScope = () => {};
  let stopRead = () => {}, expiry: ReturnType<typeof setTimeout> | undefined;
  const displayRef = ref(getDisplayDb(), `${DISPLAY_ACCESS_PATH}/${uid}`);
  const report = (allowed: boolean) => { if (!stopped) callback(allowed); };
  const listen = () => {
    stopRead();
    stopRead = onValue(displayRef, snapshot => {
      clearTimeout(expiry);
      const approval = snapshot.val() as Approval | null;
      const remaining = approval ? approval.expiresAt - (Date.now() + serverOffset) : 0;
      report(remaining > 0);
      if (remaining > 0) markDisplayStartup("authorized");
      if (remaining > 0) expiry = setTimeout(() => report(false), remaining);
    }, error => {
      clearTimeout(expiry);
      if (approvalWritten) logDisplayAuthFailure("approval-read", error);
      report(false);
    });
  };
  const renew = async () => {
    if (stopped || busy) return;
    if (staffUid && suspendedStaff.has(staffUid)) { report(false); return; }
    if (!staffUid) { listen(); return; }
    busy = true;
    const owner = staffUid;
    let phase: "server-clock" | "session-owner" | "approval-write" = "server-clock";
    try {
      // Rules use server time. A fast device clock otherwise makes a nominal
      // 30-minute grant exceed the rules' 30-minute maximum and denies Display.
      // .info is a client-maintained subscription, not a server data path for get().
      // Wait for the handshake: the offset cache starts at zero on a new window.
      const [offset] = await Promise.all([
        staffServerClock(),
        Promise.resolve().then(async () => {
          if (stopped || staffUid !== owner || suspendedStaff.has(owner)) return;
          // Reuse the existing scope listener; only legacy ownership needs the
          // full saved session. Recovery and the server handshake run together.
          if (typeof canonicalOwner !== "string") {
            try { await recoverDisplaySessionOwner(getStaffDb(), owner); }
            catch (error) { phase = "session-owner"; throw error; }
          }
          markDisplayStartup("owner-ready");
        }),
      ]);
      serverOffset = offset;
      if (stopped || staffUid !== owner || suspendedStaff.has(owner)) return;
      // This write is checked by rules for active staff. No sign-in, credentials,
      // launch secrets, or pairing UI: reuse the therapist's persisted Firebase login.
      phase = "approval-write";
      const approvalWrite = set(ref(getStaffDb(), `${DISPLAY_ACCESS_PATH}/${uid}`), {
        approvedBy: owner, issuedAt: serverTimestamp(), expiresAt: Date.now() + serverOffset + DISPLAY_ACCESS_TTL_MS - 5000,
      });
      pendingApprovals.add(approvalWrite);
      try { await approvalWrite; approvalWritten = true; markDisplayStartup("approval-written"); } finally { pendingApprovals.delete(approvalWrite); }
      if (staffUid !== owner || suspendedStaff.has(owner)) {
        // A late approval must not survive a concurrent sign-out.
        await remove(displayRef).catch(() => {});
        return;
      }
      if (!stopped) listen();
    } catch (error) { logDisplayAuthFailure(phase, error); report(false); } finally { busy = false; }
  };
  listen();
  const stopStaff = subscribeToStaffAuthState(state => {
    if (state.status === "initializing") return;
    if (state.status === "failed") logDisplayAuthFailure("staff-session", null);
    const previousStaff = staffUid;
    stopScope();
    canonicalOwner = undefined;
    staffUid = state.status === "authenticated" ? state.uid : null;
    if (previousStaff && previousStaff !== staffUid) {
      // Firebase propagates sign-out across tabs. The Display may revoke only
      // its own approval, even after the staff credential has been discarded.
      report(false);
      void remove(displayRef).catch(() => {});
    }
    if (staffUid) {
      // Reuse existing ownership metadata to recover immediately after handoff,
      // publication, or switching media; no polling delay or authorization prompt.
      const scopeStops = ["controllerLease/ownerId", "liveSession/controllerUid", "presence/display/youtubeCommand/ownerId"]
        .map(path => onValue(ref(getStaffDb(), path), snapshot => {
          if (path === "liveSession/controllerUid") canonicalOwner = snapshot.val();
          void renew();
        }, () => report(false)));
      stopScope = () => scopeStops.forEach(stop => stop());
    }
    void renew();
  });
  const refresh = () => void renew();
  refreshers.add(refresh);
  const interval = setInterval(refresh, DISPLAY_ACCESS_REFRESH_MS);
  return () => { stopped = true; refreshers.delete(refresh); clearInterval(interval); clearTimeout(expiry); stopRead(); stopScope(); stopStaff(); };
}

/** Revoke grants before discarding the credential that is allowed to revoke them. */
export async function revokeDisplaysForStaff(uid: string): Promise<void> {
  suspendedStaff.add(uid);
  // Drain approvals started by this page before deleting; multiple Display consumers share one watcher.
  await Promise.allSettled([...pendingApprovals]);
  watchers.forEach(entry => { entry.allowed = false; entry.listeners.forEach(listener => listener(false)); });
  const db = getStaffDb();
  const snapshot = await get(ref(db, DISPLAY_ACCESS_PATH));
  const changes: Record<string, null> = {};
  snapshot.forEach(child => {
    if (child.child("approvedBy").val() === uid) changes[child.key!] = null;
  });
  if (Object.keys(changes).length) await update(ref(db, DISPLAY_ACCESS_PATH), changes);
}

/** The server re-verifies the token and authorization; no client-side claim is trusted. */
export async function getTtsIdToken(): Promise<string | null> {
  if (!isRealtimeEnabled()) return null;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/display")) {
    const auth = getAuth(getDisplayFirebaseApp());
    await auth.authStateReady();
    return auth.currentUser ? auth.currentUser.getIdToken() : null;
  }
  // Dynamic import prevents an initialization cycle with staffAuthClient's revocation.
  const { getStaffIdToken } = await import("./staffAuthClient");
  return getStaffIdToken();
}

/** Explicit successful staff sign-in can resume silent approval after sign-out. */
export function resumeDisplayApprovals(uid: string): void { suspendedStaff.delete(uid); refreshers.forEach(refresh => refresh()); }
