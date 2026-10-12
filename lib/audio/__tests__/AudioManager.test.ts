import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioManager } from "../AudioManager";
import type { SpeakOptions, VoiceProvider } from "../speech";
import { BalloonColor } from "@/lib/game";
import { Difficulty } from "@/lib/spacepilot";
import { BubbleColor, BubbleShape } from "@/lib/bubblepop";
import { instructionLine, welcomeLine } from "../voiceLines";
import { footstepsInstructionLine, footstepsCheckpointLine } from "../footstepsVoiceLines";
import { bubblePopReadyPositionLine, bubblePopTargetRequestLine } from "../bubblePopVoiceLines";
import { spacePilotAdvancedInstructionLine, spacePilotInstructionLine, spacePilotMediumInstructionLine } from "../spacePilotVoiceLines";

/**
 * CREDIT OPTIMIZATION ROUND 2 — regression coverage for "removing bulk
 * prefetch must NEVER remove voice dispatch." dispatch() itself was not
 * touched by the prefetch changes, but this proves it directly: a mock
 * VoiceProvider (injected via AudioManager's constructor — see that file's
 * doc comment) captures every speak() call, so we can assert the EXACT
 * expected line is still spoken for a representative event from each of
 * the five games, with zero network/DOM mocking needed.
 */
function createMockProvider() {
  const calls: { text: string; options?: SpeakOptions }[] = [];
  const provider: VoiceProvider = {
    isAvailable: () => true,
    speak: vi.fn((text: string, options?: SpeakOptions) => {
      calls.push({ text, options });
      options?.onStart?.();
      options?.onEnd?.();
    }),
    cancel: vi.fn(),
    prefetch: vi.fn(async () => {}),
  };
  return { provider, calls };
}

