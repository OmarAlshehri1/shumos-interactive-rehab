import { describe, expect, it } from "vitest";
import {
  applyEarlyEndReason,
  CUSTOM_END_REASON_MAX_LENGTH,
  CUSTOM_SESSION_GOAL_MAX_LENGTH,
  normalizeTherapistNote,
  normalizeSessionWorkflowMetadata,
  sessionEndReasonLabel,
  sessionGoalLabel,
  THERAPIST_NOTE_MAX_LENGTH,
  workflowFieldsForStorage,
  type SessionWorkflowMetadata,
} from "../workflowMetadata";

describe("clinic workflow metadata", () => {
  it("continues reading an old organizational goal without exposing it to new writes", () => {
    expect(sessionGoalLabel({ sessionGoal: "FOLLOWING_INSTRUCTIONS" })).toBe("اتباع التعليمات");
    const legacy = normalizeSessionWorkflowMetadata({
      sessionGoal: "OTHER",
      customSessionGoal: `  ${"ه".repeat(CUSTOM_SESSION_GOAL_MAX_LENGTH + 20)}  `,
    });
    expect(legacy?.customSessionGoal).toHaveLength(CUSTOM_SESSION_GOAL_MAX_LENGTH);
    expect(sessionGoalLabel(legacy)).toBe(legacy?.customSessionGoal);
    expect(workflowFieldsForStorage(legacy, null)).toEqual({});
  });

  it("normal completion has no end reason; an early ending records the selected reason", () => {
    const normal: { workflow?: SessionWorkflowMetadata } = {};
    expect(normal.workflow?.endReason).toBeUndefined();
    const early = applyEarlyEndReason(normal, "CHILD_TIRED", "ignored");
    expect(early.workflow?.endReason).toBe("CHILD_TIRED");
    expect(sessionEndReasonLabel(early.workflow)).toBe("تعب الطفل");
  });

  it("stores and bounds a custom early-end reason", () => {
    const early = applyEarlyEndReason<{ workflow?: SessionWorkflowMetadata }>({}, "OTHER", ` ${"س".repeat(CUSTOM_END_REASON_MAX_LENGTH + 10)} `);
    expect(early.workflow?.customEndReason).toHaveLength(CUSTOM_END_REASON_MAX_LENGTH);
    expect(sessionEndReasonLabel(early.workflow)).toBe(early.workflow?.customEndReason);
  });

  it("stores safe therapist display identity without changing the stable uid field", () => {
    expect(workflowFieldsForStorage(undefined, "  أ. سارة  ")).toEqual({ therapistName: "أ. سارة" });
    expect(workflowFieldsForStorage(undefined, null)).toEqual({});
    expect(workflowFieldsForStorage({
      sessionGoal: "OTHER",
      customSessionGoal: "بيانات قديمة",
      endReason: "CHANGE_ACTIVITY",
    }, "أ. سارة")).toEqual({ endReason: "CHANGE_ACTIVITY", therapistName: "أ. سارة" });
  });

  it("bounds notes and allows clearing them", () => {
    expect(normalizeTherapistNote("   ")).toBe("");
    expect(normalizeTherapistNote("ن".repeat(THERAPIST_NOTE_MAX_LENGTH + 30))).toHaveLength(THERAPIST_NOTE_MAX_LENGTH);
  });

  it("quarantines malformed legacy metadata and bounds valid free text", () => {
    expect(normalizeSessionWorkflowMetadata({ sessionGoal: "BAD", endReason: 42, customSessionGoal: { unsafe: true } })).toBeUndefined();
    expect(normalizeSessionWorkflowMetadata({
      sessionGoal: "OTHER",
      customSessionGoal: "ه".repeat(CUSTOM_SESSION_GOAL_MAX_LENGTH + 30),
      endReason: "OTHER",
      customEndReason: "س".repeat(CUSTOM_END_REASON_MAX_LENGTH + 30),
    })).toEqual({
      sessionGoal: "OTHER",
      customSessionGoal: "ه".repeat(CUSTOM_SESSION_GOAL_MAX_LENGTH),
      endReason: "OTHER",
      customEndReason: "س".repeat(CUSTOM_END_REASON_MAX_LENGTH),
    });
  });
});
