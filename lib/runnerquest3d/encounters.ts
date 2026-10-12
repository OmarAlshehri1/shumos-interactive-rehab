/**
 * Seeded, deterministic encounter generation + a reachability validator.
 * Control and Display both regenerate the SAME encounter list from
 * (stage index, seed, spacing); positions are never sent over the wire.
 */
import { mulberry32, hashSeed } from "./rng";
import { STAGES } from "./stages";
import type { Encounter, Lane, StageSpec } from "./types";

export const FIRST_ENCOUNTER_M = 38;
export const MIN_GAP_M = 14;
export const FINISH_RUNOUT_M = 30;
const ALL: readonly Lane[] = [-1, 0, 1];

export interface StagePlan {
  spec: StageSpec;
  encounters: Encounter[];
  /** Finish line, metres. */
  length: number;
}

const other = (l: Lane): Lane[] => ALL.filter((x) => x !== l);

export function generateStage(stageIndex: number, seed: number, spacing = 1): StagePlan {
  const spec = STAGES[stageIndex];
  const rnd = mulberry32(hashSeed("rq3d", stageIndex, seed));
  const gap = Math.max(MIN_GAP_M, spec.baseGap * spacing);
  const out: Encounter[] = [];
  let z = FIRST_ENCOUNTER_M;
  let safe: Lane = 0; // a lane the runner can plausibly be in
  const checkpointAfter = new Set([Math.floor(spec.count / 3), Math.floor((2 * spec.count) / 3)].filter((n) => n > 0 && n < spec.count));
  for (let i = 0; i < spec.count; i++) {
    const kind = spec.kinds[i % spec.kinds.length];
    const id = `e${i}`;
    if (kind === "side") {
      // Easy side obstacles block exactly one lane; harder stages may block two (still one free lane).
      const wide = spec.difficulty !== "easy" && rnd() < 0.4;
      const free = pickLane(rnd, safe);
      const blockedPair = other(free);
      const lanes: Lane[] = wide ? blockedPair : [blockedPair[rnd() < 0.5 ? 0 : 1]];
      out.push({ id, kind, z, lanes, target: null });
      safe = free;
    } else if (kind === "hurdle") {
      const full = spec.index === 3 || rnd() < 0.6; // First Hurdle is always full width: the step is the point
      const lanes: Lane[] = full ? [...ALL] : ALL.filter((l) => l === safe || rnd() < 0.5);
      out.push({ id, kind, z, lanes: lanes.length ? lanes : [safe], target: null });
    } else if (kind === "gate" || kind === "marker") {
      const target = pickLane(rnd, safe);
      out.push({ id, kind, z, lanes: kind === "gate" ? other(target) : [], target });
      safe = target;
    }
    z += gap;
    if (checkpointAfter.has(i + 1)) {
      out.push({ id: `c${i}`, kind: "checkpoint", z: z - gap / 2, lanes: [], target: null });
    }
  }
  const length = out[out.length - 1].z + FINISH_RUNOUT_M;
  return { spec, encounters: out.sort((a, b) => a.z - b.z), length };
}

/** A lane other than the previous one half the time, to keep paths varied but never jarring. */
function pickLane(rnd: () => number, from: Lane): Lane {
  const r = rnd();
  if (r < 0.34) return from;
  const options = other(from);
  return options[rnd() < 0.5 ? 0 : 1];
}
export interface ReachabilityIssue {
  encounterId: string;
  problem: string;
}

/**
 * Every obstacle must be passable (a free lane, or a step action for hurdles), spacing
 * must be comfortable, and nothing may sit inside a checkpoint's clear zone.
 */
export function validatePlan(plan: StagePlan, opts: { footLiftAvailable: boolean }): ReachabilityIssue[] {
  const issues: ReachabilityIssue[] = [];
  let prevZ = -Infinity;
  for (const e of plan.encounters) {
    if (e.z - prevZ < MIN_GAP_M / 2) issues.push({ encounterId: e.id, problem: "too close to the previous encounter" });
    prevZ = e.z;
    if (e.kind === "side") {
      if (e.lanes.length === 0 || e.lanes.length >= 3) issues.push({ encounterId: e.id, problem: "side obstacle blocks every lane or none" });
    }
    if (e.kind === "hurdle" && e.lanes.length >= 3 && !opts.footLiftAvailable) issues.push({ encounterId: e.id, problem: "full-width hurdle with no foot-lift route" });
    if (e.kind === "gate" && (e.target === null || e.lanes.includes(e.target) || e.lanes.length !== 2)) issues.push({ encounterId: e.id, problem: "gate has no open lane" });
    if (e.z <= 0 || e.z >= plan.length) issues.push({ encounterId: e.id, problem: "outside the stage" });
  }
  return issues;
}

/** Lanes from which an obstacle can be passed without a step. */
export function freeLanes(e: Encounter): Lane[] {
  if (e.kind === "marker" || e.kind === "checkpoint") return [...ALL];
  return ALL.filter((l) => !e.lanes.includes(l));
}
