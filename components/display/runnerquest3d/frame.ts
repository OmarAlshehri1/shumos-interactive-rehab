import { generateStage, type StagePlan } from "@/lib/runnerquest3d/encounters";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import type { SceneFrame } from "./scene/types";

const planCache = new Map<string, StagePlan>();
/** Same plan Control generated: the Display derives obstacles locally, they are never sent. */
export function planFor(state: Pick<DisplayState, "stageIndex" | "seed" | "spacingUsed">): StagePlan {
  const key = `${state.stageIndex}|${state.seed}|${state.spacingUsed}`;
  let p = planCache.get(key);
  if (!p) {
    p = generateStage(state.stageIndex, state.seed, state.spacingUsed);
    if (planCache.size > 12) planCache.clear();
    planCache.set(key, p);
  }
  return p;
}

export function frameFromState(state: DisplayState, distance: number, speed: number): SceneFrame {
  const done = state.lifecycle === "stage-complete" || state.lifecycle === "completed";
  return {
    distance, speed, lane: state.lane, holding: state.holding,
    mood: done ? "celebrate" : state.lifecycle === "playing" && speed > 0.15 ? "run" : "idle",
    celebrateSeq: state.celebrateSeq, stars: state.stars, armed: state.armed, resolved: state.resolved, footLiftRequired: state.footLiftRequired, reducedMotion: state.reducedMotion,
  };
}
