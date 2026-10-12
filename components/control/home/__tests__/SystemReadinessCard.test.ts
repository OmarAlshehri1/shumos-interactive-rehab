import { describe, expect, it } from "vitest";
import type { PresenceRecord } from "@/lib/realtime/types";
import { deriveSensorRow, deriveSystemReadiness } from "../SystemReadinessCard";

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

describe("sensor readiness row", () => {
  it("shows ready with the rounded live rate once connected", () => {
    const row = deriveSensorRow("حساس اليد اليمنى", { connected: true, connecting: false, reconnecting: false, liveRateHz: 49.7 });
    expect(row).toEqual({ kind: "ready", label: "حساس اليد اليمنى متصل · 50 Hz", needsManualAction: false });
  });

  it("shows ready without a rate suffix before the first rate measurement lands", () => {
    const row = deriveSensorRow("حساس اليد اليمنى", { connected: true, connecting: false, reconnecting: false, liveRateHz: null });
    expect(row.label).toBe("حساس اليد اليمنى متصل");
  });

  it("shows a reconnecting state distinct from the first-time connecting state, neither needing a manual action", () => {
    const reconnecting = deriveSensorRow("حساس اليد اليمنى", { connected: false, connecting: false, reconnecting: true, liveRateHz: null });
    expect(reconnecting.kind).toBe("not-ready");
    expect(reconnecting.label).toContain("إعادة الاتصال");
    expect(reconnecting.needsManualAction).toBe(false);

    const connecting = deriveSensorRow("حساس اليد اليمنى", { connected: false, connecting: true, reconnecting: false, liveRateHz: null });
    expect(connecting.label).not.toContain("إعادة الاتصال");
    expect(connecting.needsManualAction).toBe(false);
  });

  it("only asks for manual action when genuinely idle (not connected, not connecting, not auto-reconnecting)", () => {
    const idle = deriveSensorRow("حساس اليد اليمنى", { connected: false, connecting: false, reconnecting: false, liveRateHz: null });
    expect(idle.needsManualAction).toBe(true);
    expect(idle.kind).toBe("not-ready");
  });

  it("shows a real خطأ state only while genuinely idle with an error, never overriding connecting/reconnecting copy", () => {
    const idleWithError = deriveSensorRow("حساس اليد اليسرى", { connected: false, connecting: false, reconnecting: false, liveRateHz: null, error: "تعذّر الاتصال." });
    expect(idleWithError.label).toBe("حساس اليد اليسرى — خطأ");
    expect(idleWithError.kind).toBe("not-ready");
    expect(idleWithError.needsManualAction).toBe(true);

    const reconnectingWithStaleError = deriveSensorRow("حساس اليد اليسرى", { connected: false, connecting: false, reconnecting: true, liveRateHz: null, error: "تعذّر الاتصال." });
    expect(reconnectingWithStaleError.label).toContain("إعادة الاتصال"); // a stale error never masks an in-flight reconnect
  });

  it("is a pure label-driven function, so RIGHT_HAND and LEFT_HAND rows are computed identically and independently — one hand's state never leaks into the other's row", () => {
    const rightFailed = deriveSensorRow("حساس اليد اليمنى", { connected: false, connecting: false, reconnecting: false, liveRateHz: null });
    const leftReady = deriveSensorRow("حساس اليد اليسرى", { connected: true, connecting: false, reconnecting: false, liveRateHz: 50 });
    expect(rightFailed.kind).toBe("not-ready");
    expect(leftReady.kind).toBe("ready");
    expect(leftReady.label).toBe("حساس اليد اليسرى متصل · 50 Hz");
  });
});
