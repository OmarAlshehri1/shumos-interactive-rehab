/**
 * Rhythm Steps 3D engine: a pure reducer. The therapist's Control is the only place it runs; the child's Display only
 * renders the state it is sent. Time enters only through `tick` / command timestamps, so everything is deterministic.
 *
 * GAMEPLAY CLOCK. `clock` (game ms, per stage) is the single authority for target position, arrival, hold progress, the
 * music beat grid and the miss window. It advances by `dt * speed` while the session runs and never otherwise, so:
 *  - pause freezes it; resume re-bases `lastTick`, so there is no jump;
 *  - a speed change alters only the rate, never any arrival time, so everything stays in sync;
 *  - Assisted Flow stalls the clock at the line of the earliest unconfirmed target (the stream waits for the therapist).
 * A target's arrival is fixed on a beat grid; its position is a pure function of (arrival - clock).
 *
 * NOTHING IS A FAILURE. A target nobody confirms is recorded as `missed` (unconfirmed). There is no score, no penalty and
 * no failed state. A therapist confirmation is the only way an exercise counts as done: sensors give hints at most.
 */
import { activeLanes, DEFAULT_CONFIG, sanitizeConfig, speedOf, type Config } from './config';
import { BEAT_MS, STAGES, genItems, type Item, type StepKind, type Target } from './stages';
import type { FootRole } from '@/lib/safehexarena3d/sensorInput';

export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export type Outcome = 'pending' | 'confirmed' | 'assisted' | 'skipped' | 'missed';

export const KIND_ORDER: readonly StepKind[] = ['single', 'both', 'dual', 'split', 'hold', 'jump'];
export const MAX_TICK_MS = 250;
/** Game ms the arena stays after the last target before the stage is declared complete (lets the last effect play). */
export const SETTLE_MS = 1500;
export const LEAD_BEATS = 2;

export interface Step {
  id: string;
  /** Index of the exercise in the stage pattern (repeats keep the original index). */
  i: number;
  kind: StepKind;
  targets: Target[];
  /** Game-clock time the target reaches the line. */
  arrival: number;
  gapB: number;
  holdMs: number;
  seq: [number, number, number] | null;
  out: Outcome;
  /** Clock time the therapist started the hold, or -1. */
  holdAt: number;
  /** Clock time of the outcome (0 while pending). */
  at: number;
  rep: number;
}

export interface StageStat {
  total: number;
  confirmed: number;
  assisted: number;
  skipped: number;
  missed: number;
  /** Resolved exercises by kind, in KIND_ORDER. */
  k: number[];
  reps: number;
  /** Real ms the session ran while this stage was active. */
  activeMs: number;
  /** Bit 1 = continuous flow was used, bit 2 = assisted flow was used. */
  flows: number;
}

export interface SensorState {
  link: Record<FootRole, 'none' | 'ok' | 'lost'>;
  lastSeq: Record<FootRole, number>;
  /** Accepted movement-onset hints in this run. Hints only: never a placement, never a confirmation. */
  movements: number;
  /** A movement hint arrived and awaits the therapist. */
  pending: boolean;
  lastRole: FootRole | null;
}

export interface State {
  sessionId: string;
  seed: number;
  run: number;
  stage: number;
  status: Status;
  /** Game ms into the current stage. */
  clock: number;
  /** Real wall-clock of the last accepted tick (Control-local). */
  lastTick: number;
  startedAt: number;
  endedAt: number;
  /** The pause was a therapist safety hold (or a lost connection) and needs an explicit resume. */
  safety: boolean;
  /** New targets are being spawned. Off = the stream is temporarily stopped. */
  spawnOn: boolean;
  /** Clock time at which every target was resolved, or -1. */
  doneAt: number;
  steps: Step[];
  stats: StageStat[];
  completed: number[];
  skipped: number[];
  config: Config;
  sensor: SensorState;
}

export type Command =
  | { type: 'configure'; config: Partial<Config> }
  | { type: 'start'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'pause' }
  | { type: 'safety' }
  | { type: 'resume'; at: number }
  | { type: 'confirm'; id: string; assisted: boolean }
  | { type: 'startHold'; id: string }
  | { type: 'cancelHold'; id: string }
  | { type: 'completeHold'; id: string; assisted: boolean }
  | { type: 'skip'; id: string }
  | { type: 'repeat' }
  | { type: 'spawn'; on: boolean }
  | { type: 'stage'; stage: number }
  | { type: 'skipStage'; at: number }
  | { type: 'next'; at: number }
  | { type: 'restart' }
  | { type: 'end'; at: number }
  | { type: 'dismissHint' }
  | { type: 'sensor'; role: FootRole; event: 'onset' | 'rest' | 'lost' | 'resumed'; seq: number; at: number };

