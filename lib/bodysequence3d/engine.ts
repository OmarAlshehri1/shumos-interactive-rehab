import { DEFAULT_CONFIG, sanitizeConfig, STRUCTURAL_KEYS, type Config } from './config';
import { previewMs, type Mode, type Round, type Step } from './sequence';
import { roundsFor, STAGES } from './stages';
import type { FootEvent, FootRole } from '@/lib/safehexarena3d/sensorInput';
import { FOOT_ROLES } from '@/lib/safehexarena3d/sensorInput';

/**
 * Body Sequence game engine: a pure reducer. It owns what happened (which movement was confirmed, repeated, skipped or
 * marked incorrect); the Display only renders it. NOTHING here is inferred from a sensor: a movement is resolved only by
 * an explicit therapist command, a hold ends only by the therapist's clock, and a memory preview is only a display aid.
 * Playing an animation never counts as completing a movement.
 *
 * `clock` is RUNNING time in ms: it advances only through `tick` while status is 'running', so pause / safety / a lost
 * connection freeze every countdown, preview, hold and intermission at once.
 */
export type Outcome = 'pending' | 'confirmed' | 'assisted' | 'skipped';
export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export type Phase = 'preview' | 'perform';
export const COUNTDOWN_MS = 3000;
/** Pause between a finished sequence and the next one: the reward animation plays here. */
export const INTER_MS = 2600;
export const MAX_ROUNDS = 6;
export const MAX_STEPS = 4;

export interface StageStat {
  /** One outcome list per round, sized when the stage began. Every count below is derived from this or counted. */
  res: Outcome[][];
  incorrect: number;
  repeats: number;
  replays: number;
  holds: number;
  holdsAssisted: number;
  activeMs: number;
}

export interface Hold { round: number; step: number; startedAt: number; ms: number; assisted: boolean }
export interface Cue { kind: 'incorrect' | 'order' | 'repeat' | 'back' | 'replay' | 'skip'; n: number }

export interface State {
  sessionId: string;
  seed: number;
  run: number;
  /** Bumped by a stage restart so the same stage shows fresh sequences. */
  salt: number;
  stage: number;
  status: Status;
  safety: boolean;
  config: Config;
  clock: number;
  lastTick: number;
  startedAt: number;
  endedAt: number;
  /** Running-clock instant at which the countdown ends and confirmations open. */
  goAt: number;
  round: number;
  phase: Phase;
  /** Running-clock instant at which the current preview started (>= goAt for the first round). */
  previewAt: number;
  /** Running-clock instant until which the finished sequence is celebrated (0 = none). */
  inter: number;
  hold: Hold | null;
  /** Counts up on every resolved movement / finished sequence: presentation keys for the success animations. */
  stepSeq: number;
  roundSeq: number;
  /** Presentation-only pulse (gentle feedback). */
  cue: Cue | null;
  stats: StageStat[];
  completed: number[];
  skipped: number[];
  sensor: { link: Record<FootRole, 'none' | 'ok' | 'lost'>; lastSeq: Record<FootRole, number>; movements: number; pending: boolean };
}

const emptyStat = (): StageStat => ({ res: [], incorrect: 0, repeats: 0, replays: 0, holds: 0, holdsAssisted: 0, activeMs: 0 });

export function createState(sessionId: string, seed = Math.floor(Math.random() * 2147483647)): State {
  return {
    sessionId, seed, run: 0, salt: 0, stage: 0, status: 'ready', safety: false, config: DEFAULT_CONFIG,
    clock: 0, lastTick: 0, startedAt: 0, endedAt: 0, goAt: 0, round: 0, phase: 'perform', previewAt: 0, inter: 0, hold: null,
    stepSeq: 0, roundSeq: 0, cue: null,
    stats: Array.from({ length: 9 }, emptyStat), completed: [], skipped: [],
    sensor: { link: { RIGHT_FOOT: 'none', LEFT_FOOT: 'none' }, lastSeq: { RIGHT_FOOT: 0, LEFT_FOOT: 0 }, movements: 0, pending: false },
  };
}

export type Command =
  | { type: 'configure'; config: Partial<Config> }
  | { type: 'selectStage'; stage: number }
  | { type: 'start'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'pause' }
  | { type: 'safety' }
  | { type: 'resume'; at: number }
  | { type: 'confirm'; assisted: boolean; step?: number }
  | { type: 'completeHold'; assisted: boolean }
  | { type: 'incorrect' }
  | { type: 'replay' }
  | { type: 'endPreview' }
  | { type: 'skip' }
  | { type: 'repeat'; prev: boolean }
  | { type: 'skipStage'; at: number }
  | { type: 'restartStage' }
  | { type: 'next'; at: number }
  | { type: 'end'; at: number }
  | { type: 'restart' }
  | { type: 'dismissHint' }
  | ({ type: 'sensor' } & FootEvent);

