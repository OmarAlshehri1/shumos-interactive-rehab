/** Emulator-only: hardcoded loopback ports and a demo namespace prevent any write to a real project. Run with PLATFORM_RULES_EMULATOR=1. */
import { beforeAll, describe, expect, it } from "vitest";

const DB = `http://127.0.0.1:${process.env.PLATFORM_DB_PORT ?? "19000"}`;
const AUTH = `http://127.0.0.1:${process.env.PLATFORM_AUTH_PORT ?? "19099"}/identitytoolkit.googleapis.com/v1`;
const NS = "demo-rules-default-rtdb";
const on = process.env.PLATFORM_RULES_EMULATOR === "1";
const admin = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const url = (path: string, token = "") => `${DB}/${path}.json?ns=${NS}${token ? `&auth=${token}` : ""}`;
async function put(path: string, body: unknown, token = "", asAdmin = false) {
  const r = await fetch(url(path, token), { method: "PUT", headers: asAdmin ? admin : { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.status;
}
async function patch(path: string, body: unknown, token = "") {
  const r = await fetch(url(path, token), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.status;
}
async function get(path: string, token = "") {
  const r = await fetch(url(path, token));
  return { status: r.status, value: r.status === 200 ? await r.json() : null };
}
async function signup(email?: string) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(email ? { email, password: "password123" } : {}), returnSecureToken: true }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return { uid: j.localId as string, token: j.idToken as string };
}

const GAMES = ["balloon-quest", "follow-the-footsteps", "bubble-pop-wall", "space-pilot", "color-chase", "runner-quest-3d", "build-quest-3d"] as const;
const live = (gameId: string, sessionId: string, revision: number, over: Record<string, unknown> = {}) => ({
  gameId, sessionId, revision, updatedAt: { ".sv": "timestamp" }, lastInteraction: null,
  session: { sessionId, seed: 1, config: { childFirstName: "ليلى" }, gameState: "PLAYING", currentDifficulty: "EASY", currentStage: 1, createdAt: 1 }, ...over,
});
const base = (uid: string, pid: string, sid: string, gameId: string) => ({
  sessionId: sid, patientId: pid, gameId, startedAt: 100, completedAt: 200, createdByUid: uid,
  startingDifficulty: "EASY", startingStage: 1, endingDifficulty: "EASY", endingStage: 1, completedStageCount: 1, skippedStageCount: 0,
});
const LEGACY_HISTORY: Record<string, Record<string, unknown>> = {
  "balloon-quest": { totalCorrect: 3, totalIncorrect: 1 },
  "follow-the-footsteps": { totalStepsPresented: 5, totalStepsCompleted: 4 },
  "bubble-pop-wall": { totalTargetsPresented: 5, totalTargetsCompleted: 4, totalIncorrect: 1 },
  "feed-the-animals": { totalRoundsPresented: 5, totalRoundsCompleted: 4, totalIncorrect: 1 },
  "space-pilot": { totalStarsPresented: 5, totalStarsCollected: 4 },
  "color-chase": { totalTargetsPresented: 5, totalCorrect: 4, totalIncorrect: 1, totalDangerPresses: 0 },
};

describe.skipIf(!on)("Shared platform rules (Auth + RTDB emulator)", () => {
  let staff: { uid: string; token: string }, other: { uid: string; token: string }, inactive: { uid: string; token: string }, anon: { uid: string; token: string }, nonStaff: { uid: string; token: string };
  const PID = "pat-1";
  beforeAll(async () => {
    const t = Date.now();
    staff = await signup(`pf-a-${t}@example.test`); other = await signup(`pf-b-${t}@example.test`);
    inactive = await signup(`pf-c-${t}@example.test`); nonStaff = await signup(`pf-d-${t}@example.test`); anon = await signup();
    await put("", null, "", true);
    for (const u of [staff, other]) expect(await put(`staff/${u.uid}`, { active: true, role: "therapist" }, "", true)).toBe(200);
    expect(await put(`staff/${inactive.uid}`, { active: false, role: "therapist" }, "", true)).toBe(200);
    expect(await put(`patients/${PID}`, { patientNumber: "P1", firstName: "ليلى", createdAt: 1, updatedAt: 1, createdByUid: staff.uid, active: true }, "", true)).toBe(200);
  });

  it("active staff may write the live record; inactive staff, non-staff, anonymous and signed-out clients may not", async () => {
    await put("liveSession", null, "", true);
    for (const token of [inactive.token, nonStaff.token, anon.token, ""]) expect(await put("liveSession", live("balloon-quest", "s1", 10), token)).toBe(401);
    expect(await put("liveSession", live("balloon-quest", "s1", 10), staff.token)).toBe(200);
  });

  it("every registered game id publishes on the shared record; an unregistered id is rejected", async () => {
    await put("liveSession", null, "", true);
    let rev = 100;
    for (const g of GAMES) expect(await put("liveSession", live(g, `s-${g}`, ++rev), staff.token), g).toBe(200);
    expect(await put("liveSession", live("not-a-game", "x", ++rev), staff.token)).toBe(401);
    // Discontinued game cannot be recreated by an old/stale client.
    expect(await put("liveSession", live("feed-the-animals", "retired", ++rev), staff.token)).toBe(401);
    // Existing records from a discontinued client cannot be kept running with child updates.
    expect(await put("liveSession", live("feed-the-animals", "retired-old", ++rev), "", true)).toBe(200);
    expect(await patch("liveSession", { revision: ++rev }, staff.token)).toBe(401);
    // Authorized cleanup remains available; history is in a separate immutable tree.
    expect(await put("liveSession", null, staff.token)).toBe(200);
  });

  it("rejects stale and duplicate revisions and malformed records", async () => {
    await put("liveSession", null, "", true);
    expect(await put("liveSession", live("balloon-quest", "s", 50), staff.token)).toBe(200);
    expect(await put("liveSession", live("balloon-quest", "s", 50), staff.token)).toBe(401);
    expect(await put("liveSession", live("balloon-quest", "s", 49), staff.token)).toBe(401);
    expect(await put("liveSession", live("balloon-quest", "s", 51), staff.token)).toBe(200);
    expect(await put("liveSession", live("balloon-quest", "s", 52, { session: { sessionId: "s" } }), staff.token)).toBe(401);
    const longName = live("balloon-quest", "s", 53); longName.session.config.childFirstName = "x".repeat(31);
    expect(await put("liveSession", longName, staff.token)).toBe(401);
  });

  it("the anonymous Display may read the live record but never write it, and the record carries no patient identifier", async () => {
    await put("liveSession", null, "", true);
    expect(await put("liveSession", live("balloon-quest", "s", 5), staff.token)).toBe(200);
    expect((await get("liveSession", anon.token)).status).toBe(200);
    expect((await get("liveSession")).status).toBe(401);
    expect(await put("liveSession/revision", 99, anon.token)).toBe(401);
    expect(await patch("liveSession", { revision: 99 }, anon.token)).toBe(401);
    // an up-to-date client may not smuggle the patient id into the Display-readable record
    expect(await put("liveSession", live("balloon-quest", "s", 6, { patientId: PID }), staff.token)).toBe(401);
    expect(await put("liveSession/patientId", PID, staff.token)).toBe(401);
    expect(JSON.stringify((await get("liveSession", anon.token)).value)).not.toContain(PID);
  });

  it("patient metadata is confidential: the anonymous Display and inactive/non-staff users read none of it", async () => {
    const binding = { sessionId: "s", patientId: PID, updatedAt: { ".sv": "timestamp" } };
    expect(await put("liveSessionPrivate", binding, staff.token)).toBe(200);
    expect((await get("liveSessionPrivate", staff.token)).value.patientId).toBe(PID);
    for (const path of ["liveSessionPrivate", "patients", `patients/${PID}`, "patientNumbers", "sessions", `sessions/${PID}`, "staff", "controllerLease", "presence/controller"]) {
      for (const token of [anon.token, inactive.token, nonStaff.token, ""]) expect((await get(path, token)).status, `${path} / ${token.slice(0, 6)}`).toBe(401);
    }
    expect((await get("", anon.token)).status).toBe(401);
    for (const token of [anon.token, inactive.token, nonStaff.token, ""]) expect(await put("liveSessionPrivate", binding, token)).toBe(401);
    expect(await put(`patients/${PID}/firstName`, "x", anon.token)).toBe(401);
    // unknown fields on the binding are rejected
    expect(await put("liveSessionPrivate", { ...binding, note: "x" }, staff.token)).toBe(401);
    // a staff member reads only their own staff record
    expect((await get(`staff/${staff.uid}`, staff.token)).status).toBe(200);
    expect((await get(`staff/${other.uid}`, staff.token)).status).toBe(401);
    expect(await put(`staff/${anon.uid}`, { active: true, role: "admin" }, anon.token)).toBe(401);
    expect(await put(`staff/${staff.uid}/role`, "admin", staff.token)).toBe(401);
  });

  it("an atomic multi-location publish (record + binding) works for staff and is refused to everyone else", async () => {
    await put("", null, "", true);
    for (const u of [staff, other]) await put(`staff/${u.uid}`, { active: true, role: "therapist" }, "", true);
    await put(`staff/${inactive.uid}`, { active: false, role: "therapist" }, "", true);
    const rec = live("balloon-quest", "m1", 1);
    const body = { "liveSession/gameId": rec.gameId, "liveSession/sessionId": "m1", "liveSession/revision": 1, "liveSession/session": rec.session, "liveSession/lastInteraction": null, "liveSession/updatedAt": { ".sv": "timestamp" }, "liveSession/patientId": null, liveSessionPrivate: { sessionId: "m1", patientId: PID, updatedAt: { ".sv": "timestamp" } } };
    expect(await patch("", body, anon.token)).toBe(401);
    expect(await patch("", body, inactive.token)).toBe(401);
    expect(await patch("", body, staff.token)).toBe(200);
    expect((await get("liveSession", anon.token)).value.patientId).toBeUndefined();
    expect((await get("liveSessionPrivate", staff.token)).value.patientId).toBe(PID);
    // stale revision inside the atomic update is refused as a whole, and the binding is not changed
    expect(await patch("", { ...body, "liveSessionPrivate": { sessionId: "m1", patientId: "other", updatedAt: { ".sv": "timestamp" } } }, staff.token)).toBe(401);
    expect((await get("liveSessionPrivate", staff.token)).value.patientId).toBe(PID);
    // clear removes both
    expect(await patch("", { liveSession: null, liveSessionPrivate: null }, staff.token)).toBe(200);
    expect((await get("liveSession", staff.token)).value).toBeNull();
    expect((await get("liveSessionPrivate", staff.token)).value).toBeNull();
  });

  it("controller lease: owner refreshes, a second staff member is blocked until takeover is allowed by staleness, inactive staff never", async () => {
    await put("controllerLease", null, "", true);
    expect(await put("controllerLease", { ownerId: staff.uid, claimedAt: 1, updatedAt: { ".sv": "timestamp" } }, staff.token)).toBe(200);
    expect(await put("controllerLease", { ownerId: other.uid, claimedAt: 2, updatedAt: { ".sv": "timestamp" } }, other.token)).toBe(401);
    expect(await put("controllerLease", { ownerId: staff.uid, claimedAt: 1, updatedAt: { ".sv": "timestamp" } }, staff.token)).toBe(200);
    // forging someone else as owner is refused
    expect(await put("controllerLease", { ownerId: other.uid, claimedAt: 3, updatedAt: { ".sv": "timestamp" } }, staff.token)).toBe(401);
    // a stale lease (>45 s) may be taken over
    expect(await put("controllerLease", { ownerId: staff.uid, claimedAt: 1, updatedAt: Date.now() - 120000 }, "", true)).toBe(200);
    expect(await put("controllerLease", { ownerId: other.uid, claimedAt: 4, updatedAt: { ".sv": "timestamp" } }, other.token)).toBe(200);
    expect(await put("controllerLease", { ownerId: inactive.uid, claimedAt: 5, updatedAt: Date.now() }, inactive.token)).toBe(401);
    expect(await put("controllerLease", { ownerId: anon.uid, claimedAt: 5, updatedAt: Date.now() }, anon.token)).toBe(401);
  });

  it("presence: Display may only write presence/display (shape-checked); it can not touch controller presence", async () => {
    expect(await put("presence/display", { connected: true }, anon.token)).toBe(200);
    expect(await put("presence/display", { nothing: true }, anon.token)).toBe(401);
    expect(await put("presence/controller", { connected: true }, anon.token)).toBe(401);
    expect(await put("presence/controller", { connected: true }, staff.token)).toBe(200);
    expect(await put("presence/controller", { connected: true }, inactive.token)).toBe(401);
  });

  it("patient history for every legacy game: create-only, creator = caller, patient must match; overwrite, delete, forgery and anonymous writes are denied", async () => {
    for (const g of Object.keys(LEGACY_HISTORY)) {
      const sid = `h-${g}`;
      const rec = { ...base(staff.uid, PID, sid, g), ...LEGACY_HISTORY[g] };
      const path = `sessions/${PID}/${sid}`;
      expect(await put(path, rec, anon.token), `${g} anon`).toBe(401);
      expect(await put(path, rec, inactive.token), `${g} inactive`).toBe(401);
      expect(await put(path, { ...rec, createdByUid: other.uid }, staff.token), `${g} forged creator`).toBe(401);
      expect(await put(path, { ...rec, patientId: "someone-else" }, staff.token), `${g} wrong patient`).toBe(401);
      expect(await put(path, { ...rec, sessionId: "different" }, staff.token), `${g} wrong id`).toBe(401);
      expect(await put(path, { ...rec, unexpected: 1 }, staff.token), `${g} unknown field`).toBe(401);
      expect(await put(path, rec, staff.token), `${g} create`).toBe(200);
      expect(await put(path, { ...rec, totalCorrect: 99 }, staff.token), `${g} overwrite`).toBe(401);
      expect(await put(path, { ...rec, totalCorrect: 99 }, other.token), `${g} overwrite by other staff`).toBe(401);
      expect(await put(path, null, staff.token), `${g} delete`).toBe(401);
      expect(await patch(path, { completedStageCount: 9 }, staff.token), `${g} patch`).toBe(401);
      expect((await get(path, anon.token)).status).toBe(401);
      expect((await get(path, staff.token)).value.sessionId).toBe(sid);
    }
  });

  it("history is immutable except the creating therapist's note", async () => {
    const sid = "h-note";
    const rec = { ...base(staff.uid, PID, sid, "balloon-quest"), ...LEGACY_HISTORY["balloon-quest"] };
    const path = `sessions/${PID}/${sid}`;
    expect(await put(path, rec, staff.token)).toBe(200);
    expect(await put(`${path}/therapistNote`, "note", other.token)).toBe(401);
    expect(await put(`${path}/therapistNote`, "note", anon.token)).toBe(401);
    expect(await put(`${path}/therapistNote`, "note", staff.token)).toBe(200);
    expect(await put(`${path}/totalCorrect`, 50, staff.token)).toBe(401);
    expect(await put(`${path}/createdByUid`, other.uid, staff.token)).toBe(401);
  });

  it("patient registry: staff only, patient number is immutable and unique", async () => {
    expect(await put("patients/pat-2", { patientNumber: "P2", firstName: "علي", createdAt: 1, updatedAt: 1, createdByUid: staff.uid, active: true }, anon.token)).toBe(401);
    expect(await put("patients/pat-2", { patientNumber: "P2", firstName: "علي", createdAt: 1, updatedAt: 1, createdByUid: staff.uid, active: true }, staff.token)).toBe(200);
    expect(await put("patients/pat-2/patientNumber", "CHANGED", staff.token)).toBe(401);
    expect(await put("patientNumbers/p2", "pat-2", staff.token)).toBe(200);
    expect(await put("patientNumbers/p2", "pat-3", other.token)).toBe(401);
  });

  it("no permissive wildcard: unknown top-level nodes are unreadable and unwritable", async () => {
    for (const token of [staff.token, anon.token]) {
      expect(await put("anything", { x: 1 }, token)).toBe(401);
      expect((await get("anything", token)).status).toBe(401);
    }
  });
});
