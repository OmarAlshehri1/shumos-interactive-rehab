import { describe, it, expect, vi } from "vitest";
import {
  createState,
  reduce,
  tokenFor,
  canConfirm,
  STAGES,
  widthFraction,
  DEFAULT_CONFIG,
  type State,
} from "../engine";
import { makeLive, decode, reviveBridgeLive, recoveredState } from "../live";
import { buildHistory, reviveBridgeHistory } from "../history";
import { assertFirebaseSafeValue } from "@/lib/dataIntegrity/numeric";
import { historyKeyForLive } from "@/lib/therapyVisits/gameSafety";
import type { LiveSessionRecord } from "@/lib/realtime/types";
function advance(s: State, ms: number) {
  let t = s.lastTick || 10000;
  s = reduce(s, { type: "tick", at: t });
  for (let i = 0; i < ms; i += 100) {
    t += 100;
    s = reduce(s, { type: "tick", at: t });
  }
  return s;
}
function start(s: State) {
  return advance(reduce(s, { type: "start" }), 3000);
}
describe("Balance Bridge authoritative progression", () => {
  it("all nine routes require confirmation; assists and skips preserve honest outcomes", () => {
    let s = createState("all-nine");
    for (let stage = 0; stage < 9; stage++) {
      expect(s.stage).toBe(stage);
      s = start(s);
      for (let i = 0; i < STAGES[stage].points.length; i++) {
        const token = tokenFor(s);
        const command =
          i === 1
            ? { type: "skip" as const, token }
            : { type: "confirm" as const, token, assisted: i === 2 };
        s = reduce(s, command);
        expect(reduce(s, command)).toBe(s);
      }
      expect(s.status).toBe("stage-complete");
      expect(s.results.find((r) => r.stage === stage)?.completed).toBe(false);
      s = reduce(s, { type: "next" });
    }
    s = reduce(s, { type: "end", at: Date.now() + 10000 });
    const h = buildHistory(s, "patient", "staff");
    expect(h.assistedCheckpoints).toBe(9);
    expect(h.skippedCheckpoints).toBe(9);
    expect(h.sessionCompleted).toBe(false);
    expect(reviveBridgeHistory(h)).not.toBeNull();
  });
  it("unassisted completion of all nine stages records complete session", () => {
    let s = createState("complete");
    for (let stage = 0; stage < 9; stage++) {
      s = start(s);
      while (s.status === "running")
        s = reduce(s, { type: "confirm", token: tokenFor(s), assisted: false });
      s = reduce(s, { type: "next" });
    }
    s = reduce(s, { type: "end", at: Date.now() });
    expect(buildHistory(s, "p", "u").sessionCompleted).toBe(true);
  });
  it("pauses and holds never automatically confirm checkpoints", () => {
    let s = reduce(createState("holds"), { type: "stage", stage: 1 });
    s = reduce(s, { type: "config", patch: { holdSeconds: 2 } });
    s = start(s);
    for (let i = 0; i < 2; i++)
      s = reduce(s, { type: "confirm", token: tokenFor(s), assisted: false });
    expect(canConfirm(s)).toBe(false);
    s = advance(s, 6000);
    expect(s.holdElapsed).toBe(0);
    s = reduce(s, { type: "begin-hold" });
    s = advance(s, 1000);
    s = reduce(s, { type: "pause" });
    const paused = s;
    s = advance(s, 9000);
    expect(s).toBe(paused);
    expect(reduce(s, { type: "skip", token: tokenFor(s) })).toBe(s);
    s = reduce(s, { type: "resume" });
    s = advance(s, 1000);
    expect(canConfirm(s)).toBe(true);
    expect(s.checkpoints[2].outcome).toBe("pending");
    s = reduce(s, { type: "confirm", token: tokenFor(s), assisted: true });
    expect(s.checkpoints[2].holdCompleted).toBe(true);
  });
  it("repetition and deviation invalidate stale confirmations, retain success and restart run identity", () => {
    let s = start(createState("retry"));
    const old = tokenFor(s);
    s = reduce(s, { type: "deviation" });
    expect(reduce(s, { type: "confirm", token: old, assisted: false })).toBe(s);
    s = reduce(s, { type: "repeat" });
    s = reduce(s, { type: "confirm", token: tokenFor(s), assisted: false });
    expect(s.checkpoints[0].attempts).toBe(2);
    s = reduce(s, { type: "end", at: Date.now() });
    expect(buildHistory(s, "p", "u").pathDeviations).toBe(1);
    s = reduce(s, { type: "restart" });
    expect(s.run).toBe(1);
    s = reduce(s, { type: "end", at: Date.now() });
    const h = buildHistory(s, "p", "u");
    expect(h.sessionId).toBe("retry-r1");
    const session = makeLive(s, "staff", "طفل", {
      controlTabId: "tab",
      heartbeatAt: Date.now(),
    });
    expect(
      historyKeyForLive({
        session,
        sessionId: s.sessionId,
      } as LiveSessionRecord),
    ).toBe(h.sessionId);
  });
  it("recovers running sessions paused and rejects forged payloads and history", () => {
    const s = start(createState("wire"));
    const live = makeLive(s, "u", "طفل", {
      controlTabId: "tab",
      heartbeatAt: Date.now(),
    });
    expect(() =>
      assertFirebaseSafeValue(
        makeLive(s, "u", "طفل", {
          controlTabId: "tab",
          heartbeatAt: Date.now(),
          takeoverFrom: undefined,
        }),
      ),
    ).not.toThrow();
    expect(reviveBridgeLive(live)).not.toBeNull();
    expect(decode(live)?.stage).toBe(0);
    expect(recoveredState(live)?.status).toBe("paused");
    const bad = {
      ...live,
      bb3: { ...live.bb3, payload: JSON.stringify({ ...s, active: 80 }) },
    };
    expect(decode(bad)).toBeNull();
    const h = buildHistory(
      reduce(s, { type: "end", at: Date.now() }),
      "p",
      "u",
    );
    expect(reviveBridgeHistory({ ...h, assistedCheckpoints: 40 })).toBeNull();
    expect(
      reviveBridgeHistory({
        ...h,
        stageResults: [
          { ...h.stageResults[0], config: { projection: "WALL" } },
        ],
      }),
    ).toBeNull();
  });
  it("uses measured field dimensions with rotation and letterboxing; uncalibrated width has no cm assumption", () => {
    expect(widthFraction(DEFAULT_CONFIG)).toBe(0.17);
    expect(
      widthFraction({
        ...DEFAULT_CONFIG,
        pathWidth: "custom",
        customWidthCm: 60,
        measuredWidthCm: 400,
        measuredHeightCm: 300,
      }),
    ).toBeCloseTo(60 / 393.75);
    expect(
      widthFraction({
        ...DEFAULT_CONFIG,
        pathWidth: "custom",
        customWidthCm: 60,
        measuredWidthCm: 400,
        measuredHeightCm: 300,
        rotation: 90,
      }),
    ).toBeCloseTo(60 / 225);
  });
  it("timer stalls do not silently fulfill a stance hold", () => {
    vi.useFakeTimers();
    let s = start(createState("stalled"));
    const elapsed = s.elapsed;
    s = reduce(s, { type: "tick", at: s.lastTick + 60000 });
    expect(s.elapsed - elapsed).toBe(250);
    vi.useRealTimers();
  });
});
