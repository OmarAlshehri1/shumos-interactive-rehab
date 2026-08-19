import { describe, expect, it } from "vitest";
import { GameState } from "../types";
import {
  colorChasePhaseOwnsTargetVoice,
  colorChaseTargetVoiceKey,
  createColorChaseVoiceEventGate,
  emitColorChaseTargetOnce,
} from "../voiceEventGate";

function targetKey(stepIndex: number) {
  return colorChaseTargetVoiceKey({
    difficulty: "EASY",
    stageNumber: 1,
    stageStartedAt: 1_000,
    stepIndex,
  });
}

describe("Color Chase semantic voice event gate", () => {
  it("emits one target event for the same canonical target across rerenders", () => {
    const gate = createColorChaseVoiceEventGate();
    const emitted: string[] = [];
    const emit = () => emitted.push("أزرق");
    const params = { gate, difficulty: "EASY", stageNumber: 1, stageStartedAt: 1_000, stepIndex: 0, emit };
    expect(emitColorChaseTargetOnce(params)).toBe(true);
    expect(emitColorChaseTargetOnce(params)).toBe(false);
    expect(emitColorChaseTargetOnce(params)).toBe(false);
    expect(emitted).toEqual(["أزرق"]);
  });

  it("keeps instruction and countdown ownership separate from the first playing target", () => {
    expect(colorChasePhaseOwnsTargetVoice(GameState.WELCOME)).toBe(false);
    expect(colorChasePhaseOwnsTargetVoice(GameState.START_ZONE)).toBe(false);
    expect(colorChasePhaseOwnsTargetVoice(GameState.INSTRUCTIONS)).toBe(false);
    expect(colorChasePhaseOwnsTargetVoice(GameState.COUNTDOWN)).toBe(false);
    expect(colorChasePhaseOwnsTargetVoice(GameState.PLAYING)).toBe(true);
    expect(colorChasePhaseOwnsTargetVoice(GameState.STAGE_COMPLETE)).toBe(false);
    const gate = createColorChaseVoiceEventGate();
    const emitted: string[] = [];
    if (gate.claim("instruction:EASY:1")) emitted.push("instruction");
    // COUNTDOWN owns its own four ticks; no target claim occurs before PLAYING.
    emitted.push("countdown-3", "countdown-2", "countdown-1", "countdown-start");
    if (gate.claim(targetKey(0))) emitted.push("target-0");
    if (gate.claim(targetKey(0))) emitted.push("target-0");
    expect(emitted).toEqual(["instruction", "countdown-3", "countdown-2", "countdown-1", "countdown-start", "target-0"]);
  });

  it("allows the next canonical step even when its requested color is unchanged", () => {
    const gate = createColorChaseVoiceEventGate();
    expect(gate.claim(targetKey(0))).toBe(true);
    expect(gate.claim(targetKey(1))).toBe(true);
    expect(gate.claim(targetKey(1))).toBe(false);
  });

  it("allows one current-target replay after a genuine display recovery", () => {
    const firstMount = createColorChaseVoiceEventGate();
    expect(firstMount.claim(targetKey(2))).toBe(true);
    expect(firstMount.claim(targetKey(2))).toBe(false);

    const recoveredMount = createColorChaseVoiceEventGate();
    expect(recoveredMount.claim(targetKey(2))).toBe(true);
    expect(recoveredMount.claim(targetKey(2))).toBe(false);
  });
});
