import { describe, it, expect } from "vitest";
import {
  freshDisplay,
  displayAudioReady,
} from "@/components/control/home/ReadinessDashboard";
import type { PresenceRecord } from "@/lib/realtime/types";
describe("Display readiness is recent Display-authored evidence", () => {
  const now = 100000,
    p: PresenceRecord = {
      connected: true,
      updatedAt: now,
      audioStatus: {
        state: "ready",
        contextState: "running",
        commandId: null,
        updatedAt: now,
      },
    };
  it("rejects old, absent, disconnected and pending timestamp flags", () => {
    expect(freshDisplay(p, now)).toBe(true);
    expect(freshDisplay(p, now + 45001)).toBe(false);
    expect(freshDisplay(undefined, now)).toBe(false);
    expect(freshDisplay({ ...p, connected: false }, now)).toBe(false);
    expect(freshDisplay({ ...p, updatedAt: {} }, now)).toBe(false);
  });
  it("requires both fresh presence and a fresh running audio acknowledgement", () => {
    expect(displayAudioReady(p, now)).toBe(true);
    expect(
      displayAudioReady(
        { ...p, audioStatus: { ...p.audioStatus!, contextState: "suspended" } },
        now,
      ),
    ).toBe(false);
    expect(
      displayAudioReady(
        { ...p, audioStatus: { ...p.audioStatus!, updatedAt: 0 } },
        now,
      ),
    ).toBe(false);
    expect(displayAudioReady({ ...p, updatedAt: 0 }, now)).toBe(false);
  });
});
