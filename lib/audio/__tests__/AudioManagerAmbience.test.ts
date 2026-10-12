import { afterEach, describe, expect, it, vi } from "vitest";

const ambienceMocks = vi.hoisted(() => ({
  gardenStop: vi.fn(),
  cosmicStop: vi.fn(),
  underwaterStop: vi.fn(),
  spaceStop: vi.fn(),
  colorChaseStop: vi.fn(),
  garden: vi.fn(() => ({ stop: ambienceMocks.gardenStop })),
  cosmic: vi.fn(() => ({ stop: ambienceMocks.cosmicStop })),
  underwater: vi.fn(() => ({ stop: ambienceMocks.underwaterStop })),
  space: vi.fn(() => ({ stop: ambienceMocks.spaceStop })),
  colorChase: vi.fn(() => ({ stop: ambienceMocks.colorChaseStop })),
}));

const effectMocks = vi.hoisted(() => ({
  playApplause: vi.fn(),
  playCelebration: vi.fn(),
  playChime: vi.fn(),
  playOops: vi.fn(),
  playPop: vi.fn(),
  playCheckpointChime: vi.fn(),
  playCometSweepEffect: vi.fn(),
  playCosmicCelebration: vi.fn(),
  playCosmicIntroChime: vi.fn(),
  playFootstepChime: vi.fn(),
  playFootstepsChordResolve: vi.fn(),
  playMeteorBreakEffect: vi.fn(),
  playRockDissolveEffect: vi.fn(),
  playBubbleIncorrect: vi.fn(),
  playBubblePop: vi.fn(),
  playUnderwaterCelebration: vi.fn(),
  playUnderwaterIntroSting: vi.fn(),
  playAlienPassSound: vi.fn(),
  playAsteroidClearSound: vi.fn(),
  playFinalStarChord: vi.fn(),
  playFireSound: vi.fn(),
  playLaneChangeSound: vi.fn(),
  playPortalSound: vi.fn(),
  playRocketUpgradeSound: vi.fn(),
  playSpaceCelebration: vi.fn(),
  playSpaceIntroSting: vi.fn(),
  playStarCollectChime: vi.fn(),
  playStarMissSound: vi.fn(),
  playColorPadActivation: vi.fn(),
  playColorCorrect: vi.fn(),
  playColorWrong: vi.fn(),
  playColorDanger: vi.fn(),
  playColorCelebration: vi.fn(),
}));

vi.mock("../ambience", () => ({ startAmbience: ambienceMocks.garden }));
vi.mock("../cosmicAmbience", () => ({ startCosmicAmbience: ambienceMocks.cosmic }));
vi.mock("../underwaterAmbience", () => ({ startUnderwaterAmbience: ambienceMocks.underwater }));
vi.mock("../spaceAmbience", () => ({ startSpaceAmbience: ambienceMocks.space }));
vi.mock("../colorChaseAmbience", () => ({ startColorChaseAmbience: ambienceMocks.colorChase }));
vi.mock("../colorChaseEffects", () => ({
  playColorPadActivation: effectMocks.playColorPadActivation,
  playColorCorrect: effectMocks.playColorCorrect,
  playColorWrong: effectMocks.playColorWrong,
  playColorDanger: effectMocks.playColorDanger,
  playColorCelebration: effectMocks.playColorCelebration,
}));
vi.mock("../effects", () => ({
  playApplause: effectMocks.playApplause,
  playCelebration: effectMocks.playCelebration,
  playChime: effectMocks.playChime,
  playOops: effectMocks.playOops,
  playPop: effectMocks.playPop,
}));
vi.mock("../cosmicEffects", () => ({
  playCheckpointChime: effectMocks.playCheckpointChime,
  playCometSweepEffect: effectMocks.playCometSweepEffect,
  playCosmicCelebration: effectMocks.playCosmicCelebration,
  playCosmicIntroChime: effectMocks.playCosmicIntroChime,
  playFootstepChime: effectMocks.playFootstepChime,
  playFootstepsChordResolve: effectMocks.playFootstepsChordResolve,
  playMeteorBreakEffect: effectMocks.playMeteorBreakEffect,
  playRockDissolveEffect: effectMocks.playRockDissolveEffect,
}));
vi.mock("../underwaterEffects", () => ({
  playBubbleIncorrect: effectMocks.playBubbleIncorrect,
  playBubblePop: effectMocks.playBubblePop,
  playUnderwaterCelebration: effectMocks.playUnderwaterCelebration,
  playUnderwaterIntroSting: effectMocks.playUnderwaterIntroSting,
}));
vi.mock("../spaceEffects", () => ({
  playAlienPassSound: effectMocks.playAlienPassSound,
  playAsteroidClearSound: effectMocks.playAsteroidClearSound,
  playFinalStarChord: effectMocks.playFinalStarChord,
  playFireSound: effectMocks.playFireSound,
  playLaneChangeSound: effectMocks.playLaneChangeSound,
  playPortalSound: effectMocks.playPortalSound,
  playRocketUpgradeSound: effectMocks.playRocketUpgradeSound,
  playSpaceCelebration: effectMocks.playSpaceCelebration,
  playSpaceIntroSting: effectMocks.playSpaceIntroSting,
  playStarCollectChime: effectMocks.playStarCollectChime,
  playStarMissSound: effectMocks.playStarMissSound,
}));