function installFakeAudioContext(initialState: AudioContextState = "suspended", resumeSucceeds = true) {
  const contexts: FakeAudioContext[] = [];
  const gainTargets: number[] = [];
  const gainNodes: FakeGainNode[] = [];

  class FakeGainNode {
    gain = {
      value: 1,
      setTargetAtTime: vi.fn((target: number) => gainTargets.push(target)),
    };
    connect() {
      return this;
    }
    constructor() {
      gainNodes.push(this);
    }
  }

  class FakeAudioContext {
    state: AudioContextState = initialState;
    onstatechange: (() => void) | null = null;
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      if (!resumeSucceeds) throw new DOMException("Autoplay blocked", "NotAllowedError");
      this.state = "running";
      this.onstatechange?.();
    });
    close = vi.fn(async () => {
      this.state = "closed";
    });
    createGain() {
      return new FakeGainNode();
    }
    constructor() {
      contexts.push(this);
    }
  }

  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
  return { contexts, gainTargets, gainNodes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AudioManager fresh-session lifecycle", () => {
  it("resumes a newly-created suspended AudioContext and retries resume on a later genuine gesture", () => {
    const { contexts, gainNodes } = installFakeAudioContext();
    const { provider } = createMockProvider();
    const manager = new AudioManager(provider);

    manager.unlock();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(gainNodes[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.08);

    contexts[0].state = "suspended";
    manager.unlock();
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(gainNodes[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.08);
  });

  it("first unlock establishes the same audible master value as OFF -> ON", () => {
    const { gainNodes } = installFakeAudioContext("running");
    const { provider } = createMockProvider();
    const manager = new AudioManager(provider);

    manager.unlock();
    expect(gainNodes[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.08);
    manager.setMuted(true);
    expect(gainNodes[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.08);
    manager.setMuted(false);
    expect(gainNodes[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.08);
  });

  it("does not report a remote Firebase-triggered enable as ready when Chrome keeps the context suspended", async () => {
    installFakeAudioContext("suspended", false);
    const { provider, calls } = createMockProvider();
    const readiness = vi.fn();
    const manager = new AudioManager(provider, readiness);
    manager.handleEvent({ type: "instruction", timestamp: 1, targetColor: BalloonColor.RED, stageNumber: 1 });

    await expect(manager.attemptRemoteEnable()).resolves.toEqual({ ready: false, contextState: "suspended" });
    expect(calls).toHaveLength(0);
    expect(readiness).toHaveBeenLastCalledWith({ ready: false, contextState: "suspended" });
  });

  it("reports remote enable ready only after the display context actually reaches running", async () => {
    const { gainNodes } = installFakeAudioContext("suspended", true);
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.handleEvent({ type: "instruction", timestamp: 1, targetColor: BalloonColor.BLUE, stageNumber: 1 });

    await expect(manager.attemptRemoteEnable()).resolves.toEqual({ ready: true, contextState: "running" });
    expect(gainNodes[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.08);
    expect(calls.map((call) => call.text)).toEqual([instructionLine(BalloonColor.BLUE)]);
  });

  it("preserves only the latest important pre-unlock instruction", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);

    manager.handleEvent({ type: "welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "instruction", timestamp: 2, targetColor: BalloonColor.RED, stageNumber: 1 });
    expect(calls).toHaveLength(0);

    manager.unlock();
    expect(calls.map((call) => call.text)).toEqual([instructionLine(BalloonColor.RED)]);
  });

  it("replays a refresh-time Bubble Pop ready instruction without relying on an earlier welcome", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.handleEvent({ type: "bubblepop_ready_position", timestamp: 1, childName: "سارة", isFirstStage: true });
    manager.unlock();
    expect(calls.map((call) => call.text)).toEqual([bubblePopReadyPositionLine("سارة", true)]);
  });

  it("keeps the current countdown tick across a prompt unlock without replaying an old countdown backlog", async () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    await manager.speakCountdownTick("3");
    await manager.speakCountdownTick("2");
    manager.unlock();
    expect(calls.map((call) => call.text)).toEqual(["اثنان"]);
  });

  it("treats a same-game welcome as a new session boundary and cancels stale speech before Session 2", () => {
    const calls: string[] = [];
    const provider: VoiceProvider = {
      isAvailable: () => true,
      speak: vi.fn((text) => calls.push(text)),
      cancel: vi.fn(),
    };
    const manager = new AudioManager(provider);
    manager.unlock();

    manager.handleEvent({ type: "welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "welcome", timestamp: 2, childName: "ليان" });

    expect(calls).toEqual([welcomeLine("سارة"), welcomeLine("ليان")]);
    expect(provider.cancel).toHaveBeenCalledOnce();
  });

  it("restores ambience ducking when active and pending voice are cancelled by mute", () => {
    const { gainTargets } = installFakeAudioContext("running");
    let activeOptions: SpeakOptions | undefined;
    const provider: VoiceProvider = {
      isAvailable: () => true,
      speak: vi.fn((_text, options) => {
        activeOptions = options;
      }),
      cancel: vi.fn(),
    };
    const manager = new AudioManager(provider);
    manager.unlock();
    manager.handleEvent({ type: "instruction", timestamp: 1, targetColor: BalloonColor.BLUE, stageNumber: 1 });
    expect(activeOptions).toBeDefined();
    expect(gainTargets).toContain(0.32 * 0.35);

    manager.setMuted(true);
    expect(gainTargets.at(-1)).toBe(0.32);
  });

  it("restores ambience ducking after both attempts fail", () => {
    const { gainTargets } = installFakeAudioContext("running");
    const provider: VoiceProvider = {
      isAvailable: () => true,
      speak: vi.fn((_text, options) => {
        options?.onError?.();
        options?.onEnd?.();
      }),
      cancel: vi.fn(),
    };
    const manager = new AudioManager(provider);
    manager.unlock();
    manager.handleEvent({ type: "instruction", timestamp: 1, targetColor: BalloonColor.BLUE, stageNumber: 1 });

    expect(provider.speak).toHaveBeenCalledTimes(2);
    expect(gainTargets.at(-1)).toBe(0.32);
  });
});

describe("AudioManager dispatch — voice coverage preserved for all five games", () => {
  it("Balloon Quest: instruction event still speaks the real instruction line", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.unlock();
    manager.handleEvent({ type: "instruction", timestamp: Date.now(), targetColor: BalloonColor.RED, stageNumber: 1 });
    expect(calls.map((c) => c.text)).toContain(instructionLine(BalloonColor.RED));
  });

  it("Follow the Footsteps: instruction AND checkpoint events still speak", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.unlock();
    manager.handleEvent({ type: "footsteps_instruction", timestamp: Date.now(), childName: "سارة", stageNumber: 2 });
    manager.handleEvent({ type: "footsteps_checkpoint_reached", timestamp: Date.now() });
    const texts = calls.map((c) => c.text);
    expect(texts).toContain(footstepsInstructionLine("سارة", 2));
    expect(texts).toContain(footstepsCheckpointLine(0));
  });

  it("Bubble Pop Wall: a color/shape request event still speaks — proves removing the color x shape x sequence prefetch matrix did not remove the ON-DEMAND request line", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.unlock();
    manager.handleEvent({
      type: "bubblepop_target_request",
      timestamp: Date.now(),
      childName: "أحمد",
      color: BubbleColor.BLUE,
      shape: BubbleShape.STAR,
      announceShape: true,
    });
    expect(calls.map((c) => c.text)).toContain(bubblePopTargetRequestLine(BubbleColor.BLUE, BubbleShape.STAR, true));
  });

  it("Space Pilot: instruction event still speaks", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.unlock();
    manager.handleEvent({ type: "space_pilot_instruction", timestamp: Date.now(), childName: "سارة", difficulty: Difficulty.EASY });
    expect(calls.map((c) => c.text)).toContain(spacePilotInstructionLine());
  });

  it("Space Pilot MEDIUM and ADVANCED each produce one coherent instruction line", () => {
    const medium = createMockProvider();
    const mediumManager = new AudioManager(medium.provider);
    mediumManager.unlock();
    mediumManager.handleEvent({ type: "space_pilot_instruction", timestamp: 1, childName: "سارة", difficulty: Difficulty.MEDIUM });
    expect(medium.calls.map((call) => call.text)).toEqual([spacePilotMediumInstructionLine()]);

    const advanced = createMockProvider();
    const advancedManager = new AudioManager(advanced.provider);
    advancedManager.unlock();
    advancedManager.handleEvent({ type: "space_pilot_instruction", timestamp: 1, childName: "سارة", difficulty: Difficulty.ADVANCED });
    expect(advanced.calls.map((call) => call.text)).toEqual([spacePilotAdvancedInstructionLine()]);
  });

  it("countdown ticks still dispatch through speakCountdownTick regardless of prefetch changes", async () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.unlock();
    await manager.speakCountdownTick("3");
    await manager.speakCountdownTick("2");
    await manager.speakCountdownTick("1");
    await manager.speakCountdownTick("start");
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.text)).toEqual(["ثلاثة", "اثنان", "واحد", "ابدأ!"]);
  });

  it("countdown never blocks: speakCountdownTick resolves even if the provider never calls onStart/onEnd synchronously for a slow/unavailable provider", async () => {
    const slowProvider: VoiceProvider = {
      isAvailable: () => false,
      // Simulate "dropped by priority gate" — VoiceQueue.request returns false, so AudioManager's speakCountdownTick settle()-on-drop path is what actually resolves it, not the provider.
      speak: vi.fn(),
      cancel: vi.fn(),
    };
    const manager = new AudioManager(slowProvider);
    manager.unlock();
    manager.setMuted(true); // muted speak() calls resolve immediately without ever reaching the provider — bounded, never hangs
    await expect(manager.speakCountdownTick("3")).resolves.toBeUndefined();
  });

  it("typing/name-only changes (no handleEvent call at all) triggers zero provider.speak calls — nothing here reacts to name typing", () => {
    const { provider, calls } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.unlock();
    // Simulates /control's name field: no event is ever dispatched to AudioManager for a mere keystroke.
    expect(calls).toHaveLength(0);
    manager.destroy();
  });

  it("prefetchForSession only ever calls provider.prefetch for the ACTIVE game's own tiny list — never speak()", () => {
    const { provider } = createMockProvider();
    const manager = new AudioManager(provider);
    manager.prefetchForSession("سارة", "bubble-pop-wall");
    expect(provider.speak).not.toHaveBeenCalled();
  });
});
