import { describe, expect, it } from "vitest";
import { action, createState, guard, input } from "../gameplay";
import { applyManual, manualCommand } from "../manual";
import { buildQuestLiveSession, decodeAcceptedState, isBuildQuestLive, recoveredState, reviveBuildQuestLive, type BuildQuestLiveSession } from "../cloudState";
import { buildStoredBuildQuestSession, reviveBuildQuestHistory } from "../history";
import { STAGES } from "../stages";

/** What `rtdb` does to a value: Realtime Database drops nulls and empty arrays/objects on read-back. */
function rtdb<T>(value: T): T {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) { const items = v.map(strip); return items.length ? items : undefined; }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) { const r = strip(x); if (r !== null && r !== undefined) out[k] = r; }
      return Object.keys(out).length ? out : undefined;
    }
    return v;
  };
  return strip(JSON.parse(JSON.stringify(value))) as T;
}
function room(s = createState("cross-device-test")): BuildQuestLiveSession {
  return buildQuestLiveSession(s, "ليلى", "staff-1", { createdAt: 1000, startedAt: 1500, endedAt: 5000, startingStage: 0 }, { controlTabId: "tab-1", heartbeatAt: 5000 });
}
describe("manual cross-device contracts", () => {
  it.each(["mouse", "sensor", "controller"] as const)("completes all nine stages by manual input in %s mode", mode => {
    let s = createState("manual-nine-stages", 0, { ...createState("x").config, input: mode });
    for (const stage of STAGES) {
      s = action(s, "start");
      for (const p of stage.pieces) {
        s = applyManual(s, manualCommand(s, "select", p.id));
        const cmd = manualCommand(s, "place", p.id);
        s = applyManual(s, cmd);
        const count = s.events.length;
        s = applyManual(s, cmd);
        expect(s.events).toHaveLength(count);
        expect(s.placed).toContain(p.id);
      }
      expect(s.status).toBe("complete");
      s = action(s, "next");
    }
    expect(s.status).toBe("ended"); expect(s.completed).toHaveLength(9);
    expect(s.events).toHaveLength(STAGES.reduce((sum,t) => sum + t.pieces.length,0));
    expect(new Set(s.events.map(e => e.id)).size).toBe(s.events.length);
  });
  it("rejects stale stage/run commands after restart, and pauses without losing accepted progress", () => {
    let s = action(createState("manual-stale-events"), "start");
    const p = STAGES[0].pieces[0], cmd = manualCommand(s,"select",p.id);
    s = action(s,"restart"); s = action(s,"start");
    expect(applyManual(s,cmd)).toBe(s);
    s = applyManual(s,manualCommand(s,"select",p.id)); s = applyManual(s,manualCommand(s,"place",p.id));
    s = action(s,"pause"); expect(s.events).toHaveLength(1);
    expect(applyManual(s,manualCommand(s,"select",STAGES[0].pieces[1].id))).toBe(s);
    s = action(s,"resume"); s = input(s,null,33);
    s = applyManual(s,manualCommand(s,"select",STAGES[0].pieces[1].id));
    s = applyManual(s,manualCommand(s,"place",STAGES[0].pieces[1].id)); expect(s.status).toBe("complete");
    expect(guard(s).run).toBe(2);
  });
  it("serializes only accepted compact state into the shared record and rejects tampered or inconsistent records", () => {
    const s = createState("cross-device-test"), a = room(s);
    expect(a.build3.payload).not.toMatch(/"(pointer|hover|dwell|inputReady)"/);
    expect(a.build3.payload.length).toBeLessThan(32768);
    expect(a.config.childFirstName).toBe("ليلى");
    expect(isBuildQuestLive(a)).toBe(true);
    expect(decodeAcceptedState(a)?.stage).toBe(0);
    expect(decodeAcceptedState({ ...a, build3: { ...a.build3, stage: 4 } })).toBeNull();
    expect(decodeAcceptedState({ ...a, build3: { ...a.build3, placementCount: 3 } })).toBeNull();
    expect(decodeAcceptedState({ ...a, build3: { ...a.build3, payload: "x".repeat(32769) } })).toBeNull();
    expect(decodeAcceptedState({ ...a, sessionId: "short" })).toBeNull();
  });
  it("survives Realtime Database's null/empty-array stripping, records platform fields, and fails closed when malformed", () => {
    let s = action(createState("rtdb-roundtrip-session"), "start");
    s = applyManual(s, manualCommand(s, "select", STAGES[0].pieces[0].id));
    const back = reviveBuildQuestLive(rtdb(room(s)));
    expect(back).not.toBeNull();
    expect(back!.build3.controlTabId).toBe("tab-1");
    expect(back!.currentStage).toEqual({ stageNumber: 1, stageIndex: 0 });
    expect(decodeAcceptedState(back!)?.selected).toBe(STAGES[0].pieces[0].id);
    const bad = rtdb(room(s)) as unknown as { build3: { status: string } };
    expect(reviveBuildQuestLive({ ...bad, build3: { ...bad.build3, status: "ended" } })).toBeNull();
    expect(reviveBuildQuestLive({ engine: "bq3" })).toBeNull();
    expect(reviveBuildQuestLive(null)).toBeNull();
  });
  it("a recovered session comes back paused on a new run with all accepted progress, never auto-running", () => {
    let s = action(createState("recover-session-0001"), "start");
    s = applyManual(s, manualCommand(s, "select", STAGES[0].pieces[0].id));
    s = applyManual(s, manualCommand(s, "place", STAGES[0].pieces[0].id));
    expect(s.status).toBe("running");
    const r = recoveredState(room(s))!;
    expect(r.status).toBe("paused");
    expect(r.run).toBe(s.run + 1);
    expect(r.events).toEqual(s.events);
    expect(r.placed).toEqual(s.placed);
    // A command addressed to the old run is refused (stale/duplicate protection).
    expect(applyManual(r, manualCommand(s, "select", STAGES[0].pieces[1].id))).toBe(r);
    const resumed = action(r, "resume");
    expect(resumed.status).toBe("running");
    expect(resumed.events).toHaveLength(s.events.length);
  });
  it("uses a separate versioned history type and preserves empty-array RTDB recovery", () => {
    const r = room(action(createState("cross-device-test"),"end"));
    const record = buildStoredBuildQuestSession(r,"patient-1",0,"staff-1");
    expect(record.gameId).toBe("build-quest-3d");expect(record.resultVersion).toBe(1);
    const raw = { ...record,stageResults:undefined,bestStage:undefined };
    expect(reviveBuildQuestHistory(raw)?.stageResults).toEqual([]);
    expect(reviveBuildQuestHistory({ ...record,resultVersion:2 })).toBeNull();
    expect(reviveBuildQuestHistory({ ...record,gameId:"balloon-quest" })).toBeNull();
    expect(record).not.toHaveProperty("accuracy");
  });
  it("includes a skipped final stage in the authoritative result", () => {
    let s = createState("skip-all-nine-stages");
    for (let i=0;i<9;i++) s=action(s,"skip");
    expect(s.status).toBe("ended"); expect(s.skipped).toHaveLength(9);
    const record=buildStoredBuildQuestSession(room(s),"patient-1",0,"staff-1");
    expect(record.skippedStageCount).toBe(9);expect(record.stageResults).toHaveLength(9);
  });
});