import { AudioManager } from "../AudioManager";
import type { SpeakOptions, VoiceProvider } from "../speech";
import { BalloonColor, Difficulty } from "@/lib/game";
import { BubbleColor, BubbleShape } from "@/lib/bubblepop";
import { Foot } from "@/lib/footsteps";
import { StarLane } from "@/lib/spacepilot";

function installRunningAudioContext() {
  class FakeGainNode {
    gain = { value: 1, setTargetAtTime: vi.fn() };
    connect() {
      return this;
    }
  }
  class FakeAudioContext {
    state: AudioContextState = "running";
    currentTime = 0;
    destination = {};
    createGain() {
      return new FakeGainNode();
    }
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
  }
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
}

function silentVoice(): VoiceProvider {
  return { isAvailable: () => true, speak: vi.fn(), cancel: vi.fn() };
}

function recordingVoice() {
  const calls: string[] = [];
  const provider: VoiceProvider = {
    isAvailable: () => true,
    speak: vi.fn((text: string, options?: SpeakOptions) => {
      calls.push(text);
      options?.onStart?.();
      options?.onEnd?.();
    }),
    cancel: vi.fn(),
  };
  return { provider, calls };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AudioManager active-game ambience", () => {
  it("starts every game's correct ambience and stops the previous ambience on game switches", () => {
    installRunningAudioContext();
    const manager = new AudioManager(silentVoice());
    manager.setActiveGame("balloon-quest");
    manager.unlock();
    expect(ambienceMocks.garden).toHaveBeenCalledOnce();

    manager.setActiveGame("follow-the-footsteps");
    expect(ambienceMocks.gardenStop).toHaveBeenCalledOnce();
    expect(ambienceMocks.cosmic).toHaveBeenCalledOnce();

    manager.setActiveGame("bubble-pop-wall");
    expect(ambienceMocks.cosmicStop).toHaveBeenCalledOnce();
    expect(ambienceMocks.underwater).toHaveBeenCalledOnce();

    manager.setActiveGame("space-pilot");
    expect(ambienceMocks.underwaterStop).toHaveBeenCalledOnce();
    expect(ambienceMocks.space).toHaveBeenCalledOnce();

    manager.setActiveGame("color-chase");
    expect(ambienceMocks.spaceStop).toHaveBeenCalledOnce();
    expect(ambienceMocks.colorChase).toHaveBeenCalledOnce();

    manager.setActiveGame(null);
    expect(ambienceMocks.colorChaseStop).toHaveBeenCalledOnce();
    expect(ambienceMocks.garden).toHaveBeenCalledTimes(2);
  });

  it("does not restart an already-running ambience on same-game realtime snapshots", () => {
    installRunningAudioContext();
    const manager = new AudioManager(silentVoice());
    manager.unlock();
    manager.setActiveGame("space-pilot");
    manager.setActiveGame("space-pilot");
    manager.setActiveGame("space-pilot");
    expect(ambienceMocks.space).toHaveBeenCalledOnce();
  });
});