export const rounds = (s: State): Round[] => roundsFor(s.stage, s.config, s.seed, s.salt);
export const currentRound = (s: State): Round => rounds(s)[Math.min(s.round, STAGES[s.stage].rounds.length - 1)];
export const stat = (s: State): StageStat => s.stats[s.stage];
/** Index of the movement the child performs now (-1 when the round is fully resolved). */
export const activeStep = (s: State): number => stat(s).res[s.round]?.findIndex((r) => r === 'pending') ?? -1;
export const stepNow = (s: State): Step | null => {
  const i = activeStep(s);
  return i < 0 ? null : currentRound(s).steps[i] ?? null;
};
export const countdownLeft = (s: State): number => Math.max(0, s.goAt - s.clock);
export const previewLeft = (s: State): number => (s.phase === 'preview' ? Math.max(0, Math.max(s.previewAt, s.goAt) + previewMs(currentRound(s).steps.length) - s.clock) : 0);
/** Confirmations are open: running, countdown over, memory preview over, not in the pause between sequences, no hold running. */
export const canConfirm = (s: State): boolean => s.status === 'running' && s.clock >= s.goAt && s.inter === 0 && s.phase === 'perform' && !s.hold && activeStep(s) >= 0;
/** Number of finished sequences (rounds fully resolved) in the current stage. */
export const sequencesDone = (s: State): number => stat(s).res.filter((rr) => rr.length > 0 && rr.every((o) => o !== 'pending')).length;

const withStat = (s: State, patch: Partial<StageStat>): State => ({ ...s, stats: s.stats.map((t, i) => (i === s.stage ? { ...t, ...patch } : t)) });
const setRes = (s: State, round: number, step: number, o: Outcome): Outcome[][] => stat(s).res.map((rr, ri) => (ri === round ? rr.map((x, si) => (si === step ? o : x)) : rr));
const cueOf = (s: State, kind: Cue['kind']): Cue => ({ kind, n: (s.cue?.n ?? 0) + 1 });

function beginStage(s: State, at: number): State {
  const rs = rounds(s);
  const prev = stat(s);
  const fresh: StageStat = { ...emptyStat(), res: rs.map((r) => r.steps.map(() => 'pending' as Outcome)), activeMs: prev.activeMs };
  return {
    ...s, status: 'running', safety: false, lastTick: at, startedAt: s.startedAt || at,
    goAt: s.clock + COUNTDOWN_MS, round: 0, phase: rs[0].preview ? 'preview' : 'perform', previewAt: s.clock + COUNTDOWN_MS, inter: 0, hold: null, cue: null,
    stats: s.stats.map((t, i) => (i === s.stage ? fresh : t)),
    sensor: { ...s.sensor, pending: false },
  };
}

function finishStage(s: State): State {
  return { ...s, status: 'stage-complete', hold: null, inter: 0, completed: s.completed.includes(s.stage) ? s.completed : [...s.completed, s.stage], skipped: s.skipped.filter((i) => i !== s.stage) };
}

/** A movement was resolved. Finishes the sequence after the last one, and the stage after the last sequence. */
function resolve(s: State, step: number, o: Outcome, patch: Partial<StageStat> = {}, count = true): State {
  let n = withStat({ ...s, hold: null, cue: s.cue }, { res: setRes(s, s.round, step, o), ...patch });
  n = { ...n, stepSeq: count ? n.stepSeq + 1 : n.stepSeq, cue: o === 'skipped' ? cueOf(n, 'skip') : null };
  if (stat(n).res[n.round].some((x) => x === 'pending')) return n;
  n = { ...n, roundSeq: n.roundSeq + 1 };
  return n.round >= STAGES[n.stage].rounds.length - 1 ? finishStage(n) : { ...n, inter: n.clock + INTER_MS };
}

function advanceRound(s: State): State {
  const round = s.round + 1;
  const next = rounds(s)[round];
  return { ...s, round, inter: 0, phase: next.preview ? 'preview' : 'perform', previewAt: s.clock };
}

function goToStage(s: State, stage: number): State {
  return { ...s, stage, status: 'ready', safety: false, hold: null, inter: 0, round: 0, phase: 'perform', cue: null };
}

