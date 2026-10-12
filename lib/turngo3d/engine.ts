import type { CourseId, EventKind } from './courses';
import { DEFAULT_CONFIG, sanitizeConfig, STRUCTURAL_KEYS, type Config } from './config';
import { scheduleFor, STAGES, type Schedule } from './stages';
import type { FootEvent, FootRole } from '@/lib/safehexarena3d/sensorInput';
import { FOOT_ROLES } from '@/lib/safehexarena3d/sensorInput';

/**
 * Turn & Go game engine: a pure reducer. It owns what happened (which star was confirmed and how); the Display only
 * renders it. NOTHING here is inferred from a sensor: a star is collected only by an explicit therapist command, a stop
 * hold ends only by the therapist's clock (the child standing still is observed by the therapist), and a dynamic route
 * event can only start immediately after a confirmed star, while the child stands still.
 *
 * `clock` is RUNNING time in ms: it advances only through `tick` while status is 'running', so pause / safety / a lost
 * connection freeze every hold, wait and countdown at once.
 */
export type Outcome = 'pending' | 'confirmed' | 'assisted' | 'skipped';
export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export const COUNTDOWN_MS = 3000;
export const MAX_CPS = 20;

export interface StageStat {
  /** One outcome per checkpoint of the stage as it was shown. Every count below is derived from this. */
  res: Outcome[];
  stops: number;
  holds: number;
  holdsAssisted: number;
  deviations: number;
  coneTouches: number;
  repeats: number;
  events: number;
  activeMs: number;
  course: CourseId | '';
  cones: number;
  custom: boolean;
}

export interface Hold { cp: number; startedAt: number; ms: number; assisted: boolean }
export interface Wait { kind: EventKind; after: number; until: number }
export interface Cue { kind: 'deviation' | 'cone' | 'repeat' | 'back'; n: number }

export interface State {
  sessionId: string;
  seed: number;
  run: number;
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
  hold: Hold | null;
  wait: Wait | null;
  /** Checkpoints whose alternate position is active (set only at a confirmed star). */
  route: Record<string, 0 | 1>;
  /** `after` indexes whose event already ran in this stage (a repeat never replays them). */
  fired: number[];
  /** Counts up on every collected star: presentation key for the collect animation. */
  starSeq: number;
  /** Presentation-only pulse (gentle error feedback). */
  cue: Cue | null;
  stats: StageStat[];
  completed: number[];
  skipped: number[];
  sensor: { link: Record<FootRole, 'none' | 'ok' | 'lost'>; lastSeq: Record<FootRole, number>; movements: number; pending: boolean };
}

const emptyStat = (): StageStat => ({ res: [], stops: 0, holds: 0, holdsAssisted: 0, deviations: 0, coneTouches: 0, repeats: 0, events: 0, activeMs: 0, course: '', cones: 0, custom: false });

