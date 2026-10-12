/**
 * Runner Quest 3D — FLOOR projection: deterministic objective plans for the nine stages.
 *
 * The FLOOR journey is a path of waypoints. Each waypoint is one objective the therapist confirms:
 *   region : the child moves to the lit region (left / centre / right)
 *   step   : a small deliberate foot movement in place (a "virtual stepping stone" - never a jump)
 *   rest   : an optional calm pause; "continue" ends it
 * There is no time limit, no failure and no speed: progress only ever moves forward when the therapist
 * confirms (or assists / skips). Control and Display both regenerate the SAME plan from (stageIndex, seed),
 * so objective positions are never sent over the wire.
 */
import { hashSeed, mulberry32 } from "./rng";
import { STAGES } from "./stages";
import type { FloorObjective, FloorObjectiveKind, Lane } from "./types";

type Spec = readonly [kind: FloorObjectiveKind, target: Lane | null, variant: FloorObjective["variant"]];

const L: Spec = ["region", -1, "direction"];
const R: Spec = ["region", 1, "direction"];
const C: Spec = ["region", 0, "neutral"];
const CL: Spec = ["region", -1, "choose"];
const CR: Spec = ["region", 1, "choose"];
const CC: Spec = ["region", 0, "choose"];
const S: Spec = ["step", null, "step"];
const Z: Spec = ["rest", null, "rest"];

const make = (specs: readonly Spec[]): FloorObjective[] => specs.map(([kind, target, variant], i) => ({ id: `f${i}`, kind, target, variant }));
const mirror = (specs: readonly Spec[]): Spec[] => specs.map(([k, t, v]) => [k, t === null || t === 0 ? t : ((-t) as Lane), v]);

/** Seeded left/right variation that never repeats the same side three times in a row (gentle, never jarring). */
function seededSides(rnd: () => number, n: number): Spec[] {
  const out: Spec[] = [];
  for (let i = 0; i < n; i++) {
    let side: Spec = rnd() < 0.5 ? L : R;
    const a = out[out.length - 1], b = out[out.length - 2];
    if (a && b && a[1] === side[1] && b[1] === side[1]) side = side === L ? R : L;
    out.push(side);
  }
  return out;
}

/**
 * The nine floor curricula (same 3 difficulties x 3 stages as WALL; stage titles/themes come from STAGES unchanged).
 * Advanced means variety, not speed or effort.
 */
export function generateFloorObjectives(stageIndex: number, seed: number): FloorObjective[] {
  const rnd = mulberry32(hashSeed("rq3f", stageIndex, seed));
  const flip = rnd() < 0.5; // which side a predictable pattern starts on
  const m = (specs: readonly Spec[]) => (flip ? mirror(specs) : [...specs]);
  switch (stageIndex) {
    // EASY
    case 0: return make(m([L, L, L, R, R, R])); // one simple direction at a time (three of a kind, then the other side)
    case 1: return make(m([L, R, L, R, L, R])); // short predictable sequence
    case 2: return make(seededSides(rnd, 8)); // gentle left/right variation (never three in a row)
    // MEDIUM
    case 3: return make(m([L, C, R, C, L, C, R, C])); // alternating directional cues, back to the centre between
    case 4: return make(m([L, R, Z, R, L, Z, L, R, C, Z])); // short route with optional rests
    case 5: return make(m([L, R, C, S, R, L, C, S, L, R])); // varied but predictable
    // ADVANCED
    case 6: { // longer journey: seeded, includes "choose the lit region" and rests
      const sides = seededSides(rnd, 8);
      const out: Spec[] = [];
      sides.forEach((s, i) => {
        out.push(i % 3 === 2 ? (s === L ? CL : CR) : s);
        if (i === 2 || i === 5) out.push(C);
        if (i === 3) out.push(Z);
      });
      out.push(CC);
      return make(out); // 8 + 2 + 1 + 1 = 12
    }
    case 7: return make(m([L, S, R, S, C, L, R, S, C, R, L, Z])); // combination of directional actions + steps
    case 8: return make(m([L, R, C, S, CL, CR, Z, L, S, R, C, CC, S, CL])); // everything, 14 objectives, ends on a choice
    default: return [];
  }
}

export const floorObjectiveCount = (stageIndex: number): number => generateFloorObjectives(stageIndex, 0).length;

export const FLOOR_OBJECTIVE_COUNTS: readonly number[] = STAGES.map((_, i) => floorObjectiveCount(i));

/** Compact outcome codes shared with the Display: '.' pending, 'c' completed, 'a' assisted, 's' skipped, 'r' rest taken. */
export type OutcomeCode = "." | "c" | "a" | "s" | "r";

/**
 * Plan sanity for tests: every objective is reachable by one therapist confirmation, region targets are in range,
 * and no plan demands more than MAX_RUN identical region targets in a row.
 */
export function validateFloorPlan(objs: readonly FloorObjective[]): string[] {
  const issues: string[] = [];
  let run = 0, prev: Lane | null | undefined;
  for (const o of objs) {
    if (o.kind === "region") {
      if (o.target !== -1 && o.target !== 0 && o.target !== 1) issues.push(`${o.id}: region without a valid target`);
      run = o.target === prev ? run + 1 : 1;
      prev = o.target;
      if (run > 3 && o.variant !== "neutral") issues.push(`${o.id}: ${run} identical targets in a row`);
    } else {
      if (o.target !== null) issues.push(`${o.id}: ${o.kind} must not carry a target`);
      prev = undefined; run = 0;
    }
  }
  if (objs.length < 4) issues.push("too few objectives");
  return issues;
}
