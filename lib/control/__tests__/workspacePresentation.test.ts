import { describe, expect, it } from "vitest";
import { createState, reduce } from "@/lib/castlelegends3d/engine";
import { makeLive } from "@/lib/castlelegends3d/live";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import { workspacePresentation } from "../workspacePresentation";
const game = "shumos-castle-legends-3d";
function record(started = false) {
  const state = started ? reduce(createState("synthetic"), { type: "start", at: 1000 }) : createState("synthetic");
  return { gameId: game, sessionId: state.sessionId, revision: 1, updatedAt: 1000, session: makeLive(state, "owner", "اختبار") } as LiveSessionRecord;
}
describe("therapist workspace lifecycle presentation", () => {
  it("keeps an obsolete never-started preview in setup without inventing a live session", () => {
    expect(workspacePresentation(record(), game).active).toBe(false);
    expect(workspacePresentation(record(true), game).active).toBe(true);
  });
  it("never adopts another game's active record", () => expect(workspacePresentation(record(true), "balance-bridge-3d").active).toBe(false));
  it("shows the native pause and cumulative game time without changing the record", () => {
    const r = record(true), raw = r.session as unknown as { castle3: { payload: string } };
    const state = JSON.parse(raw.castle3.payload); state.status = "paused"; state.elapsedMs = 65000;
    raw.castle3.payload = JSON.stringify(state);
    const before = JSON.stringify(r), info = workspacePresentation(r, game);
    expect(info).toMatchObject({ active: true, paused: true, status: "متوقف مؤقتًا", elapsed: "1:05", stage: "1", level: "سهل" });
    expect(JSON.stringify(r)).toBe(before);
  });
  it("returns completed results to the native results/save flow", () => {
    const r = record(true); r.session.gameState = "SESSION_COMPLETE" as never;
    expect(workspacePresentation(r, game).active).toBe(false);
  });
  it("presents a suspended native game as paused without changing clinical safety or its snapshot", () => {
    const r = record(true);
    r.gameId = "balloon-quest";
    const session = r.session as unknown as Record<string, unknown>;
    session.engine = "bq3";
    session.bq3 = { snapshot: JSON.stringify({ lifecycle: "suspended", suspendReason: "control-hidden" }) };
    const before = JSON.stringify(r);
    expect(workspacePresentation(r, r.gameId)).toMatchObject({ active: true, paused: true, status: "متوقف مؤقتًا" });
    expect(JSON.stringify(r)).toBe(before);
  });
  it("does not mistake a between-stage completion for running gameplay", () => {
    const r = record(true); r.session.gameState = "STAGE_COMPLETE" as never;
    expect(workspacePresentation(r, game).status).toBe("اكتملت المرحلة");
  });
  it("does not invent a stage below the three reward levels", () => {
    const r = record(true); r.gameId = "achievement-forest-3d";
    expect(workspacePresentation(r, r.gameId).stage).toBe("");
  });
  it("does not display a phase-only elapsed counter as total game time", () => {
    const r = record(true); const raw = r.session as unknown as { castle3: { payload: string } };
    const state = JSON.parse(raw.castle3.payload); delete state.elapsedMs; state.elapsed = 900;
    raw.castle3.payload = JSON.stringify(state);
    expect(workspacePresentation(r, game).elapsed).toBe("");
  });
  it("tolerates malformed native payloads without hiding safety controls", () => {
    const r = record(true), raw = r.session as unknown as { castle3: { payload: string } };
    for (const payload of ["null", "[]", "false", "invalid"]) {
      raw.castle3.payload = payload;
      expect(workspacePresentation(r, game)).toMatchObject({ active: true, elapsed: "" });
    }
  });
  it("keeps rollback controllers on their native UI instead of hiding unadapted controls", () => {
    const r = record(true); delete (r.session as unknown as Record<string, unknown>).engine;
    expect(workspacePresentation(r, game).active).toBe(false);
  });
});
