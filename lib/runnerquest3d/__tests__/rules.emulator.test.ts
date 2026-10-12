/**
 * Security-rules compatibility for Runner Quest 3D, run against the Firebase Auth + Realtime Database
 * EMULATORS with the CANDIDATE database.rules.json from this working tree. Skipped unless
 * RQ3_RULES_EMULATOR=1. Uses only the emulators' REST APIs on 127.0.0.1; nothing here can reach a real project.
 * How to start the emulators: docs/runnerquest3d/CROSS_DEVICE_INTEGRATION_REPORT.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ControlRuntime } from "../controlRuntime";
import { buildLiveSession } from "../live";
import type { Message } from "../protocol";
import { buildStoredRunnerQuestSession } from "@/lib/sessions/buildStoredRunnerQuestSession";

// Ports/project default to the original Runner emulator setup; override to run against an isolated emulator pair.
const NS = `${process.env.RQ3_PROJECT ?? "demo-rq3"}-default-rtdb`;
const DB = `http://127.0.0.1:${process.env.SHUMOS_RULES_DB_PORT ?? process.env.RQ3_DB_PORT ?? "9000"}`;
const AUTH = `http://127.0.0.1:${process.env.SHUMOS_RULES_AUTH_PORT ?? process.env.RQ3_AUTH_PORT ?? "9099"}/identitytoolkit.googleapis.com/v1`;
const on = process.env.RQ3_RULES_EMULATOR === "1";

const url = (path: string, token?: string) => `${DB}/${path}.json?ns=${NS}${token ? `&auth=${token}` : ""}`;
const json = { "Content-Type": "application/json" };
const owner = { Authorization: "Bearer owner", ...json };
async function put(path: string, body: unknown, token?: string, asOwner = false) {
  const r = await fetch(url(path, token), { method: "PUT", headers: asOwner ? owner : json, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}
async function patch(path: string, body: unknown, token?: string) {
  const r = await fetch(url(path, token), { method: "PATCH", headers: json, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}
async function get(path: string, token?: string) {
  const r = await fetch(url(path, token));
  return { status: r.status, body: await r.json().catch(() => null) as unknown };
}
async function signUp(email: string) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: json, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) });
  const j = (await r.json()) as { idToken: string; localId: string };
  return { token: j.idToken, uid: j.localId };
}
async function anonymous() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: json, body: JSON.stringify({ returnSecureToken: true }) });
  return ((await r.json()) as { idToken: string }).idToken;
}

function records(projection: "WALL" | "FLOOR" = "WALL") {
  let t = 1000;
  const sent: Message[] = [];
  const rt = new ControlRuntime({ now: () => t, wall: () => 1_700_000_000_000 + t, send: (m) => sent.push(m), ownerId: "uid", newId: (() => { let n = 0; return () => `id${++n}`; })(), seed: 3, startIndex: 3, endIndex: 4, projection, settings: { speed: 4.5 }, externalDisplayReady: () => true });
  const step = (ms: number) => { for (let i = 0; i < ms; i += 16) { t += 16; rt.tick(); } };
  step(32);
  const snaps: Array<{ label: string; record: Record<string, unknown> }> = [];
  const snap = (label: string, rev: number) => {
    const state = sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").pop()!;
    const clock = sent.filter((m): m is Extract<Message, { type: "clock" }> => m.type === "clock").pop() ?? null;
    snaps.push({ label, record: { gameId: "runner-quest-3d", sessionId: state.sessionId, revision: rev, session: buildLiveSession({ state, clock, seed: 3, createdAt: rt.session.sessionEpoch, childFirstName: "ليلى" }), lastInteraction: null, updatedAt: { ".sv": "timestamp" } } });
  };
  snap("ready", 10);
  rt.command({ type: "start" }); step(2500); snap("playing", 11);
  if (projection === "FLOOR") { rt.manual({ kind: "region", region: 1 }); rt.command({ type: "repeat" }); rt.command({ type: "assist" }); rt.command({ type: "skip-objective" }); }
  else rt.manual({ kind: "lane", dir: 1 });
  step(300); snap("manual-lane", 12);
  rt.command({ type: "pause" }); snap("paused", 13);
  rt.command({ type: "resume" }); step(200);
  rt.command({ type: "skip" }); snap("stage-complete", 14);
  rt.command({ type: "advance" }); rt.command({ type: "start" }); step(500);
  rt.command({ type: "end" }); snap("ended", 15);
  return { snaps, rt };
}

describe("candidate rules file", () => {
  it("whitelists runner-quest-3d for live sessions and history, in the candidate only", () => {
    const rules = readFileSync(join(__dirname, "../../../database.rules.json"), "utf8");
    expect(rules.match(/runner-quest-3d/g)?.length).toBeGreaterThanOrEqual(3);
    expect(() => JSON.parse(rules)).not.toThrow();
  });
});

describe.skipIf(!on)("Runner Quest 3D against the candidate security rules (emulator)", () => {
  let token = "", uid = "", nonStaffToken = "", displayToken = "";
  beforeAll(async () => {
    ({ token, uid } = await signUp(`therapist${Date.now()}@example.test`));
    nonStaffToken = (await signUp(`other${Date.now()}@example.test`)).token;
    displayToken = await anonymous();
    expect((await put(`staff/${uid}`, { active: true, role: "therapist" }, undefined, true)).status).toBe(200);
    await fetch(url("liveSession"), { method: "DELETE", headers: owner }); // idempotent: start from empty emulator data
    await fetch(url("sessions"), { method: "DELETE", headers: owner });
  });

  it("every lifecycle state of the live record is accepted (staff, strictly increasing revision)", async () => {
    for (const { label, record } of records().snaps) {
      const r = await patch("liveSession", record, token);
      expect(r.status, `${label}: ${r.text}`).toBe(200);
    }
  });
  it("the Display (anonymous) can read the record but cannot write", async () => {
    const read = await get("liveSession", displayToken);
    expect(read.status).toBe(200);
    expect((read.body as { gameId?: string }).gameId).toBe("runner-quest-3d");
    const w = await patch("liveSession", { revision: 999 }, displayToken);
    expect(w.status).toBe(401);
  });
  it("rejects: non-increasing revision, empty/long child name, unknown game id, non-staff and unauthenticated writers", async () => {
    const good = records().snaps[1].record as { revision: number; session: { config: { childFirstName: string } } };
    const cur = (await get("liveSession", token)).body as { revision: number };
    const base = { ...good, revision: cur.revision + 1 };
    expect((await patch("liveSession", { ...base, revision: cur.revision }, token)).status).toBe(401);
    expect((await patch("liveSession", { ...base, session: { ...good.session, config: { childFirstName: "" } } }, token)).status).toBe(401);
    expect((await patch("liveSession", { ...base, session: { ...good.session, config: { childFirstName: "x".repeat(31) } } }, token)).status).toBe(401);
    expect((await patch("liveSession", { ...base, gameId: "runner-quest-9" }, token)).status).toBe(401);
    expect((await patch("liveSession", base, nonStaffToken)).status).toBe(401);
    expect((await patch("liveSession", base)).status).toBe(401);
    expect((await patch("liveSession", base, token)).status).toBe(200); // control: the same payload by staff is fine
  });

  it("FLOOR: every lifecycle state of the live record is accepted (projection, floor block, objective outcomes)", async () => {
    const cur = (await get("liveSession", token)).body as { revision: number };
    let rev = cur.revision;
    for (const { label, record } of records("FLOOR").snaps) {
      const r = await patch("liveSession", { ...record, revision: ++rev }, token);
      expect(r.status, `${label}: ${r.text}`).toBe(200);
    }
    const stored = (await get("liveSession", token)).body as { session: { rq3: { state: { projection: string; floor: { total: number; outcomes: string } } } } };
    expect(stored.session.rq3.state.projection).toBe("FLOOR");
    expect(stored.session.rq3.state.floor.outcomes.length).toBe(stored.session.rq3.state.floor.total);
  });
  const floorSummaryFor = () => {
    const { rt } = records("FLOOR");
    return rt.session;
  };
  it("FLOOR: a version-2 history record (rows tagged FLOOR) is accepted once; a top-level projection field is not (rows carry it)", async () => {
    const s = floorSummaryFor();
    const rec = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: "floor-1", runId: 0, startIndex: s.startIndex, startedAt: 1, completedAt: 2, patientId: "patient-f", createdByUid: uid, inputSource: "MANUAL" });
    expect(rec.resultVersion).toBe(2);
    expect(rec.stageResults.every((r) => r.projection === "FLOOR")).toBe(true);
    expect((await put("sessions/patient-f/floor-1", { ...rec, projection: "FLOOR" }, token)).status).toBe(401);
    expect((await put("sessions/patient-f/floor-1", rec, token)).status).toBe(200);
    expect((await put("sessions/patient-f/floor-1", rec, token)).status).toBe(401);
  });
  it("a version-1 WALL record without projection fields is still accepted (old results are never reinterpreted)", async () => {
    const s = summaryFor();
    const rec = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: "v1-wall", runId: 0, startIndex: s.startIndex, startedAt: 1, completedAt: 2, patientId: "patient-v1", createdByUid: uid, inputSource: "MANUAL" });
    const v1 = { ...rec, resultVersion: 1, stageResults: rec.stageResults.map((row) => { const c: Record<string, unknown> = { ...row }; delete c.projection; delete c.objectivesSkipped; return c; }) };
    expect((await put("sessions/patient-v1/v1-wall", v1, token)).status).toBe(200);
  });

  const summaryFor = () => {
    const { rt } = records();
    if (!rt.session.summary) throw new Error("needs a summary");
    return rt.session;
  };
  it("a Runner Quest history record is accepted once; overwrite rejected; a second run gets its own key", async () => {
    const s = summaryFor();
    const rec = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: s.sessionId, runId: 0, startIndex: s.startIndex, startedAt: s.sessionEpoch, completedAt: s.sessionEpoch + 60000, patientId: "patient-1", createdByUid: uid, inputSource: "MANUAL" });
    const r1 = await put(`sessions/patient-1/${rec.sessionId}`, rec, token);
    expect(r1.status, r1.text).toBe(200);
    expect((await put(`sessions/patient-1/${rec.sessionId}`, rec, token)).status).toBe(401);
    const second = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: s.sessionId, runId: 1, startIndex: s.startIndex, startedAt: s.sessionEpoch, completedAt: s.sessionEpoch + 90000, patientId: "patient-1", createdByUid: uid, inputSource: "MANUAL" });
    expect(second.sessionId).toBe(`${s.sessionId}-r1`);
    expect((await put(`sessions/patient-1/${second.sessionId}`, second, token)).status).toBe(200);
  });
  it("rejects malformed Runner Quest history: missing result fields, unknown top-level field, wrong writer, bad stage numbers", async () => {
    const s = summaryFor();
    const base = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: "neg-1", runId: 0, startIndex: s.startIndex, startedAt: 1, completedAt: 2, patientId: "patient-2", createdByUid: uid, inputSource: "MANUAL" });
    const strip = (k: string) => { const c = { ...base } as Record<string, unknown>; delete c[k]; return c; };
    expect((await put("sessions/patient-2/neg-1", strip("totalStars"), token)).status).toBe(401);
    expect((await put("sessions/patient-2/neg-1", strip("resultVersion"), token)).status).toBe(401);
    expect((await put("sessions/patient-2/neg-1", { ...base, surprise: 1 }, token)).status).toBe(401);
    expect((await put("sessions/patient-2/neg-1", { ...base, createdByUid: "someone-else" }, token)).status).toBe(401);
    expect((await put("sessions/patient-2/neg-1", { ...base, startingStage: 9 }, token)).status).toBe(401);
    expect((await put("sessions/patient-2/neg-1", base, nonStaffToken)).status).toBe(401);
    expect((await put("sessions/patient-2/neg-1", base, token)).status).toBe(200);
  });
  it("legacy games are unaffected: a balloon-quest live record and a legacy history record are still accepted", async () => {
    const cur = (await get("liveSession", token)).body as { revision: number };
    const legacyLive = { gameId: "balloon-quest", sessionId: "legacy-1", revision: cur.revision + 1, session: { sessionId: "legacy-1", seed: 1, config: { childFirstName: "نور" }, gameState: "PLAYING", currentDifficulty: "EASY", currentStage: { stageNumber: 1 }, createdAt: 1 }, lastInteraction: null, patientId: null, updatedAt: { ".sv": "timestamp" } };
    expect((await patch("liveSession", legacyLive, token)).status).toBe(200);
    const legacyHistory = { sessionId: "old-1", patientId: "patient-3", gameId: "balloon-quest", startedAt: 1, completedAt: 2, createdByUid: uid, startingDifficulty: "EASY", startingStage: 1, endingDifficulty: "EASY", endingStage: 5, completedStageCount: 5, skippedStageCount: 0, totalCorrect: 20, totalIncorrect: 2, accuracy: 0.9, durationMs: 1000, averageReactionTimeMs: 900 };
    expect((await put("sessions/patient-3/old-1", legacyHistory, token)).status).toBe(200);
    // NOTE: the existing rules share ONE field list across games (a legacy record with another game's counter also validates today); that is pre-existing and unchanged.
  });
});
