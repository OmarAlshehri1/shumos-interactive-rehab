import { describe, expect, it, vi } from "vitest";
import { VoiceQueue } from "../voiceQueue";
import type { VoiceProvider } from "../speech";

function createFakeProvider(): VoiceProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    isAvailable: () => true,
    speak: (text) => {
      calls.push(text);
    },
    cancel: vi.fn(),
  };
}

describe("VoiceQueue priority semantics", () => {
  it("speaks a request when nothing is currently active", () => {
    const provider = createFakeProvider();
    const queue = new VoiceQueue(provider);
    const spoken = queue.request("hello", "normal");
    expect(spoken).toBe(true);
    expect(provider.calls).toEqual(["hello"]);
  });

  it("serializes high-priority requests so an in-flight paid line is not synthesized and then discarded", () => {
    const provider = createFakeProvider();
    const ends: Array<() => void> = [];
    provider.speak = (text, options) => {
      provider.calls.push(text);
      if (options?.onEnd) ends.push(options.onEnd);
    };
    const queue = new VoiceQueue(provider);
    queue.request("stage 1 instruction", "high");
    const spoken = queue.request("stage 2 instruction", "high");
    expect(spoken).toBe(true);
    expect(provider.calls).toEqual(["stage 1 instruction"]);

    ends[0]();
    expect(provider.calls).toEqual(["stage 1 instruction", "stage 2 instruction"]);
  });

  it("keeps only the latest pending high-priority line and settles the displaced callback without sending it to Munsit", () => {
    const provider = createFakeProvider();
    const ends: Array<() => void> = [];
    provider.speak = (text, options) => {
      provider.calls.push(text);
      if (options?.onEnd) ends.push(options.onEnd);
    };
    const queue = new VoiceQueue(provider);
    const displacedEnd = vi.fn();

    queue.request("welcome", "high");
    queue.request("old scene instruction", "high", { onEnd: displacedEnd });
    queue.request("current scene instruction", "high");

    expect(provider.calls).toEqual(["welcome"]);
    expect(displacedEnd).toHaveBeenCalledOnce();
    ends[0]();
    expect(provider.calls).toEqual(["welcome", "current scene instruction"]);
  });

  it("a normal-priority request is dropped while high-priority speech is active", () => {
    const provider = createFakeProvider();
    const queue = new VoiceQueue(provider);
    queue.request("instruction", "high");
    const spoken = queue.request("encouragement", "normal");
    expect(spoken).toBe(false);
    expect(provider.calls).toEqual(["instruction"]); // encouragement never reached the provider
  });

  it("a low-priority request is dropped while normal-priority speech is active", () => {
    const provider = createFakeProvider();
    const queue = new VoiceQueue(provider);
    queue.request("encouragement", "normal");
    const spoken = queue.request("try again", "low");
    expect(spoken).toBe(false);
    expect(provider.calls).toEqual(["encouragement"]);
  });

  it("a high-priority request always interrupts normal or low priority speech", () => {
    const provider = createFakeProvider();
    const queue = new VoiceQueue(provider);
    queue.request("try again", "low");
    const spoken = queue.request("stage complete!", "high");
    expect(spoken).toBe(true);
    expect(provider.calls).toEqual(["try again", "stage complete!"]);
  });

  it("once the active speech finishes (onEnd), a new request of any priority is accepted", () => {
    const provider = createFakeProvider();
    let capturedOnEnd: (() => void) | undefined;
    provider.speak = (text, options) => {
      provider.calls.push(text);
      capturedOnEnd = options?.onEnd;
    };
    const queue = new VoiceQueue(provider);

    queue.request("instruction", "high");
    capturedOnEnd?.(); // simulate the utterance finishing
    const spoken = queue.request("encouragement", "normal");

    expect(spoken).toBe(true);
    expect(provider.calls).toEqual(["instruction", "encouragement"]);
  });

  it("cancel() clears the active priority so the next request of any priority is accepted", () => {
    const provider = createFakeProvider();
    const queue = new VoiceQueue(provider);
    queue.request("instruction", "high");
    queue.cancel();
    const spoken = queue.request("something low priority", "low");
    expect(spoken).toBe(true);
  });

  it("a retry never displaces a newer high-priority line already waiting", () => {
    const provider = createFakeProvider();
    provider.speak = (text) => {
      provider.calls.push(text);
    };
    const queue = new VoiceQueue(provider);

    queue.request("failed instruction", "high");
    queue.request("new scene", "high");
    expect(queue.request("stale retry", "high", { isRetry: true })).toBe(false);
    expect(provider.calls).toEqual(["failed instruction"]);
  });

  it("cancel settles active and pending requests so ducking/countdown waiters cannot hang", () => {
    const provider = createFakeProvider();
    const activeEnd = vi.fn();
    const pendingEnd = vi.fn();
    const queue = new VoiceQueue(provider);
    queue.request("active", "high", { onEnd: activeEnd });
    queue.request("pending", "high", { onEnd: pendingEnd });

    queue.cancel();

    expect(provider.cancel).toHaveBeenCalledOnce();
    expect(activeEnd).toHaveBeenCalledOnce();
    expect(pendingEnd).toHaveBeenCalledOnce();
  });

  it("an empty string is never spoken", () => {
    const provider = createFakeProvider();
    const queue = new VoiceQueue(provider);
    const spoken = queue.request("", "high");
    expect(spoken).toBe(false);
    expect(provider.calls).toEqual([]);
  });
});
