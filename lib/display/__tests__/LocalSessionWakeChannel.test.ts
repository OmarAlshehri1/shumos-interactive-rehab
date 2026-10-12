import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSessionWakeMessage, publishSessionWake, LOCAL_SESSION_WAKE_CHANNEL_NAME } from "../LocalSessionWakeChannel";
import type { LocalSessionWakeMessage } from "../LocalSessionWakeChannel";

describe("isSessionWakeMessage", () => {
  it("accepts a real wake message", () => {
    const message: LocalSessionWakeMessage = { type: "SESSION_WAKE", seq: 1, sentAtMs: 1000 };
    expect(isSessionWakeMessage(message)).toBe(true);
  });

  it("rejects malformed/foreign payloads", () => {
    expect(isSessionWakeMessage(null)).toBe(false);
    expect(isSessionWakeMessage(undefined)).toBe(false);
    expect(isSessionWakeMessage("not an object")).toBe(false);
    expect(isSessionWakeMessage({ type: "GAME_FEEDBACK" })).toBe(false);
    expect(isSessionWakeMessage({})).toBe(false);
  });

  it("carries no session/game data — a caller can never mistake it for authoritative state", () => {
    const message: LocalSessionWakeMessage = { type: "SESSION_WAKE", seq: 1, sentAtMs: 1000 };
    expect(Object.keys(message).sort()).toEqual(["sentAtMs", "seq", "type"]);
  });
});

describe("publishSessionWake", () => {
  // isBroadcastChannelSupported() gates on `window` existing — see
  // lib/audio/__tests__/AudioManager.test.ts for the same stubbing pattern,
  // needed here because this project's tests run in plain Node (no jsdom).
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a real publish delivers exactly one SESSION_WAKE message, with an incrementing seq across calls", async () => {
    const received: unknown[] = [];
    const listener = new BroadcastChannel(LOCAL_SESSION_WAKE_CHANNEL_NAME);
    listener.onmessage = (event) => received.push(event.data);

    publishSessionWake();
    publishSessionWake();

    await new Promise((resolve) => setTimeout(resolve, 150));
    listener.close();

    expect(received).toHaveLength(2);
    const [first, second] = received as LocalSessionWakeMessage[];
    expect(first.type).toBe("SESSION_WAKE");
    expect(second.seq).toBeGreaterThan(first.seq);
  });
});