export function createState(sessionId: string, seed = Math.floor(Math.random() * 2147483647)): State {
  return {
    sessionId, seed, run: 0, stage: 0, status: 'ready', safety: false, config: DEFAULT_CONFIG,
    clock: 0, lastTick: 0, startedAt: 0, endedAt: 0, goAt: 0, hold: null, wait: null, route: {}, fired: [], starSeq: 0, cue: null,
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
  | { type: 'confirm'; assisted: boolean }
  | { type: 'completeHold'; assisted: boolean }
  | { type: 'continue' }
  | { type: 'skip' }
  | { type: 'repeat'; prev: boolean }
  | { type: 'deviation'; cone: boolean }
  | { type: 'skipStage'; at: number }
  | { type: 'restartStage' }
  | { type: 'next'; at: number }
  | { type: 'end'; at: number }
  | { type: 'restart' }
  | { type: 'dismissHint' }
  | ({ type: 'sensor' } & FootEvent);

export const schedule = (s: State): Schedule => scheduleFor(s.stage, s.config);
export const stat = (s: State): StageStat => s.stats[s.stage];
/** Index of the star the child is walking to now (-1 when every star is resolved). */
export const activeCp = (s: State): number => stat(s).res.findIndex((r) => r === 'pending');
export const countdownLeft = (s: State): number => Math.max(0, s.goAt - s.clock);
/** Confirmations are open: running, countdown over, no event wait. A stop's hold is still confirmable. */
export const canConfirm = (s: State): boolean => s.status === 'running' && s.clock >= s.goAt && !s.wait && !s.hold && activeCp(s) >= 0;

const withStat = (s: State, patch: Partial<StageStat>): State => ({ ...s, stats: s.stats.map((t, i) => (i === s.stage ? { ...t, ...patch } : t)) });

/** Starts a stage: freshly sized outcome list and course facts. */
function beginStage(s: State, at: number): State {
  const sch = schedule(s);
  const n = sch.plan.cps.length;
  const prev = stat(s);
  const fresh: StageStat = { ...emptyStat(), res: new Array<Outcome>(n).fill('pending'), stops: sch.kinds.filter((k) => k === 'stop').length, course: sch.course, cones: sch.coneCount, custom: sch.customized, activeMs: prev.activeMs };
  return {
    ...s,
    status: 'running', safety: false,
    clock: s.clock, lastTick: at, startedAt: s.startedAt || at,
    goAt: s.clock + COUNTDOWN_MS,
    hold: null, wait: null, route: {}, fired: [], cue: null,
    stats: s.stats.map((t, i) => (i === s.stage ? fresh : t)),
    sensor: { ...s.sensor, pending: false },
  };
}

/** A star was resolved (confirmed / assisted). Moves on, ends the stage after the last one, and starts an event wait if one is due. */
function collect(s: State, cp: number, outcome: 'confirmed' | 'assisted', byHold: boolean): State {
  const st = stat(s);
  const res = st.res.map((r, i) => (i === cp ? outcome : r));
  let next: State = withStat({ ...s, hold: null, starSeq: s.starSeq + 1, cue: null }, {
    res,
    holds: st.holds + (byHold ? 1 : 0),
    holdsAssisted: st.holdsAssisted + (byHold && outcome === 'assisted' ? 1 : 0),
  });
  if (res.every((r) => r !== 'pending')) return finishStage(next);
  const sch = schedule(next);
  const ev = sch.events[cp];
  if (ev && next.config.events && !next.fired.includes(cp)) {
    const route = { ...next.route };
    if ((ev === 'switch' || ev === 'block' || ev === 'altStar') && sch.plan.alts[cp + 1]) route[String(cp + 1)] = 1;
    next = withStat({ ...next, route, fired: [...next.fired, cp], wait: { kind: ev, after: cp, until: next.clock + next.config.eventMs } }, { events: stat(next).events + 1 });
  }
  return next;
}

function finishStage(s: State): State {
  return { ...s, status: 'stage-complete', hold: null, wait: null, completed: s.completed.includes(s.stage) ? s.completed : [...s.completed, s.stage], skipped: s.skipped.filter((i) => i !== s.stage) };
}

function goToStage(s: State, stage: number): State {
  return { ...s, stage, status: 'ready', safety: false, hold: null, wait: null, route: {}, fired: [], cue: null, config: { ...s.config, cones: {}, cpPos: {}, start: null, finish: null } };
}

export function reduce(s: State, c: Command): State {
  switch (c.type) {
    case 'configure': {
      if (s.status === 'ended') return s;
      const structural = (Object.keys(c.config) as (keyof Config)[]).some((k) => STRUCTURAL_KEYS.includes(k));
      if (structural && s.status !== 'ready') return s; // the route never changes under a child who is already moving
      let config = sanitizeConfig({ ...s.config, ...c.config }, s.config);
      // a different layout invalidates manual moves made for the old one
      if (c.config.course !== undefined && c.config.course !== s.config.course) config = { ...config, cones: {}, cpPos: {}, start: null, finish: null };
      return { ...s, config };
    }
    case 'selectStage': {
      if (!Number.isInteger(c.stage) || c.stage < 0 || c.stage > 8) return s;
      if (s.status !== 'ready' && s.status !== 'stage-complete') return s;
      return goToStage(s, c.stage);
    }
    case 'start': {
      if (s.status !== 'ready') return s;
      return beginStage(s, c.at);
    }
    case 'tick': {
      if (s.status !== 'running') return s;
      const dt = Math.max(0, Math.min(250, c.at - s.lastTick));
      let n: State = { ...s, clock: s.clock + dt, lastTick: c.at };
      n = withStat(n, { activeMs: stat(n).activeMs + (n.clock >= n.goAt ? dt : 0) });
      if (n.wait && n.clock >= n.wait.until) n = { ...n, wait: null };
      if (n.hold && n.clock - n.hold.startedAt >= n.hold.ms) n = collect(n, n.hold.cp, n.hold.assisted ? 'assisted' : 'confirmed', true);
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
      const cp = activeCp(s);
      const sch = schedule(s);
      if (sch.kinds[cp] === 'stop') {
        return { ...s, hold: { cp, startedAt: s.clock, ms: sch.holdMs[cp], assisted: c.assisted }, cue: null };
      }
      return collect(s, cp, c.assisted ? 'assisted' : 'confirmed', false);
    }
    case 'completeHold': {
      if (s.status !== 'running' || !s.hold) return s;
      return collect(s, s.hold.cp, c.assisted || s.hold.assisted ? 'assisted' : 'confirmed', true);
    }
    case 'continue':
      return s.status === 'running' && s.wait ? { ...s, wait: null } : s;
    case 'skip': {
      if (s.status !== 'running' || s.clock < s.goAt) return s;
      const cp = activeCp(s);
      if (cp < 0) return s;
      const st = stat(s);
      const res = st.res.map((r, i) => (i === cp ? ('skipped' as const) : r));
      const n = withStat({ ...s, hold: null, wait: null, cue: null }, { res });
      return res.every((r) => r !== 'pending') ? finishStage(n) : n;
    }
    case 'repeat': {
      if (s.status !== 'running' && s.status !== 'paused') return s;
      const st = stat(s);
      if (c.prev) {
        // re-open the most recent resolved star so it can be walked again; stars are derived from `res`, so none is awarded twice
        let last = -1;
        st.res.forEach((r, i) => { if (r !== 'pending') last = i; });
        if (last < 0) return s;
        const was = st.res[last];
        void was;
        const res = st.res.map((r, i) => (i === last ? ('pending' as const) : r));
        return withStat({ ...s, hold: null, wait: null, cue: { kind: 'back', n: (s.cue?.n ?? 0) + 1 } }, { res, repeats: st.repeats + 1 });
      }
      return withStat({ ...s, hold: null, wait: null, cue: { kind: 'repeat', n: (s.cue?.n ?? 0) + 1 } }, { repeats: st.repeats + 1 });
    }
    case 'deviation': {
      if (s.status !== 'running') return s;
      const st = stat(s);
      return withStat({ ...s, cue: { kind: c.cone ? 'cone' : 'deviation', n: (s.cue?.n ?? 0) + 1 } }, c.cone ? { coneTouches: st.coneTouches + 1 } : { deviations: st.deviations + 1 });
    }
    case 'skipStage': {
      if (s.status === 'ended' || s.status === 'ready') return s;
      const st = stat(s);
      const res = st.res.map((r) => (r === 'pending' ? ('skipped' as const) : r));
      const n = withStat({ ...s, hold: null, wait: null }, { res });
      const marked: State = { ...n, skipped: n.completed.includes(n.stage) || n.skipped.includes(n.stage) ? n.skipped : [...n.skipped, n.stage] };
      return marked.stage >= 8 ? { ...marked, status: 'ended', endedAt: c.at, safety: false } : goToStage(marked, marked.stage + 1);
    }
    case 'restartStage': {
      if (s.status === 'ended') return s;
      const stage = s.stage;
      return { ...s, status: 'ready', safety: false, hold: null, wait: null, route: {}, fired: [], cue: null, stats: s.stats.map((t, i) => (i === stage ? { ...emptyStat(), activeMs: 0 } : t)), completed: s.completed.filter((i) => i !== stage), skipped: s.skipped.filter((i) => i !== stage) };
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      return s.stage >= 8 ? { ...s, status: 'ended', endedAt: c.at } : goToStage(s, s.stage + 1);
    }
    case 'end': {
      if (s.status === 'ended') return s;
      return { ...s, status: 'ended', endedAt: c.at, hold: null, wait: null, safety: false };
    }
    case 'restart':
      return { ...createState(s.sessionId, s.seed), run: s.run + 1, config: { ...s.config, cones: {}, cpPos: {}, start: null, finish: null } };
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
          // a movement hint is only worth the therapist's attention while the child should be standing still
          if (s.hold || s.wait) pending = true;
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
  stops: number;
  holds: number;
  holdsAssisted: number;
  deviations: number;
  coneTouches: number;
  repeats: number;
  events: number;
  activeMs: number;
}

export function summarize(stats: StageStat[]): Summary {
  const out: Summary = { presented: 0, confirmed: 0, assisted: 0, skipped: 0, pending: 0, stops: 0, holds: 0, holdsAssisted: 0, deviations: 0, coneTouches: 0, repeats: 0, events: 0, activeMs: 0 };
  for (const t of stats) {
    out.presented += t.res.length;
    out.confirmed += t.res.filter((r) => r === 'confirmed').length;
    out.assisted += t.res.filter((r) => r === 'assisted').length;
    out.skipped += t.res.filter((r) => r === 'skipped').length;
    out.pending += t.res.filter((r) => r === 'pending').length;
    out.stops += t.stops; out.holds += t.holds; out.holdsAssisted += t.holdsAssisted;
    out.deviations += t.deviations; out.coneTouches += t.coneTouches; out.repeats += t.repeats; out.events += t.events; out.activeMs += t.activeMs;
  }
  return out;
}
export const summary = (s: State): Summary => summarize(s.stats);
export const starsCollected = (s: State): number => stat(s).res.filter((r) => r === 'confirmed' || r === 'assisted').length;

export { STAGES };
