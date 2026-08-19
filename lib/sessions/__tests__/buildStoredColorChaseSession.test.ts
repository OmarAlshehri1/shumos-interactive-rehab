import { expect, it } from "vitest";
import { applyColorChaseTransition, confirmColorChasePad, createColorChaseSession, Difficulty, endColorChaseSession, GameState } from "@/lib/colorchase";
import { buildStoredColorChaseSession } from "../buildStoredColorChaseSession";

it("stores Color Chase history and current clinic metadata without carrying a legacy goal into a new record", () => {
  let session = createColorChaseSession({ childFirstName: "سارة", difficulty: Difficulty.EASY, seed: "fixed", now: 1000, workflow: { sessionGoal: "VISUAL_DISCRIMINATION", endReason: "CHANGE_ACTIVITY" } });
  for (const phase of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) session = applyColorChaseTransition(session, phase, 1000).state;
  for (const [index, step] of session.currentStage.plan.steps.entries()) session = confirmColorChasePad(session, { padId: step.correctPadId, inputId: `pad-${index}`, timestamp: 2000 + index * 1000 }).state;
  session = endColorChaseSession(session, 5000).state;
  const stored = buildStoredColorChaseSession({ session, patientId: "patient-1", createdByUid: "staff-1", therapistName: "أ. سارة", gameId: "color-chase" });
  expect(stored.gameId).toBe("color-chase");
  expect(stored.totalCorrect).toBe(session.summary?.totalCorrect);
  expect(stored.accuracy).toBe(session.summary?.accuracy);
  expect(stored.completedStageCount).toBe(1);
  expect(stored.createdByUid).toBe("staff-1");
  expect(stored.therapistName).toBe("أ. سارة");
  expect(stored.sessionGoal).toBeUndefined();
  expect(stored.endReason).toBe("CHANGE_ACTIVITY");
});
