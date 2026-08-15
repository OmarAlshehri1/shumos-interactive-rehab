import { describe, expect, it } from "vitest";
import { transition } from "../stateMachine";
import { GameState } from "../types";

describe("transition", () => {
  it("accepts every documented forward transition", () => {
    expect(transition(GameState.WELCOME, GameState.SETUP).success).toBe(true);
    expect(transition(GameState.SETUP, GameState.START_ZONE).success).toBe(true);
    expect(transition(GameState.START_ZONE, GameState.INSTRUCTIONS).success).toBe(true);
    expect(transition(GameState.INSTRUCTIONS, GameState.COUNTDOWN).success).toBe(true);
    expect(transition(GameState.COUNTDOWN, GameState.PLAYING).success).toBe(true);
    expect(transition(GameState.PLAYING, GameState.STAGE_COMPLETE).success).toBe(true);
    expect(transition(GameState.STAGE_COMPLETE, GameState.START_ZONE).success).toBe(true);
  });

  it("TASK 11: allows a therapist skip/jump to return to START_ZONE from INSTRUCTIONS/COUNTDOWN/PLAYING, not only from STAGE_COMPLETE", () => {
    expect(transition(GameState.INSTRUCTIONS, GameState.START_ZONE).success).toBe(true);
    expect(transition(GameState.COUNTDOWN, GameState.START_ZONE).success).toBe(true);
    expect(transition(GameState.PLAYING, GameState.START_ZONE).success).toBe(true);
  });

  it("no longer allows SETUP or STAGE_COMPLETE to jump straight to INSTRUCTIONS — TASK 8.2 requires a therapist-confirmed Start Zone stop first", () => {
    expect(transition(GameState.SETUP, GameState.INSTRUCTIONS).success).toBe(false);
    expect(transition(GameState.STAGE_COMPLETE, GameState.INSTRUCTIONS).success).toBe(false);
  });

  it("TASK 11: STAGE_COMPLETE no longer transitions straight to SESSION_COMPLETE — that only happens via the therapist's explicit endSession(), which bypasses this table", () => {
    expect(transition(GameState.STAGE_COMPLETE, GameState.SESSION_COMPLETE).success).toBe(false);
  });

  it("rejects backward and skip-ahead transitions without throwing", () => {
    expect(() => transition(GameState.SETUP, GameState.WELCOME)).not.toThrow();
    expect(transition(GameState.SETUP, GameState.WELCOME).success).toBe(false);
    expect(transition(GameState.WELCOME, GameState.PLAYING).success).toBe(false);
    expect(transition(GameState.WELCOME, GameState.COUNTDOWN).success).toBe(false);
    expect(transition(GameState.WELCOME, GameState.START_ZONE).success).toBe(false);
    expect(transition(GameState.START_ZONE, GameState.COUNTDOWN).success).toBe(false);
    expect(transition(GameState.PLAYING, GameState.SESSION_COMPLETE).success).toBe(false);
  });

  it("rejects any transition out of SESSION_COMPLETE", () => {
    for (const target of Object.values(GameState)) {
      expect(transition(GameState.SESSION_COMPLETE, target).success).toBe(false);
    }
  });

  it("returns a reason string on failure and leaves the reported state unchanged", () => {
    const result = transition(GameState.WELCOME, GameState.PLAYING);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state).toBe(GameState.WELCOME);
      expect(result.reason).toContain("WELCOME");
      expect(result.reason).toContain("PLAYING");
    }
  });
});
