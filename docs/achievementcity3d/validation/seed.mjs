// Seeds the Firebase EMULATORS ONLY (127.0.0.1) with one staff therapist, one non-staff user and one test patient.
// Ports/project are the Achievement City validation emulators (never the shared 9000/9099 ones other agents may use).
export const DBP = process.env.AC_DB_PORT ?? 19760, AUTHP = process.env.AC_AUTH_PORT ?? 19769, PROJECT = "demo-ac-rules";
export const NS = `${PROJECT}-default-rtdb`, DB = `http://127.0.0.1:${DBP}`, AUTH = `http://127.0.0.1:${AUTHP}/identitytoolkit.googleapis.com/v1`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
export const put = (p, b) => fetch(`${DB}/${p}.json?ns=${NS}`, { method: "PUT", headers: owner, body: JSON.stringify(b) }).then((r) => r.status);
export async function seed() {
  await fetch(`http://127.0.0.1:${AUTHP}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  await fetch(`${DB}/.json?ns=${NS}`, { method: "DELETE", headers: owner });
  const signUp = async (email, displayName) => (await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", displayName, returnSecureToken: true }) })).json()).localId;
  const uid = await signUp("therapist@example.test", "أ. سارة");
  const other = await signUp("outsider@example.test", "زائر");
  console.log("staff", await put(`staff/${uid}`, { active: true, role: "therapist" }), "patient", await put("patients/patient-1", { patientNumber: "1001", firstName: "ليلى", createdAt: 1, updatedAt: 1, createdByUid: uid, active: true }), "uid", uid, "outsider", other);
}
import { pathToFileURL } from "node:url";
if (import.meta.url === pathToFileURL(process.argv[1]).href) await seed();
