import { describe, expect, it } from "vitest";
import { Difficulty, GameState, PlayArea, TargetSize, TargetSpacing, createSession } from "@/lib/game";
import { incompleteSessionForPatient } from "@/lib/sessions/incompleteSession";
import type { LiveSessionRecord } from "@/lib/realtime/types";

function record(patientId: string | null): LiveSessionRecord {
  return {
    gameId: "balloon-quest",
    sessionId: "session-1",
    revision: 1,
    updatedAt: 1,
    patientId,
    lastInteraction: null,
    celebrationReplay: null,
    session: createSession({
      childFirstName: "ليان",
      difficulty: Difficulty.EASY,
      targetSize: TargetSize.LARGE,
      targetSpacing: TargetSpacing.WIDE,
      playArea: PlayArea.FULL,
      startingStage: 1,
      seed: "7",
      now: 1,
    }),
  };
}

describe("contextual incomplete session", () => {
  it("returns the original matching patient record without rewriting history or metrics", () => {
    const source = record("patient-1");
    expect(incompleteSessionForPatient(source, "patient-1")).toBe(source);
    expect(source.session.gameState).toBe(GameState.WELCOME);
  });

  it("never leaks a walk-in or another patient's live session", () => {
    expect(incompleteSessionForPatient(record(null), "patient-1")).toBeNull();
    expect(incompleteSessionForPatient(record("patient-2"), "patient-1")).toBeNull();
  });
});
