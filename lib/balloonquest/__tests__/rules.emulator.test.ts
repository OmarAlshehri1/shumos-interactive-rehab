/**
 * Security-rules compatibility for the redesigned Balloon Quest, run against the
 * Firebase Auth + Realtime Database EMULATORS with the project's UNCHANGED
 * database.rules.json. Skipped unless BQ3_RULES_EMULATOR=1 (see
 * docs/balloonquest3d/PHASE_B6_FINAL_REPORT.md for how to start the emulators).
 * Uses only the emulators' REST APIs; nothing here can reach a real project.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { Env } from "./harness";
import { buildLiveSession } from "../live";
import type { Message } from "../protocol";
import { buildStoredBalloonQuest3DSession } from "@/lib/sessions/buildStoredBalloonQuest3DSession";

const NS = "demo-bq3-default-rtdb";
const DB = `http://127.0.0.1:9000`;
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`;
const on = process.env.BQ3_RULES_EMULATOR === "1";

const url = (path: string, token?: string) => `${DB}/${path}.json?ns=${NS}${token ? `&auth=${token}` : ""}`;
const owner = { Authorization: "Bearer owner", "Content-Type": "application/json" };
async function put(path: string, body: unknown, token?: string, asOwner = false) {
  const r = await fetch(url(path, token), { method: "PUT", headers: asOwner ? owner : { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}
async function patch(path: string, body: unknown, token?: string) {
  const r = await fetch(url(path, token), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
}
async function signUp(email: string) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) });
  const j = (await r.json()) as { idToken: string; localId: string };
  return { token: j.idToken, uid: j.localId };
}

function liveRecords() {
  const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
  env.rt.command({ type: "new-session", difficulty: "ADVANCED", stage: 2 });
  env.addDisplay(); env.run(300);
  const snaps: Array<{ label: string; record: Record<string, unknown> }> = [];
  const snap = (label: string, rev: number) => {
    const state = env.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").pop()!;
    const clock = env.sent.filter((m): m is Extract<Message, { type: "clock" }> => m.type === "clock").pop() ?? null;
    const session = buildLiveSession({ state, clock, seed: env.rt.session.seed, createdAt: env.rt.session.sessionEpoch, childFirstName: "ليلى" });
    snaps.push({ label, record: { gameId: "balloon-quest", sessionId: state.sessionId, revision: rev, session, lastInteraction: null, updatedAt: { ".sv": "timestamp" } } });
  };
  snap("ready", 10);
  env.rt.command({ type: "start" }); env.run(3000); snap("playing", 11);
  env.rt.command({ type: "pause" }); snap("paused", 12);
  env.rt.command({ type: "resume" }); env.run(200);
  env.rt.command({ type: "end" }); snap("ended", 13);
  return { snaps, env };
}

describe.skipIf(!on)("Balloon Quest 3D against the unchanged security rules (emulator)", () => {
  let token = "", uid = "";
  beforeAll(async () => {
    ({ token, uid } = await signUp(`therapist${Date.now()}@example.test`));
    expect((await put(`staff/${uid}`, { active: true, role: "therapist" }, undefined, true)).status).toBe(200);
    await fetch(url("liveSession"), { method: "DELETE", headers: owner }); // idempotent: start from an empty live session
  });

  it("every lifecycle state of the live record is accepted, with strictly increasing revisions", async () => {
    const { snaps } = liveRecords();
    for (const { label, record } of snaps) {
      const r = await put("liveSession", JSON.parse(JSON.stringify(record)), token);
      expect(r.status, `${label}: ${r.text}`).toBe(200);
    }
  });

  it("the production publisher's multi-location update (what publishSession does) is accepted", async () => {
    const { snaps } = liveRecords();
    const rec = JSON.parse(JSON.stringify(snaps[1].record));
    rec.revision = 100;
    const r = await patch("liveSession", rec, token);
    expect(r.status, r.text).toBe(200);
    rec.revision = 101;
    rec.session.bq3.clock.seq = 7;
    expect((await patch("liveSession", rec, token)).status).toBe(200);
  });

  it("negative controls prove the rules are actually being applied", async () => {
    const { snaps } = liveRecords();
    const base = JSON.parse(JSON.stringify(snaps[1].record));
    base.revision = 200;
    expect((await put("liveSession", base, token)).status).toBe(200);
    const same = { ...base };
    expect((await put("liveSession", same, token)).status, "revision must increase").toBe(401);
    const noName = JSON.parse(JSON.stringify(base)); noName.revision = 201; noName.session.config.childFirstName = "";
    expect((await put("liveSession", noName, token)).status, "empty child name").toBe(401);
    const longName = JSON.parse(JSON.stringify(base)); longName.revision = 202; longName.session.config.childFirstName = "س".repeat(31);
    expect((await put("liveSession", longName, token)).status, "31-char name").toBe(401);
    const noStage = JSON.parse(JSON.stringify(base)); noStage.revision = 203; delete noStage.session.currentStage;
    expect((await put("liveSession", noStage, token)).status, "currentStage is required").toBe(401);
    const anon = JSON.parse(JSON.stringify(base)); anon.revision = 204;
    expect((await put("liveSession", anon)).status, "unauthenticated").toBe(401);
    const other = await signUp(`outsider${Date.now()}@example.test`);
    expect((await put("liveSession", anon, other.token)).status, "authenticated but not active staff").toBe(401);
  });

  it("history records are accepted under gameId balloon-quest; the stage-result marker is what carries the version", async () => {
    const pid = `patient-${Date.now()}`;
    const { env } = liveRecords();
    const summary = env.rt.session.summary!;
    const record = JSON.parse(JSON.stringify(buildStoredBalloonQuest3DSession({ summary, startIndex: 7, startedAt: env.rt.session.sessionEpoch, completedAt: env.rt.session.sessionEpoch + 60_000, patientId: pid, createdByUid: uid, therapistName: "أ. سارة" })));
    expect((await put(`patients/${pid}`, { patientNumber: "1", firstName: "ليلى", createdAt: 1, updatedAt: 1, createdByUid: uid, active: true }, token)).status).toBe(200);
    const ok = await put(`sessions/${pid}/${record.sessionId}`, record, token);
    expect(ok.status, ok.text).toBe(200);
    // A second session with one stage result carrying the marker is accepted as well (stageResults is free-form).
    const withStage = JSON.parse(JSON.stringify(record)); withStage.sessionId = "with-stage"; withStage.stageResults = [{ engine: "bq3", difficulty: "ADVANCED", stageNumber: 2, status: "COMPLETED", correct: 6, incorrect: 3, durationMs: 21000 }]; withStage.completedStageCount = 1;
    expect((await put(`sessions/${pid}/with-stage`, withStage, token)).status).toBe(200);
    // A NEW top-level version field would be rejected by the unchanged rules ("$other": false) — which is why the marker lives on the stage results.
    const topLevel = JSON.parse(JSON.stringify(withStage)); topLevel.sessionId = "top-level"; topLevel.engineVersion = 1;
    expect((await put(`sessions/${pid}/top-level`, topLevel, token)).status).toBe(401);
    // Immutability: an existing history record cannot be overwritten.
    expect((await put(`sessions/${pid}/${record.sessionId}`, record, token)).status).toBe(401);
    // A second RUN of the same session is stored under its own key and accepted.
    const run2 = JSON.parse(JSON.stringify(buildStoredBalloonQuest3DSession({ summary: { ...summary, runId: 2 }, startIndex: 7, startedAt: env.rt.session.sessionEpoch, completedAt: env.rt.session.sessionEpoch + 90_000, patientId: pid, createdByUid: uid })));
    expect(run2.sessionId).toBe(`${summary.sessionId}-r2`);
    expect((await put(`sessions/${pid}/${run2.sessionId}`, run2, token)).status).toBe(200);
    // Legacy five-stage shape still accepted (control).
    const legacy = { sessionId: "legacy-1", patientId: pid, gameId: "balloon-quest", startedAt: 1000, completedAt: 2000, createdByUid: uid, startingDifficulty: "MEDIUM", startingStage: 4, endingDifficulty: "MEDIUM", endingStage: 5, completedStageCount: 2, skippedStageCount: 0, totalCorrect: 6, totalIncorrect: 2, durationMs: 1000, stageResults: [{ difficulty: "MEDIUM", stageNumber: 4, status: "COMPLETED" }] };
    expect((await put(`sessions/${pid}/legacy-1`, legacy, token)).status).toBe(200);
    // Stage numbers beyond the rule's 1-5 bound are rejected (so 3-stage values are well inside it).
    const bad = JSON.parse(JSON.stringify(withStage)); bad.sessionId = "bad-stage"; bad.startingStage = 6;
    expect((await put(`sessions/${pid}/bad-stage`, bad, token)).status).toBe(401);
  });
});