export const travelMs = (stage: number) => STAGES[stage].travelBeats * BEAT_MS;
const ceilBeat = (ms: number) => Math.ceil(ms / BEAT_MS - 1e-9) * BEAT_MS;
const emptyStat = (): StageStat => ({ total: 0, confirmed: 0, assisted: 0, skipped: 0, missed: 0, k: KIND_ORDER.map(() => 0), reps: 0, activeMs: 0, flows: 0 });
const freshSensor = (): SensorState => ({ link: { RIGHT_FOOT: 'none', LEFT_FOOT: 'none' }, lastSeq: { RIGHT_FOOT: 0, LEFT_FOOT: 0 }, movements: 0, pending: false, lastRole: null });

export function seedOf(sessionId: string): number {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) h = Math.imul(h ^ sessionId.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483647;
}

const stepId = (run: number, stage: number, i: number, rep: number) => `${run}:${stage}:${i}:${rep}`;

/** The full target stream of a stage, timed on the beat grid starting after a short lead-in. */
export function planStage(stage: number, seed: number, run: number, cfg: Config): Step[] {
  const items = genItems(stage, seed, cfg);
  let arrival = travelMs(stage) + LEAD_BEATS * BEAT_MS;
  return items.map((it, i) => {
    if (i > 0) arrival += it.gapB * BEAT_MS;
    return itemToStep(it, i, arrival, run, stage, 0);
  });
}

function itemToStep(it: Item, i: number, arrival: number, run: number, stage: number, rep: number): Step {
  return { id: stepId(run, stage, i, rep), i, kind: it.kind, targets: it.targets.map((t) => ({ ...t })), arrival, gapB: it.gapB, holdMs: it.holdMs, seq: it.seq ? [...it.seq] : null, out: 'pending', holdAt: -1, at: 0, rep };
}

export function createState(sessionId: string): State {
  const seed = seedOf(sessionId);
  const config = DEFAULT_CONFIG;
  return {
    sessionId, seed, run: 1, stage: 0, status: 'ready', clock: 0, lastTick: 0, startedAt: 0, endedAt: 0, safety: false, spawnOn: true, doneAt: -1,
    steps: planStage(0, seed, 1, config), stats: Array.from({ length: 9 }, emptyStat), completed: [], skipped: [], config, sensor: freshSensor(),
  };
}

export const isLive = (s: State) => s.status === 'running' || s.status === 'paused';
export const spawnedAt = (st: Step, stage: number) => st.arrival - travelMs(stage);
export const isSpawned = (s: State, st: Step) => spawnedAt(st, s.stage) <= s.clock;
/** The exercise the therapist acts on: the earliest unresolved target that is already on its way. */
export const currentStep = (s: State): Step | null => s.steps.find((st) => st.out === 'pending' && isSpawned(s, st)) ?? null;
export const pendingSteps = (s: State) => s.steps.filter((st) => st.out === 'pending');
/** 0 at the far end, 1 at the line. */
export const progressOf = (arrival: number, clock: number, stage: number) => 1 - (arrival - clock) / travelMs(stage);
export const played = (s: State, stage: number) => s.stats[stage].total > 0 || s.completed.includes(stage) || s.skipped.includes(stage);

/** Clock the stage may not pass: in Assisted Flow it stalls at the earliest unconfirmed target. */
function gateOf(s: State): number {
  if (s.config.flow !== 'assisted') return Infinity;
  if (s.steps.some((st) => st.out === 'pending' && st.holdAt >= 0)) return Infinity;
  const p = s.steps.find((st) => st.out === 'pending');
  return p ? p.arrival : Infinity;
}

function addOutcome(stat: StageStat, kind: StepKind, out: Exclude<Outcome, 'pending'>): StageStat {
  const k = stat.k.slice();
  k[KIND_ORDER.indexOf(kind)]++;
  return { ...stat, total: stat.total + 1, [out]: stat[out] + 1, k };
}

