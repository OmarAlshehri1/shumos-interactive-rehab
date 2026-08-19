import { describe, expect, it } from "vitest";
import type { PresenceRecord } from "@/lib/realtime/types";
import { deriveSystemReadiness } from "../SystemReadinessCard";

const presence = (value: Partial<PresenceRecord>): PresenceRecord => ({ connected: true, updatedAt: 1, ...value });

describe("system readiness", () => {
  it("uses an honest unknown state before realtime answers", () => {
    expect(deriveSystemReadiness(undefined)).toEqual({ display: "unknown", audio: "unknown" });
  });

  it("never shows green readiness while the display is disconnected", () => {
    expect(deriveSystemReadiness(presence({ connected: false, audioStatus: { state: "ready", commandId: null, contextState: "running", updatedAt: 1 } })))
      .toEqual({ display: "not-ready", audio: "not-ready" });
  });

  it("separates display connection from audio readiness", () => {
    expect(deriveSystemReadiness(presence({ audioStatus: { state: "blocked", commandId: "a", contextState: "suspended", updatedAt: 1 } })))
      .toEqual({ display: "ready", audio: "not-ready" });
  });

  it("shows audio ready only for the display-reported ready plus running context", () => {
    expect(deriveSystemReadiness(presence({ audioStatus: { state: "ready", commandId: "a", contextState: "suspended", updatedAt: 1 } })).audio).toBe("not-ready");
    expect(deriveSystemReadiness(presence({ audioStatus: { state: "ready", commandId: "a", contextState: "running", updatedAt: 1 } })).audio).toBe("ready");
  });
});
