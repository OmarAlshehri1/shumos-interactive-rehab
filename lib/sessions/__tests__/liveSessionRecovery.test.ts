import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import { BALLOON_QUEST_GAME_ID } from "@/lib/games/registry";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import { classifyLiveSessionForHome, COMPLETE_SESSION_ABANDON_MS } from "../liveSessionRecovery";

const NOW = 1_000_000_000;

function makeRecord({ gameState, updatedAt }: { gameState: GameState; updatedAt: number | object }): LiveSessionRecord {
  return {
    gameId: BALLOON_QUEST_GAME_ID,
    sessionId: "s1",
    revision: 1,
    session: { gameState } as LiveSessionRecord["session"],
    lastInteraction: null,
    celebrationReplay: null,
    patientId: null,
    updatedAt,
  };
}

describe("classifyLiveSessionForHome", () => {
  it("returns none when no record exists", () => {
    expect(classifyLiveSessionForHome(null, NOW)).toEqual({ kind: "none" });
  });

  it("returns active for every non-terminal gameState — never auto-cleared", () => {
    for (const gameState of [
      GameState.WELCOME,
      GameState.SETUP,
      GameState.START_ZONE,
      GameState.INSTRUCTIONS,
      GameState.COUNTDOWN,
      GameState.PLAYING,
      GameState.STAGE_COMPLETE,
    ]) {
      const record = makeRecord({ gameState, updatedAt: NOW });
      expect(classifyLiveSessionForHome(record, NOW)).toEqual({ kind: "active" });
    }
  });

  it("holds a just-completed session within the grace window (celebration/report may still be in view)", () => {
    const record = makeRecord({ gameState: GameState.SESSION_COMPLETE, updatedAt: NOW - 1000 });
    expect(classifyLiveSessionForHome(record, NOW)).toEqual({ kind: "hold" });
  });

  it("holds right up to the abandon threshold (exclusive)", () => {
    const record = makeRecord({ gameState: GameState.SESSION_COMPLETE, updatedAt: NOW - (COMPLETE_SESSION_ABANDON_MS - 1) });
    expect(classifyLiveSessionForHome(record, NOW)).toEqual({ kind: "hold" });
  });

  it("reclaims a completed session once it has aged past the abandon threshold — the stale-display repro", () => {
    const record = makeRecord({ gameState: GameState.SESSION_COMPLETE, updatedAt: NOW - COMPLETE_SESSION_ABANDON_MS });
    expect(classifyLiveSessionForHome(record, NOW)).toEqual({ kind: "reclaim" });
  });

  it("reclaims a session completed long before a dev-server restart (hours old)", () => {
    const record = makeRecord({ gameState: GameState.SESSION_COMPLETE, updatedAt: NOW - 6 * 60 * 60 * 1000 });
    expect(classifyLiveSessionForHome(record, NOW)).toEqual({ kind: "reclaim" });
  });

  it("treats an in-flight ServerValue.TIMESTAMP sentinel as 'just now' — never reclaims before its own write has landed", () => {
    const record = makeRecord({ gameState: GameState.SESSION_COMPLETE, updatedAt: {} });
    expect(classifyLiveSessionForHome(record, NOW)).toEqual({ kind: "hold" });
  });
});