export function reduce(s: State, c: Command): State {
  switch (c.type) {
    case 'configure': {
      if (s.status === 'ended') return s;
      const structural = (Object.keys(c.config) as (keyof Config)[]).some((k) => STRUCTURAL_KEYS.includes(k));
      if (structural && s.status !== 'ready') return s; // movements and lanes never change under a child who is already moving
      return { ...s, config: sanitizeConfig({ ...s.config, ...c.config }, s.config) };
    }
    case 'selectStage': {
      if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > 8) return s;
      if (s.status !== 'ready' && s.status !== 'stage-complete') return s;
      return goToStage(s, c.stage);
    }
    case 'start':
      return s.status === 'ready' ? beginStage(s, c.at) : s;
    case 'tick': {
      if (s.status !== 'running') return s;
      const dt = Math.max(0, Math.min(250, c.at - s.lastTick));
      let n: State = { ...s, clock: s.clock + dt, lastTick: c.at };
      n = withStat(n, { activeMs: stat(n).activeMs + (n.clock >= n.goAt && n.inter === 0 ? dt : 0) });
      if (n.phase === 'preview' && n.clock >= Math.max(n.previewAt, n.goAt) + previewMs(currentRound(n).steps.length)) n = { ...n, phase: 'perform' };
      if (n.inter > 0 && n.clock >= n.inter && n.status === 'running') n = advanceRound(n);
      if (n.hold && n.clock - n.hold.startedAt >= n.hold.ms) n = resolve(n, n.hold.step, n.hold.assisted ? 'assisted' : 'confirmed', { holds: stat(n).holds + 1, holdsAssisted: stat(n).holdsAssisted + (n.hold.assisted ? 1 : 0) });
      return n;
    }
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused' } : s;
    case 'safety':
      return s.status === 'running' ? { ...s, status: 'paused', safety: true } : s.status === 'paused' ? { ...s, safety: true } : s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', safety: false, lastTick: c.at } : s;
    case 'confirm': {
      if (!canConfirm(s)) return s;
      const a = activeStep(s);
      // order matters: confirming any movement except the one the child is on is an incorrect attempt, never progress
      if (c.step !== undefined && c.step !== a) return withStat({ ...s, cue: cueOf(s, 'order') }, { incorrect: stat(s).incorrect + 1 });
      const step = currentRound(s).steps[a];
      if (step.holdMs > 0) return { ...s, hold: { round: s.round, step: a, startedAt: s.clock, ms: step.holdMs, assisted: c.assisted }, cue: null };
      return resolve(s, a, c.assisted ? 'assisted' : 'confirmed');
    }
    case 'completeHold': {
      if (s.status !== 'running' || !s.hold) return s;
      const h = s.hold;
      const assisted = c.assisted || h.assisted;
      return resolve(s, h.step, assisted ? 'assisted' : 'confirmed', { holds: stat(s).holds + 1, holdsAssisted: stat(s).holdsAssisted + (assisted ? 1 : 0) });
    }
    case 'incorrect': {
      if (s.status !== 'running' || s.clock < s.goAt || s.phase !== 'perform' || s.inter > 0 || activeStep(s) < 0) return s;
      // a broken hold simply stops; the therapist can start it again
      return withStat({ ...s, hold: null, cue: cueOf(s, 'incorrect') }, { incorrect: stat(s).incorrect + 1 });
    }
    case 'replay': {
      if (s.status !== 'running' || s.clock < s.goAt || s.inter > 0) return s;
      const st = stat(s);
      if (currentRound(s).preview) return withStat({ ...s, phase: 'preview', previewAt: s.clock, hold: null, cue: cueOf(s, 'replay') }, { replays: st.replays + 1 });
      return withStat({ ...s, hold: null, cue: cueOf(s, 'replay') }, { replays: st.replays + 1 });
    }
    case 'endPreview':
      return s.status === 'running' && s.phase === 'preview' && s.clock >= s.goAt && s.inter === 0 ? { ...s, phase: 'perform' } : s;
    case 'skip': {
      if (s.status !== 'running' || s.clock < s.goAt || s.phase !== 'perform' || s.inter > 0) return s;
      const a = activeStep(s);
      return a < 0 ? s : resolve(s, a, 'skipped', {}, false);
    }
    case 'repeat': {
      if (s.status !== 'running' && s.status !== 'paused') return s;
      const st = stat(s);
      if (c.prev) {
        // re-open the most recent resolved movement of this sequence; stats are derived from `res`, so nothing is counted twice
        let last = -1;
        st.res[s.round]?.forEach((o, i) => { if (o !== 'pending') last = i; });
        if (last < 0) return s;
        return withStat({ ...s, hold: null, inter: 0, cue: cueOf(s, 'back') }, { res: setRes(s, s.round, last, 'pending'), repeats: st.repeats + 1 });
      }
      return withStat({ ...s, hold: null, cue: cueOf(s, 'repeat') }, { repeats: st.repeats + 1 });
    }
    case 'skipStage': {
      if (s.status === 'ended' || s.status === 'ready') return s;
      const st = stat(s);
      const n = withStat({ ...s, hold: null, inter: 0 }, { res: st.res.map((rr) => rr.map((o) => (o === 'pending' ? ('skipped' as const) : o))) });
      const marked: State = { ...n, skipped: n.completed.includes(n.stage) || n.skipped.includes(n.stage) ? n.skipped : [...n.skipped, n.stage] };
      return marked.stage >= 8 ? { ...marked, status: 'ended', endedAt: c.at, safety: false } : goToStage(marked, marked.stage + 1);
    }
    case 'restartStage': {
      if (s.status === 'ended') return s;
      const stage = s.stage;
      return { ...s, status: 'ready', safety: false, hold: null, inter: 0, round: 0, phase: 'perform', cue: null, salt: s.salt + 1, stats: s.stats.map((t, i) => (i === stage ? emptyStat() : t)), completed: s.completed.filter((i) => i !== stage), skipped: s.skipped.filter((i) => i !== stage) };
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      return s.stage >= 8 ? { ...s, status: 'ended', endedAt: c.at } : goToStage(s, s.stage + 1);
    }
    case 'end': {
      if (s.status === 'ended') return s;
      return { ...s, status: 'ended', endedAt: c.at, hold: null, inter: 0, safety: false };
    }
    case 'restart':
      return { ...createState(s.sessionId, s.seed), run: s.run + 1, salt: s.salt + 1, config: s.config };
    case 'dismissHint':
      return s.sensor.pending ? { ...s, sensor: { ...s.sensor, pending: false } } : s;
    case 'sensor': {
      if (s.status !== 'running' && s.status !== 'paused') return s;
      const role = c.role;
      if (!FOOT_ROLES.includes(role) || c.seq <= s.sensor.lastSeq[role]) return s;
      const link = { ...s.sensor.link };
      let movements = s.sensor.movements;
      let pending = s.sensor.pending;
      if (c.event === 'lost') link[role] = 'lost';
      else {
        link[role] = 'ok';
        if (c.event === 'onset') {
          movements++;
          // a movement hint is only worth the therapist's attention while a foot should be staying still
          const h = s.hold;
          if (h) {
            const step = currentRound(s).steps[h.step];
            const staying: FootRole | null = step.anchor ? (step.anchor.foot === 'R' ? 'RIGHT_FOOT' : 'LEFT_FOOT') : null;
            if (step.move === 'stop' || staying === role) pending = true;
          }
        }
      }
      return { ...s, sensor: { link, lastSeq: { ...s.sensor.lastSeq, [role]: c.seq }, movements, pending } };
    }
  }
}