function resolveStep(s: State, id: string, out: Exclude<Outcome, 'pending'>): State {
  const idx = s.steps.findIndex((st) => st.id === id);
  if (idx < 0 || s.steps[idx].out !== 'pending') return s; // never resolved twice
  const steps = s.steps.slice();
  steps[idx] = { ...steps[idx], out, at: s.clock, holdAt: steps[idx].holdAt };
  const stats = s.stats.slice();
  stats[s.stage] = addOutcome(stats[s.stage], steps[idx].kind, out);
  const allDone = steps.every((st) => st.out !== 'pending');
  return { ...s, steps, stats, doneAt: allDone ? s.clock : -1, sensor: s.sensor.pending ? { ...s.sensor, pending: false } : s.sensor };
}

/** Re-times unspawned steps from `from` onward, chaining their gaps. */
function retime(steps: Step[], from: number, stage: number, clock: number): Step[] {
  const out = steps.slice();
  const earliest = ceilBeat(clock + travelMs(stage) + BEAT_MS);
  for (let j = from; j < out.length; j++) {
    const chained = j === 0 ? out[0].arrival : out[j - 1].arrival + out[j].gapB * BEAT_MS;
    out[j] = { ...out[j], arrival: j === from ? Math.max(chained, earliest) : chained };
  }
  return out;
}

const PLAN_KEYS: (keyof Config)[] = ['laneSet', 'limbs', 'allow', 'stanceWidth', 'sided', 'holdMs', 'jumping', 'fast', 'anchor', 'spacing', 'graceMs'];

/** Rebuilds the not-yet-visible part of the stream after a therapist setting changed. Targets already on screen never change. */
function replanTail(s: State, cfg: Config): State {
  const items = genItems(s.stage, s.seed, cfg);
  let k = s.steps.findIndex((st) => st.out === 'pending' && st.holdAt < 0 && !isSpawned(s, st));
  if (k < 0) return s;
  // start at the beginning of a sequence, never in the middle of one
  while (k > 0 && s.steps[k].seq && s.steps[k].seq![1] > 0 && s.steps[k - 1].out === 'pending' && !isSpawned(s, s.steps[k - 1])) k--;
  const head = s.steps.slice(0, k);
  const tail = s.steps.slice(k).filter((st) => st.rep === 0 && st.out === 'pending');
  const fresh = tail.map((st) => itemToStep(items[st.i], st.i, st.arrival, s.run, s.stage, 0));
  return { ...s, steps: retime([...head, ...fresh], k, s.stage, s.clock) };
}

function unspawnedShift(steps: Step[], stage: number, clock: number, by: number): Step[] {
  let changed = false;
  const out = steps.map((st) => {
    if (st.out === 'pending' && st.holdAt < 0 && spawnedAt(st, stage) > clock) {
      changed = true;
      return { ...st, arrival: st.arrival + by };
    }
    return st;
  });
  return changed ? out : steps;
}

function beginStage(s: State, stage: number): State {
  return { ...s, stage, status: 'ready', clock: 0, lastTick: 0, safety: false, spawnOn: true, doneAt: -1, steps: planStage(stage, s.seed, s.run, s.config), sensor: { ...s.sensor, pending: false } };
}

function finish(s: State, at: number): State {
  if (s.status === 'ended') return s;
  // targets that were already on screen count as unconfirmed; ones that never appeared are not counted
  const stats = s.stats.slice();
  for (const st of s.steps) if (st.out === 'pending' && isSpawned(s, st) && s.status !== 'ready') stats[s.stage] = addOutcome(stats[s.stage], st.kind, 'missed');
  const steps = s.steps.map((st) => (st.out === 'pending' && isSpawned(s, st) && s.status !== 'ready' ? { ...st, out: 'missed' as const, at: s.clock } : st));
  return { ...s, steps, stats, status: 'ended', endedAt: at, safety: false };
}

