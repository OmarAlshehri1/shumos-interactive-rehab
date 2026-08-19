import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("session workflow security rules", () => {
  const sessionsRule = JSON.parse(readFileSync("database.rules.json", "utf8")).rules.sessions.$historyPatientId.$sessionId;

  it("keeps history immutable while allowing only the creating active staff member to edit the note child", () => {
    expect(sessionsRule[".write"]).toContain("!data.exists()");
    expect(sessionsRule.therapistNote[".write"]).toContain("data.parent().child('createdByUid').val() == auth.uid");
    expect(sessionsRule.therapistNote[".validate"]).toContain("<= 750");
  });

  it("validates bounded optional goal, reason, and therapist display fields", () => {
    expect(sessionsRule.therapistName[".validate"]).toContain("<= 80");
    expect(sessionsRule.sessionGoal[".validate"]).toContain("FOLLOWING_INSTRUCTIONS");
    expect(sessionsRule.customSessionGoal[".validate"]).toContain("<= 100");
    expect(sessionsRule.endReason[".validate"]).toContain("CHANGE_ACTIVITY");
    expect(sessionsRule.customEndReason[".validate"]).toContain("<= 120");
  });
});
