import { describe, it, expect } from "vitest";
import {
  historyKeyForLive,
  confirmedLiveResult,
  visitGamePaused,
  ownedByTab,
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
    for (const engine of ["fp3", "cc3", "dome3", "mirror3", "hex3", "tg3", "fm3", "rs3", "bs3"])
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
