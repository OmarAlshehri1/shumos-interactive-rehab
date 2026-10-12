
const NS = "demo-bq3-default-rtdb", DB = "http://127.0.0.1:9000", AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const put = (p, b) => fetch(`${DB}/${p}.json?ns=${NS}`, { method: "PUT", headers: owner, body: JSON.stringify(b) }).then((r) => r.status);
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/demo-bq3/accounts`, { method: "DELETE" });
await fetch(`${DB}/.json?ns=${NS}`, { method: "DELETE", headers: owner });
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "therapist@example.test", password: "password123", displayName: "أ. سارة", returnSecureToken: true }) });
const { localId } = await r.json();
console.log("staff", await put(`staff/${localId}`, { active: true, role: "therapist" }), "patient", await put("patients/patient-1", { patientNumber: "1001", firstName: "ليلى", createdAt: 1, updatedAt: 1, createdByUid: localId, active: true }), "uid", localId);
