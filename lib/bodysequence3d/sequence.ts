/**
 * Deterministic movement-sequence model shared by all five exercise modes. A "round" is one short ordered sequence of
 * steps; a stage is a list of rounds. Nothing here knows about time, sensors or rendering.
 *
 * Feet are named from the CHILD'S body ('R' = the child's right foot). Lanes are named from the child's point of view
 * as well: 'L' is on the child's left, 'R' on the child's right, 'C' in the middle and 'H' is the neutral stance (feet
 * side by side) used by "return" steps. The Display maps child-space to screen-space; the model never does.
 */
export type Foot = 'R' | 'L';
export type Lane = 'L' | 'C' | 'R' | 'H';
export type MoveType = 'step' | 'center' | 'return' | 'stop';
export type Mode = 'follow' | 'remember' | 'alternate' | 'holdmove' | 'stopgo';
export const MODES: readonly Mode[] = ['follow', 'remember', 'alternate', 'holdmove', 'stopgo'];

export interface Anchor { foot: Foot; lane: Lane }
export interface Step {
  /** Unique within a stage: `r<round>s<order>`. */
  id: string;
  order: number;
  /** The foot that moves. A stop signal has no foot. */
  foot: Foot | 'any';
  lane: Lane;
  move: MoveType;
  /** 0 = no hold. For hold-and-move: how long the other foot stays. For a stop signal: how long to stand still. */
  holdMs: number;
  /** Hold-and-move only: the foot that stays where it is while `foot` moves. */
  anchor: Anchor | null;
}
export interface Round { mode: Mode; lanes: 2 | 3; preview: boolean; showAll: boolean; steps: Step[] }

export interface RoundSpec { mode: Mode; len: number; returns?: boolean; preview?: boolean }

/** Which lanes each foot may be asked to move to. Default: no leg crossing, no forced wide stance. */
export interface Allow { R: string; L: string }
export const DEFAULT_ALLOW: Allow = { R: 'CR', L: 'LC' };
export type FeetSetting = 'both' | 'R' | 'L';

export interface BuildOpts {
  lanes: 2 | 3;
  feet: FeetSetting;
  allow: Allow;
  holdMs: number;
  holds: boolean;
  seed: number;
}

export const PREVIEW_STEP_MS = 1300;
export const PREVIEW_LEAD_MS = 1200;
export const previewMs = (len: number) => PREVIEW_LEAD_MS + len * PREVIEW_STEP_MS;

/** mulberry32 over a string-ish integer seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mixSeed = (...n: number[]) => n.reduce((h, v) => (Math.imul(h ^ (v | 0), 0x45d9f3b) + 0x9e3779b9) >>> 0, 0x811c9dc5);

const other = (f: Foot): Foot => (f === 'R' ? 'L' : 'R');
export const sideLane = (f: Foot): Lane => f;

export function allowedLanes(foot: Foot, lanes: 2 | 3, allow: Allow): Lane[] {
  const pool: Lane[] = lanes === 2 ? ['L', 'R'] : ['L', 'C', 'R'];
  const ok = pool.filter((l) => allow[foot].includes(l));
  return ok.length ? ok : [sideLane(foot)];
}

function movingFeet(feet: FeetSetting): Foot[] {
  return feet === 'both' ? ['R', 'L'] : [feet];
}

function mkStep(round: number, order: number, foot: Foot | 'any', lane: Lane, move: MoveType, holdMs = 0, anchor: Anchor | null = null): Step {
  return { id: `r${round}s${order}`, order, foot, lane, move, holdMs, anchor };
}

const moveOf = (lane: Lane): MoveType => (lane === 'C' ? 'center' : 'step');

/** Builds one round. Same inputs always give the same round. */
export function buildRound(spec: RoundSpec, roundIndex: number, stage: number, o: BuildOpts): Round {
  const rand = rng(mixSeed(o.seed, stage, roundIndex));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length) % xs.length];
  const feet = movingFeet(o.feet);
  const steps: Step[] = [];
  const same = (a: Step | undefined, foot: Foot | 'any', lane: Lane, move: MoveType) => !!a && a.foot === foot && a.lane === lane && a.move === move;
  const hold = o.holds ? o.holdMs : 0;
  let lastFoot: Foot | null = null;
  const pushMove = (foot: Foot, lane: Lane) => steps.push(mkStep(roundIndex, steps.length, foot, lane, moveOf(lane)));
  const choose = (foot: Foot, avoidPrev: boolean): Lane => {
    const lanes = allowedLanes(foot, o.lanes, o.allow);
    const prev = steps.at(-1);
    const pool = avoidPrev ? lanes.filter((l) => !same(prev, foot, l, moveOf(l))) : lanes;
    return pick(pool.length ? pool : lanes);
  };
  const nextFoot = (alt: boolean): Foot => {
    if (feet.length === 1) return feet[0];
    if (alt && lastFoot) return other(lastFoot);
    return pick(feet);
  };

  for (let i = 0; i < spec.len; i++) {
    switch (spec.mode) {
      case 'follow':
      case 'remember': {
        // the first step starts from either foot; later steps prefer the other foot so both sides are practised
        let foot = nextFoot(i > 0 && rand() < 0.7);
        let lane = choose(foot, true);
        if (same(steps.at(-1), foot, lane, moveOf(lane)) && feet.length > 1) { foot = other(foot); lane = choose(foot, false); }
        pushMove(foot, lane);
        lastFoot = foot;
        break;
      }
      case 'alternate': {
        const foot = i === 0 ? (feet.length === 1 ? feet[0] : pick(feet)) : nextFoot(true);
        // alternate with the foot's own side first; later visits to a three-lane layout may use the centre
        const lanes = allowedLanes(foot, o.lanes, o.allow);
        const prevSame = steps.filter((s) => s.foot === foot).at(-1);
        const pool = prevSame ? lanes.filter((l) => l !== prevSame.lane) : [sideLane(foot)].filter((l) => lanes.includes(l));
        pushMove(foot, pick(pool.length ? pool : lanes));
        lastFoot = foot;
        break;
      }
      case 'holdmove': {
        // the staying foot keeps its own side; the other foot (or the only allowed foot) moves
        const mover = nextFoot(true);
        const anchorFoot = other(mover);
        const lanes = allowedLanes(mover, o.lanes, o.allow).filter((l) => l !== sideLane(anchorFoot));
        const lane = pick(lanes.length ? lanes : [sideLane(mover)]);
        steps.push(mkStep(roundIndex, steps.length, mover, lane, moveOf(lane), hold, { foot: anchorFoot, lane: sideLane(anchorFoot) }));
        lastFoot = mover;
        break;
      }
      case 'stopgo': {
        // pattern: move, stop, move, stop … (a stop is a short still pose, never a speed demand)
        if (i % 2 === 1) steps.push(mkStep(roundIndex, steps.length, 'any', 'H', 'stop', hold));
        else {
          const foot = nextFoot(true);
          pushMove(foot, choose(foot, true));
          lastFoot = foot;
        }
        break;
      }
    }
  }
  if (spec.returns && steps.length >= 3) {
    // the last step becomes "bring that foot back to the neutral stance"
    const before = [...steps].reverse().find((s) => s.foot !== 'any' && s.move !== 'stop');
    const foot: Foot = before && before.foot !== 'any' ? before.foot : 'R';
    steps[steps.length - 1] = mkStep(roundIndex, steps.length - 1, foot, 'H', 'return');
  }
  const preview = spec.preview ?? spec.mode === 'remember';
  return { mode: spec.mode, lanes: o.lanes, preview, showAll: spec.mode === 'follow' && spec.len >= 3, steps };
}