export interface Summary {
  presented: number;
  confirmed: number;
  assisted: number;
  skipped: number;
  pending: number;
  incorrect: number;
  repeats: number;
  replays: number;
  holds: number;
  holdsAssisted: number;
  sequences: number;
  attempts: number;
  activeMs: number;
}

export function summarize(stats: StageStat[]): Summary {
  const out: Summary = { presented: 0, confirmed: 0, assisted: 0, skipped: 0, pending: 0, incorrect: 0, repeats: 0, replays: 0, holds: 0, holdsAssisted: 0, sequences: 0, attempts: 0, activeMs: 0 };
  for (const t of stats) {
    for (const rr of t.res) {
      out.presented += rr.length;
      out.confirmed += rr.filter((o) => o === 'confirmed').length;
      out.assisted += rr.filter((o) => o === 'assisted').length;
      out.skipped += rr.filter((o) => o === 'skipped').length;
      out.pending += rr.filter((o) => o === 'pending').length;
      if (rr.length > 0 && rr.every((o) => o !== 'pending')) out.sequences++;
    }
    out.incorrect += t.incorrect; out.repeats += t.repeats; out.replays += t.replays; out.holds += t.holds; out.holdsAssisted += t.holdsAssisted; out.activeMs += t.activeMs;
  }
  out.attempts = out.confirmed + out.assisted + out.incorrect;
  return out;
}
export const summary = (s: State): Summary => summarize(s.stats);
export const movesDone = (s: State): number => stat(s).res.reduce((n, rr) => n + rr.filter((o) => o === 'confirmed' || o === 'assisted').length, 0);
export const movesTotal = (s: State): number => stat(s).res.reduce((n, rr) => n + rr.length, 0) || rounds(s).reduce((n, r) => n + r.steps.length, 0);
export const modeOf = (stage: number, round: number): Mode => STAGES[stage].rounds[round].mode;
export { STAGES };
