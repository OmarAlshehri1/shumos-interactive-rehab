import { describe, it, expect } from "vitest";
import {
  historyKeyForLive,
  confirmedLiveResult,
  visitGamePaused,
  ownedByTab,
  isUnstartedActivity,
} from "../gameSafety";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import type { AnyStoredSession } from "@/lib/sessions/types";
const live = (
  engine = "mirror3",
  run = 0,
  gameState = "SESSION_COMPLETE",
): LiveSessionRecord =>
  ({
    gameId: "mirror-quest-3d",
    sessionId: "game-1",
    patientId: "patient-1",
    session: {
      engine,
      gameState,
      [engine]: {
        payload: JSON.stringify({ run, status: "ended" }),
        controlTabId: "tab-1",
      },
    },
  }) as unknown as LiveSessionRecord;
describe("game history switching safety", () => {
  it("uses the exact suffixed or plain key for each actual history family", () => {
    for (const engine of [
      "fp3",
      "cc3",
      "dome3",
      "mirror3",
      "hex3",
      "tg3",
      "fm3",
      "rs3",
      "bs3",
    ])
      expect(historyKeyForLive(live(engine, 0))).toBe("game-1-r0");
    for (const engine of ["bw3", "hv3", "bb3"]) {
      expect(historyKeyForLive(live(engine, 0))).toBe("game-1");
      expect(historyKeyForLive(live(engine, 2))).toBe("game-1-r2");
    }
    for (const engine of [
      "bq3",
      "rq3",
      "sp3",
      "build3",
      "fr3",
      "pv3",
      "castle3",
    ])
      expect(historyKeyForLive(live(engine, 2))).toBe("game-1");
  });
  it("does not use an earlier run, wrong patient or wrong game as save proof", () => {
    const l = live("mirror3", 2),
      result = {
        sessionId: "game-1-r2",
        patientId: "patient-1",
        gameId: "mirror-quest-3d",
      } as AnyStoredSession;
    expect(confirmedLiveResult(l, result)).toBe(true);
    for (const patch of [
      { sessionId: "game-1-r1" },
      { patientId: "other" },
      { gameId: "balloon-quest" },
    ])
      expect(
        confirmedLiveResult(l, { ...result, ...patch } as AnyStoredSession),
      ).toBe(false);
    expect(
      confirmedLiveResult(
        {
          ...l,
          session: { ...l.session, gameState: "PLAYING" },
        } as LiveSessionRecord,
        result,
      ),
    ).toBe(false);
    expect(confirmedLiveResult(l, null)).toBe(false);
  });
  it("fails closed on malformed run payload and distinguishes tab ownership", () => {
    const l = live();
    (l.session as unknown as { mirror3: { payload: string } }).mirror3.payload =
      "invalid";
    expect(historyKeyForLive(l)).toBeNull();
    expect(ownedByTab(l, "tab-1")).toBe(true);
    expect(ownedByTab(l, "tab-2")).toBe(false);
  });
  it("permits a break only for absent, ready, finished or actually paused games", () => {
    expect(visitGamePaused(null)).toBe(true);
    expect(visitGamePaused(live())).toBe(true);
    expect(visitGamePaused(live("mirror3", 0, "PLAYING"))).toBe(false);
    const l = live("mirror3", 0, "PLAYING");
    (l.session as unknown as { mirror3: { payload: string } }).mirror3.payload =
      JSON.stringify({ status: "paused" });
    expect(visitGamePaused(l)).toBe(true);
  });
});