export function reduce(s: State, c: Command): State {
  switch (c.type) {
    case 'configure': {
      if (s.status === 'ended') return s;
      const config = sanitizeConfig(c.config, s.config);
      const next: State = { ...s, config, sensor: config.inputMode !== s.config.inputMode ? freshSensor() : s.sensor };
      const planChanged = PLAN_KEYS.some((k) => JSON.stringify(config[k]) !== JSON.stringify(s.config[k]));
      // the stage's pattern is regenerated only between stages or for targets that are not yet visible
      const noProgress = s.status === 'ready' && s.stats[s.stage].total === 0 && s.clock === 0;
      if (!planChanged) return next;
      return noProgress ? { ...next, steps: planStage(s.stage, s.seed, s.run, config) } : replanTail(next, config);
    }
    case 'start': {
      if (s.status !== 'ready') return s;
      return { ...s, status: 'running', lastTick: c.at, startedAt: s.startedAt || c.at, safety: false };
    }
    case 'tick': {
      if (s.status !== 'running') return s;
      const dt = Math.min(MAX_TICK_MS, Math.max(0, c.at - s.lastTick));
      if (dt === 0) return { ...s, lastTick: Math.max(s.lastTick, c.at) };
      const adv = dt * speedOf(s.config);
      const clock = Math.max(s.clock, Math.min(s.clock + adv, gateOf(s)));
      const steps = s.spawnOn ? s.steps : unspawnedShift(s.steps, s.stage, s.clock, adv);
      let next: State = { ...s, lastTick: c.at, clock, steps };
      const stats = s.stats.slice();
      stats[s.stage] = { ...stats[s.stage], activeMs: stats[s.stage].activeMs + dt, flows: stats[s.stage].flows | (s.config.flow === 'assisted' ? 2 : 1) };
      next = { ...next, stats };
      // holds the therapist started finish by themselves once their time has passed on the gameplay clock
      for (const st of next.steps) {
        if (st.out === 'pending' && st.holdAt >= 0 && clock - st.holdAt >= st.holdMs) next = resolveStep(next, st.id, 'confirmed');
      }
      if (s.config.flow === 'continuous') {
        for (const st of next.steps) {
          if (st.out === 'pending' && st.holdAt < 0 && clock > st.arrival + s.config.graceMs) next = resolveStep(next, st.id, 'missed');
        }
      }
      if (next.doneAt >= 0 && clock - next.doneAt >= SETTLE_MS) {
        return { ...next, status: 'stage-complete', completed: next.completed.includes(next.stage) ? next.completed : [...next.completed, next.stage] };
      }
      return next;
    }
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused', safety: false } : s;
    case 'safety':
      return s.status === 'running' ? { ...s, status: 'paused', safety: true } : s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', safety: false, lastTick: c.at } : s;
    case 'confirm': {
      if (!isLive(s)) return s;
      const st = s.steps.find((x) => x.id === c.id);
      if (!st || st.out !== 'pending' || !isSpawned(s, st)) return s;
      if (st.kind === 'hold' && st.holdAt < 0) return s; // a hold is started first, by the therapist
      return resolveStep(s, c.id, c.assisted ? 'assisted' : 'confirmed');
    }
    case 'startHold': {
      if (s.status !== 'running') return s;
      const i = s.steps.findIndex((x) => x.id === c.id);
      const st = s.steps[i];
      if (!st || st.kind !== 'hold' || st.out !== 'pending' || st.holdAt >= 0 || !isSpawned(s, st)) return s;
      const steps = s.steps.slice();
      steps[i] = { ...st, holdAt: s.clock };
      return { ...s, steps };
    }
    case 'cancelHold': {
      const i = s.steps.findIndex((x) => x.id === c.id);
      const st = s.steps[i];
      if (!isLive(s) || !st || st.out !== 'pending' || st.holdAt < 0) return s;
      const steps = s.steps.slice();
      steps[i] = { ...st, holdAt: -1 };
      return { ...s, steps };
    }
    case 'completeHold': {
      if (!isLive(s)) return s;
      const st = s.steps.find((x) => x.id === c.id);
      if (!st || st.kind !== 'hold' || st.out !== 'pending' || !isSpawned(s, st)) return s;
      return resolveStep(s, c.id, c.assisted ? 'assisted' : 'confirmed');
    }
    case 'skip': {
      if (!isLive(s)) return s;
      const st = s.steps.find((x) => x.id === c.id);
      if (!st || st.out !== 'pending' || !isSpawned(s, st)) return s;
      return resolveStep(s, c.id, 'skipped');
    }
    case 'repeat': {
      if (!isLive(s)) return s;
      // the most recently resolved exercise is queued again, behind everything already on its way
      const resolved = s.steps.filter((x) => x.out !== 'pending').sort((a, b) => b.at - a.at || b.arrival - a.arrival)[0];
      if (!resolved) return s;
      const lastSpawned = s.steps.reduce((m, x, idx) => (isSpawned(s, x) ? idx : m), -1);
      const rep = Math.max(...s.steps.filter((x) => x.i === resolved.i).map((x) => x.rep)) + 1;
      const at = Math.max(lastSpawned >= 0 ? s.steps[lastSpawned].arrival + 2 * BEAT_MS : 0, ceilBeat(s.clock + travelMs(s.stage) + BEAT_MS));
      const clone: Step = { ...resolved, id: stepId(s.run, s.stage, resolved.i, rep), arrival: at, out: 'pending', holdAt: -1, at: 0, rep, gapB: 2 };
      const steps = [...s.steps.slice(0, lastSpawned + 1), clone, ...s.steps.slice(lastSpawned + 1)];
      const stats = s.stats.slice();
      stats[s.stage] = { ...stats[s.stage], reps: stats[s.stage].reps + 1 };
      return { ...s, steps: retime(steps, lastSpawned + 2, s.stage, s.clock), stats, doneAt: -1 };
    }
    case 'spawn': {
      if (!isLive(s) || s.spawnOn === c.on) return s;
      // resuming re-snaps the waiting targets to the beat grid, so music and arrivals stay aligned
      const steps = c.on ? s.steps.map((st) => (st.out === 'pending' && st.holdAt < 0 && spawnedAt(st, s.stage) > s.clock ? { ...st, arrival: ceilBeat(st.arrival) } : st)) : s.steps;
      return { ...s, spawnOn: c.on, steps };
    }
    case 'stage': {
      if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > 8) return s;
      if (!['ready', 'paused', 'stage-complete'].includes(s.status)) return s;
      if (c.stage !== s.stage && played(s, c.stage)) return s;
      if (c.stage === s.stage && s.status === 'stage-complete') return s;
      return beginStage(s, c.stage);
    }
    case 'skipStage': {
      if (s.status === 'ended' || s.status === 'stage-complete') return s;
      const skipped = s.skipped.includes(s.stage) ? s.skipped : [...s.skipped, s.stage];
      const base = { ...s, skipped };
      return s.stage >= 8 ? finish(base, c.at) : beginStage(base, s.stage + 1);
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      return s.stage >= 8 ? finish(s, c.at) : beginStage(s, s.stage + 1);
    }
    case 'restart': {
      const fresh = createState(s.sessionId);
      return { ...fresh, run: s.run + 1, seed: s.seed, config: s.config, steps: planStage(0, s.seed, s.run + 1, s.config), sensor: { ...freshSensor(), link: s.sensor.link } };
    }
    case 'end':
      return finish(s, c.at);
    case 'dismissHint':
      return s.sensor.pending ? { ...s, sensor: { ...s.sensor, pending: false } } : s;
    case 'sensor': {
      if (!Number.isInteger(c.seq) || c.seq <= s.sensor.lastSeq[c.role]) return s;
      const lastSeq = { ...s.sensor.lastSeq, [c.role]: c.seq };
      const link = { ...s.sensor.link, [c.role]: c.event === 'lost' ? 'lost' : 'ok' } as SensorState['link'];
      const onset = c.event === 'onset' && s.status === 'running';
      // a movement hint is only ever a hint: it never resolves a target and never starts a hold
      return { ...s, sensor: { ...s.sensor, lastSeq, link, movements: s.sensor.movements + (onset ? 1 : 0), pending: s.sensor.pending || onset, lastRole: onset ? c.role : s.sensor.lastRole } };
    }
  }
}

export interface Summary {
  presented: number;
  confirmed: number;
  assisted: number;
  skipped: number;
  missed: number;
  singleFoot: number;
  twoFoot: number;
  hold: number;
  reps: number;
  activeMs: number;
  kinds: number[];
}

export function summary(s: State): Summary {
  const sum = KIND_ORDER.map((_, i) => s.stats.reduce((a, st) => a + st.k[i], 0));
  const add = (f: (st: StageStat) => number) => s.stats.reduce((a, st) => a + f(st), 0);
  return {
    presented: add((x) => x.total), confirmed: add((x) => x.confirmed), assisted: add((x) => x.assisted), skipped: add((x) => x.skipped), missed: add((x) => x.missed),
    singleFoot: sum[0], twoFoot: sum[1] + sum[2] + sum[3] + sum[5], hold: sum[4], reps: add((x) => x.reps), activeMs: add((x) => x.activeMs), kinds: sum,
  };
}

export const hasActivity = (s: State) => s.stats.some((st) => st.total > 0) || s.completed.length > 0 || s.skipped.length > 0;
export const laneIndexOf = (s: State, lane: number) => activeLanes(s.config).indexOf(lane);
