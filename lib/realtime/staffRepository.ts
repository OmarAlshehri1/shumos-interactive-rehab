import { get, ref } from "firebase/database";
import { getStaffDb } from "./firebaseClient";

/**
 * STAFF AUTHENTICATION FOUNDATION — the minimal staff-allowlist read. See
 * database.rules.json's `staff/$uid` node: a staff member can only ever
 * read their OWN record (`auth.uid === $uid`), which is exactly what this
 * needs — "is the account I just signed in as still active" — and nothing
 * more (no roster, no other staff member's data). Staff records are
 * created/edited manually in the Firebase Console for now (see the
 * report's "Manual Firebase Console steps"); this file never writes to
 * /staff — the client has no path to grant itself access.
 */
export async function isActiveStaff(uid: string): Promise<boolean> {
  const db = getStaffDb();
  const snapshot = await get(ref(db, `staff/${uid}/active`));
  return snapshot.val() === true;
}