describe("pre-start navigation", () => {
  const ready = (engine = "bb3", extra = {}) =>
    ({
      ...live(engine, 0, "START_ZONE"),
      session: {
        engine,
        gameState: "START_ZONE",
        [engine]: {
          payload: JSON.stringify({
            status: "ready",
            startedAt: 0,
            completed: [],
            ...extra,
          }),
          controlTabId: "tab-1",
        },
      },
    }) as unknown as LiveSessionRecord;
  it("permits native setup and stage/configuration browsing across payload engines", () => {
    for (const engine of [
      "fp3",
      "cc3",
      "dome3",
      "mirror3",
      "hex3",
      "tg3",
      "fm3",
      "rs3",
      "bs3",
      "bw3",
      "hv3",
      "bb3",
      "fr3",
      "pv3",
      "castle3",
      "build3",
    ])
      expect(isUnstartedActivity(ready(engine, { stage: 8 }))).toBe(true);
  });
  it("protects started, paused, completed and recovered progress even under a stale START_ZONE marker", () => {
    for (const extra of [
      { startedAt: 1 },
      { checkpoints:[{outcome:"confirmed"}] },
      { steps:[{out:"assisted"}] },
      { status: "paused" },
      { status: "running" },
      { status: "ended" },
      { completed: [0] },
      { skipped: [2] },
      { events: [{}] },
      { elapsedSeconds: 1 },
      { summary: {} },
      { simTimeMs: 1 },
    ])
      expect(isUnstartedActivity(ready("bb3", extra))).toBe(false);
  });
  it("checks both structured Display state and full recovery snapshots", () => {
    const r = ready("bq3");
    r.session = {
      engine: "bq3",
      gameState: "START_ZONE",
      bq3: {
        state: { lifecycle: "ready", simTimeMs: 0 },
        snapshot: JSON.stringify({
          lifecycle: "ready",
          stage: null,
          results: [],
        }),
      },
    } as unknown as typeof r.session;
    expect(isUnstartedActivity(r)).toBe(true);
    (r.session as unknown as { bq3: { snapshot: string } }).bq3.snapshot =
      JSON.stringify({ lifecycle: "paused", stage: { simTimeMs: 90 } });
    expect(isUnstartedActivity(r)).toBe(false);
  });
  it("checks Space Pilot envelope and fails closed on unknown or malformed state", () => {
    const r = ready("sp3");
    (r.session as unknown as { sp3: { payload: string } }).sp3.payload =
      JSON.stringify({ state: { lifecycle: "ready", elapsedSeconds: 0 } });
    expect(isUnstartedActivity(r)).toBe(true);
    for (const payload of [
      "null",
      "[]",
      "broken",
      JSON.stringify({ state: { lifecycle: "playing" } }),
    ]) {
      (r.session as unknown as { sp3: { payload: string } }).sp3.payload =
        payload;
      expect(isUnstartedActivity(r)).toBe(false);
    }
    expect(
      isUnstartedActivity({
        session: { gameState: "START_ZONE" },
      } as LiveSessionRecord),
    ).toBe(false);
    expect(isUnstartedActivity(null)).toBe(false);
  });
});

it("permits only empty native Bloom/Harvest archives created while choosing setup stages", () => {
  const r = (engine: string, results: unknown[]) =>
    ({
      session: {
        gameState: "START_ZONE",
        engine,
        [engine]: {
          payload: JSON.stringify({ status: "ready", startedAt: 0, results }),
        },
      },
    }) as unknown as LiveSessionRecord;
  const bloom = {
    stage: 0,
    completed: false,
    skipped: false,
    regions: [{ hits: 0, assisted: 0, accepted: [] }],
  };
  expect(isUnstartedActivity(r("bw3", [bloom]))).toBe(true);
  for (const patch of [
    { completed: true },
    { skipped: true },
    { regions: [{ hits: 1, assisted: 0, accepted: ["token"] }] },
  ])
    expect(isUnstartedActivity(r("bw3", [{ ...bloom, ...patch }]))).toBe(false);
  const harvest = {
    stage: 0,
    completed: false,
    skipped: false,
    harvested: 0,
    assisted: 0,
    skippedObjectives: 0,
  };
  expect(isUnstartedActivity(r("hv3", [harvest]))).toBe(true);
  for (const patch of [
    { harvested: 1 },
    { assisted: 1 },
    { skippedObjectives: 1 },
    { completed: true },
    { skipped: true },
  ])
    expect(isUnstartedActivity(r("hv3", [{ ...harvest, ...patch }]))).toBe(
      false,
    );
  expect(isUnstartedActivity(r("bb3", [harvest]))).toBe(false);
});
