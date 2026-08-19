import { describe, expect, it } from "vitest";
import { deriveDisplayAudioControlState } from "../DisplayAudioControl";
import type { PresenceRecord } from "@/lib/realtime/types";

function presence(value: Partial<PresenceRecord>): PresenceRecord {
  return { connected: true, updatedAt: 1, ...value };
}

describe("display audio control state", () => {
  it("shows ready only for a connected display that reported running readiness", () => {
    expect(
      deriveDisplayAudioControlState(
        presence({ audioStatus: { state: "ready", commandId: "a", contextState: "running", updatedAt: 1 } }),
        null,
      ),
    ).toBe("ready");
    expect(
      deriveDisplayAudioControlState(
        presence({ connected: false, audioStatus: { state: "ready", commandId: "a", contextState: "running", updatedAt: 1 } }),
        null,
      ),
    ).toBe("not-ready");
  });

  it("keeps the warning after Chrome reports blocked", () => {
    expect(
      deriveDisplayAudioControlState(
        presence({ audioStatus: { state: "blocked", commandId: "a", contextState: "suspended", updatedAt: 1 } }),
        "a",
      ),
    ).toBe("not-ready");
  });

  it("shows attempting while the display has not acknowledged the new command", () => {
    expect(deriveDisplayAudioControlState(presence({}), "a")).toBe("attempting");
  });
});
