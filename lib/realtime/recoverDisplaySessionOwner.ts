import { getAuth } from "firebase/auth";
import { type Database, get, ref, update } from "firebase/database";
import { parseLiveSessionValue } from "./sessionRepository";

/** Repair pre-authorization records without adopting their game or changing its window owner. */
export async function recoverDisplaySessionOwner(db: Database, uid: string): Promise<void> {
  const liveRef = ref(db, "liveSession");
  const [live, lease] = await Promise.all([get(liveRef), get(ref(db, "controllerLease/ownerId"))]);
  const raw = live.val();
  if (!raw || raw.controllerUid != null || lease.val() !== uid || getAuth(db.app).currentUser?.uid !== uid) return;
  const record = parseLiveSessionValue(raw);
  if (!record || !Number.isSafeInteger(raw.revision) || raw.revision < 0) return;
  const session = raw.session;
  const engine = session?.engine;
  if (typeof engine !== "string" || session[engine]?.ownerId !== uid) return;
  // In-record patient bindings require explicit staff recovery, never automatic exposure.
  if (raw.patientId != null) return;
  // Update only authorization metadata. Rewriting the whole session would also
  // revalidate its historic heartbeat and incorrectly require faking a new one.
  // Rules atomically recheck the CURRENT lease, native owner and increasing
  // revision. A concurrent publish wins; a stale revision is rejected safely.
  await update(liveRef, { controllerUid: uid, revision: raw.revision + 1 });
}