describe("five-game audio lifecycle smoke", () => {
  it("Balloon Quest: welcome, garden, instruction, countdown, first pop SFX, and feedback voice", async () => {
    installRunningAudioContext();
    const voice = recordingVoice();
    const manager = new AudioManager(voice.provider);
    manager.unlock();
    manager.handleEvent({ type: "welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "instruction", timestamp: 2, targetColor: BalloonColor.RED, stageNumber: 1 });
    await manager.speakCountdownTick("3");
    manager.handleEvent({ type: "balloon_pop", timestamp: 3 });
    manager.handleEvent({ type: "stage_complete", timestamp: 4, childName: "سارة", stageNumber: 1 });
    expect(ambienceMocks.garden).toHaveBeenCalledOnce();
    expect(effectMocks.playPop).toHaveBeenCalledOnce();
    expect(voice.calls).toHaveLength(4);
  });

  it("Follow the Footsteps: welcome, cosmic ambience, instruction, countdown, footstep SFX, and checkpoint voice", async () => {
    installRunningAudioContext();
    const voice = recordingVoice();
    const manager = new AudioManager(voice.provider);
    manager.unlock();
    manager.handleEvent({ type: "footsteps_welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "footsteps_instruction", timestamp: 2, childName: "سارة", stageNumber: 1 });
    await manager.speakCountdownTick("3");
    manager.handleEvent({ type: "footstep_confirm", timestamp: 3, foot: Foot.LEFT, stepIndex: 0, totalSteps: 4 });
    manager.handleEvent({ type: "footsteps_checkpoint_reached", timestamp: 4 });
    expect(ambienceMocks.cosmic).toHaveBeenCalledOnce();
    expect(effectMocks.playFootstepChime).toHaveBeenCalledOnce();
    expect(effectMocks.playCheckpointChime).toHaveBeenCalledOnce();
    expect(voice.calls).toHaveLength(4);
  });

  it("Bubble Pop Wall: welcome, underwater ambience, instruction, countdown, pop SFX, and target voice", async () => {
    installRunningAudioContext();
    const voice = recordingVoice();
    const manager = new AudioManager(voice.provider);
    manager.unlock();
    manager.handleEvent({ type: "bubblepop_welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "bubblepop_instruction", timestamp: 2, childName: "سارة", stageNumber: 1 });
    await manager.speakCountdownTick("3");
    manager.handleEvent({ type: "bubblepop_pop", timestamp: 3 });
    manager.handleEvent({
      type: "bubblepop_target_request",
      timestamp: 4,
      childName: "سارة",
      color: BubbleColor.BLUE,
      shape: BubbleShape.STAR,
      announceShape: true,
    });
    expect(ambienceMocks.underwater).toHaveBeenCalledOnce();
    expect(effectMocks.playBubblePop).toHaveBeenCalledOnce();
    expect(voice.calls).toHaveLength(4);
  });

  it("Space Pilot: welcome, space ambience, one coherent instruction, countdown, FIRE SFX, and feedback voice", async () => {
    installRunningAudioContext();
    const voice = recordingVoice();
    const manager = new AudioManager(voice.provider);
    manager.unlock();
    manager.handleEvent({ type: "space_pilot_welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "space_pilot_instruction", timestamp: 2, childName: "سارة", difficulty: Difficulty.MEDIUM });
    await manager.speakCountdownTick("3");
    manager.handleEvent({ type: "space_pilot_fire", timestamp: 3, lane: StarLane.MIDDLE });
    manager.handleEvent({ type: "space_pilot_star_collected", timestamp: 4, upgradeLevel: 3 });
    expect(ambienceMocks.space).toHaveBeenCalledOnce();
    expect(effectMocks.playFireSound).toHaveBeenCalledOnce();
    expect(effectMocks.playStarCollectChime).toHaveBeenCalledOnce();
    expect(voice.calls).toHaveLength(4);
  });
});

describe("Color Chase audio lifecycle smoke", () => {
  it("plays sparse ambience, activation/correct/wrong/danger effects, and concise Lama cues", () => {
    installRunningAudioContext();
    const voice = recordingVoice();
    const manager = new AudioManager(voice.provider);
    manager.unlock();
    manager.handleEvent({ type: "color_chase_welcome", timestamp: 1, childName: "سارة" });
    manager.handleEvent({ type: "color_chase_instruction", timestamp: 2, instruction: "اجمع الأزرق مرتين" });
    manager.handleEvent({ type: "color_chase_pad_activation", timestamp: 3 });
    manager.handleEvent({ type: "color_chase_correct", timestamp: 4, padId: "PAD_1", combo: 1, final: false });
    manager.handleEvent({ type: "color_chase_incorrect", timestamp: 5 });
    manager.handleEvent({ type: "color_chase_danger", timestamp: 6 });
    expect(ambienceMocks.colorChase).toHaveBeenCalledOnce();
    expect(effectMocks.playColorPadActivation).toHaveBeenCalledTimes(2);
    expect(effectMocks.playColorCorrect).toHaveBeenCalledOnce();
    expect(effectMocks.playColorWrong).toHaveBeenCalledOnce();
    expect(effectMocks.playColorDanger).toHaveBeenCalledOnce();
    expect(voice.calls).toHaveLength(4);
  });
});
