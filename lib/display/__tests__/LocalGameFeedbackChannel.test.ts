import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRelevantGameFeedbackMessage, publishLocalGameFeedback, LOCAL_GAME_FEEDBACK_CHANNEL_NAME } from "../LocalGameFeedbackChannel";
import type { LocalGameFeedbackMessage } from "../LocalGameFeedbackChannel";

const baseMessage: LocalGameFeedbackMessage = {
  type: "GAME_FEEDBACK",
  gameId: "balloon-quest",
  sessionId: "session-1",
  revision: 3,
  actionId: "3-balloon_0",
  targetId: "balloon_0",
  seq: 1,
  sentAtMs: 1000,
};

describe("isRelevantGameFeedbackMessage", () => {
  it("accepts a message that matches the current gameId and sessionId", () => {
    expect(isRelevantGameFeedbackMessage(baseMessage, "balloon-quest", "session-1")).toBe(true);
  });

  it("wrong game event ignored", () => {
    expect(isRelevantGameFeedbackMessage(baseMessage, "bubble-pop-wall", "session-1")).toBe(false);
  });

  it("wrong/previous session event ignored", () => {
    expect(isRelevantGameFeedbackMessage(baseMessage, "balloon-quest", "session-2")).toBe(false);
  });

  it("ignored when there is no current game/session at all (e.g. waiting world)", () => {
    expect(isRelevantGameFeedbackMessage(baseMessage, null, null)).toBe(false);
    expect(isRelevantGameFeedbackMessage(baseMessage, "balloon-quest", null)).toBe(false);
  });

  it("ignored when the payload isn't actually a GAME_FEEDBACK message", () => {
    expect(isRelevantGameFeedbackMessage(null, "balloon-quest", "session-1")).toBe(false);
    expect(isRelevantGameFeedbackMessage(undefined, "balloon-quest", "session-1")).toBe(false);
    expect(isRelevantGameFeedbackMessage({ type: "SOMETHING_ELSE" }, "balloon-quest", "session-1")).toBe(false);
    expect(isRelevantGameFeedbackMessage("not an object", "balloon-quest", "session-1")).toBe(false);
  });

  it("ignored when targetId is missing/malformed", () => {
    const withoutTargetId: Omit<LocalGameFeedbackMessage, "targetId"> = {
      type: baseMessage.type,
      gameId: baseMessage.gameId,
      sessionId: baseMessage.sessionId,
      revision: baseMessage.revision,
      actionId: baseMessage.actionId,
      seq: baseMessage.seq,
      sentAtMs: baseMessage.sentAtMs,
    };
    expect(isRelevantGameFeedbackMessage(withoutTargetId, "balloon-quest", "session-1")).toBe(false);
  });
});

describe("publishLocalGameFeedback", () => {
  // isBroadcastChannelSupported() (see LocalPointerChannel.ts) gates on
  // `window` existing — true in every real browser tab this ever runs in,
  // but this project's tests run in plain Node (no jsdom), so `window` is
  // stubbed here the same way lib/audio/__tests__/AudioManager.test.ts
  // stubs it for its own browser-API tests.
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an accepted canonical action publishes exactly one GAME_FEEDBACK message with the given identity", async () => {
    const received: unknown[] = [];
    const listener = new BroadcastChannel(LOCAL_GAME_FEEDBACK_CHANNEL_NAME);
    listener.onmessage = (event) => received.push(event.data);

    publishLocalGameFeedback({ gameId: "balloon-quest", sessionId: "session-1", revision: 7, actionId: "7-balloon_2", targetId: "balloon_2" });

    // BroadcastChannel delivery to other channel instances is asynchronous even within the same process — generous relative to the actual delivery latency so this never flakes under the test transform's own overhead.
    await new Promise((resolve) => setTimeout(resolve, 150));
    listener.close();

    expect(received).toHaveLength(1);
    const message = received[0] as LocalGameFeedbackMessage;
    expect(message.type).toBe("GAME_FEEDBACK");
    expect(message.gameId).toBe("balloon-quest");
    expect(message.sessionId).toBe("session-1");
    expect(message.revision).toBe(7);
    expect(message.targetId).toBe("balloon_2");
    expect(typeof message.seq).toBe("number");
    expect(typeof message.sentAtMs).toBe("number");
  });

  it("does not deliver to a listener subscribed under a different channel name", async () => {
    const received: unknown[] = [];
    const listener = new BroadcastChannel("some-other-channel");
    listener.onmessage = (event) => received.push(event.data);

    publishLocalGameFeedback({ gameId: "balloon-quest", sessionId: "session-1", revision: 1, actionId: "1-balloon_0", targetId: "balloon_0" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    listener.close();
    expect(received).toHaveLength(0);
  });
});
