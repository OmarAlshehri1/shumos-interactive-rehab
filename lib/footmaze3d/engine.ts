import { DEFAULT_CONFIG, effectiveWidth, sanitizeConfig, STRUCTURAL_KEYS, type Config } from './config';
import {
  closedSet, distancesTo, edgeKey, layoutOf, mazeOf, openNeighbors, shortestRoute,
  type GuardDef, type GuardKind, type Layout, type Maze,
} from './mazes';
import { STAGES } from './stages';
import type { FootEvent, FootRole } from '@/lib/safehexarena3d/sensorInput';
import { FOOT_ROLES } from '@/lib/safehexarena3d/sensorInput';

/**
 * Foot Maze game engine: a pure reducer. It owns what happened (where the therapist confirmed the child to be, which
 * stars were awarded, which guardian waits ran). The Display only renders it.
 *
 * SAFETY CONTRACT (all enforced here, all covered by tests):
 *  - The child's position is never inferred. `trail` moves only through an explicit therapist `arrive`.
 *  - A star is awarded only on a therapist arrival, once per star (one outcome slot per star).
 *  - A guardian / gate / bridge / route switch can start only immediately after a therapist-confirmed arrival at its
 *    waiting zone, i.e. while the child stands still. Nothing starts or changes while a leg is in progress.
 *  - While an act (guardian wait or route event) runs, no move is accepted. The act ends by the running clock or by the
 *    therapist (`release`). Pause / safety / lost connection freeze the clock, so they freeze the act.
 *  - Nothing is timed against the child: there are no reaction deadlines, no penalties and no failure state.
 *
 * `clock` is RUNNING time in ms: it advances only through `tick` while status is 'running'.
 */
export type Outcome = 'pending' | 'confirmed' | 'assisted' | 'skipped';
export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export const COUNTDOWN_MS = 3000;
export const ENTER_MS = 1600;
export const LEAVE_MS = 1400;
/** The CONTINUE sign stays up this long after a wait ends. */
export const CONT_MS = 2200;
export const HINT_MS = 7000;
export const MAX_STARS = 12;
export const MAX_TRAIL = 40;

export interface StageStat {
  /** One outcome per star of the maze as it was shown (order = `Maze.stars`). Every star count is derived from this. */
  res: Outcome[];
  moves: number;
  assistedMoves: number;
  /** Real decisions (a junction with two or more ways onward): how many were made, and how they went. */
  choices: number;
  correct: number;
  detours: number;
  deadEnds: number;
  /** Guardian / swarm / gate / bridge waits presented, completed, and ended early by the therapist. */
  waits: number;
  waitsDone: number;
  releases: number;
  /** Route switches. */
  events: number;
  hints: number;
  repeats: number;
  activeMs: number;
  maze: string;
  simple: boolean;
}

export type ActKind = GuardKind | 'switch';
/** A wait the child stands through: guardian, swarm, gate, bridge, or a crystal route switch. */
export interface Act { id: string; kind: ActKind; at: string; t0: number; holdMs: number; leaveAt: number; early: boolean }
export interface Cue { kind: 'detour' | 'dead' | 'repeat' | 'back' | 'good'; n: number }

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
  /** Nodes the therapist confirmed the child at, oldest first; the last is where the child stands now. */
  trail: string[];
  /** The corridor end the child is walking toward (set by a choice or automatically when there is only one way). */
  heading: string | null;
  /** Ids of guards / events that already ran in this stage (a repeat never replays them unless the therapist triggers one). */
  fired: string[];
  act: Act | null;
  /** Running-clock instant when the last act ended (the CONTINUE sign shows for CONT_MS after it); -1 = none. */
  contAt: number;
  /** Guidance is shown until this running-clock instant (therapist "hint"). */
  hintUntil: number;
  /** Counts up on every collected star: presentation key for the collect animation. */
  starSeq: number;
  /** Presentation-only soft feedback pulse. */
  cue: Cue | null;
  stats: StageStat[];
  completed: number[];
  skipped: number[];
  sensor: { link: Record<FootRole, 'none' | 'ok' | 'lost'>; lastSeq: Record<FootRole, number>; movements: number; pending: boolean };
}

const emptyStat = (): StageStat => ({ res: [], moves: 0, assistedMoves: 0, choices: 0, correct: 0, detours: 0, deadEnds: 0, waits: 0, waitsDone: 0, releases: 0, events: 0, hints: 0, repeats: 0, activeMs: 0, maze: '', simple: false });

export function createState(sessionId: string, seed = Math.floor(Math.random() * 2147483647)): State {
  return {
    sessionId, seed, run: 0, stage: 0, status: 'ready', safety: false, config: DEFAULT_CONFIG,
    clock: 0, lastTick: 0, startedAt: 0, endedAt: 0, goAt: 0, trail: [], heading: null, fired: [], act: null, contAt: -1, hintUntil: 0, starSeq: 0, cue: null,
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
  | { type: 'choose'; to: string }
  | { type: 'arrive'; assisted: boolean }
  | { type: 'release' }
  | { type: 'extend'; ms: number }
  | { type: 'trigger' }
  | { type: 'hint' }
  | { type: 'skip' }
  | { type: 'repeat'; prev: boolean }
  | { type: 'skipStage'; at: number }
  | { type: 'restartStage' }
  | { type: 'next'; at: number }
  | { type: 'end'; at: number }
  | { type: 'restart' }
  | { type: 'dismissHint' }
  | ({ type: 'sensor' } & FootEvent);

// ---------------------------------------------------------------------------------------------------------------------
// derived facts

export interface World {
  maze: Maze;
  layout: Layout;
  closed: Set<string>;
  width: number;
  hint: 'always' | 'next' | 'none';
}

const layoutCache = new Map<string, Layout>();

export function worldOf(s: Pick<State, 'stage' | 'config' | 'fired'>): World {
  const stage = STAGES[s.stage], c = s.config;
  const maze = mazeOf(stage.maze, c.simple);
  const width = effectiveWidth(c, stage.width);
  const key = `${maze.id}|${c.simple}|${c.rot}|${c.mirror}|${width}|${c.proj.inset}`;
  let layout = layoutCache.get(key);
  if (!layout) {
    layout = layoutOf(maze, { rot: c.rot, mirror: c.mirror, width, inset: c.proj.inset });
    if (layoutCache.size > 120) layoutCache.clear();
    layoutCache.set(key, layout);
  }
  return { maze, layout, closed: closedSet(maze, s.fired, { events: c.events }), width, hint: c.hint === 'auto' ? stage.hint : c.hint };
}

export const stat = (s: State): StageStat => s.stats[s.stage];
export const at = (s: State): string | null => (s.trail.length ? s.trail[s.trail.length - 1] : null);
export const prevNode = (s: State): string | null => (s.trail.length > 1 ? s.trail[s.trail.length - 2] : null);
export const countdownLeft = (s: State): number => Math.max(0, s.goAt - s.clock);
/** Moves are accepted: running, countdown over, no act in progress. */
export const canMove = (s: State): boolean => s.status === 'running' && s.clock >= s.goAt && !s.act && s.trail.length > 0;

/** Stars that exist for the child right now: a collectible star waits for its event unless events are off. */
export function starVisible(s: Pick<State, 'fired' | 'config'>, maze: Maze, node: string): boolean {
  const need = maze.needs[node];
  return !need || !s.config.events || s.fired.includes(need);
}

/** Open ways onward from the child's node (excluding the corridor they came along). */
export function onward(s: State, w: World = worldOf(s)): string[] {
  const cur = at(s);
  if (!cur) return [];
  const back = prevNode(s);
  return openNeighbors(w.maze, cur, w.closed).filter((m) => m !== back);
}

/** Every corridor end the child could be sent along from here (onward plus back). */
export function exits(s: State, w: World = worldOf(s)): string[] {
  const cur = at(s);
  return cur ? openNeighbors(w.maze, cur, w.closed) : [];
}

export interface Target { node: string; star: boolean; finish: boolean }

/** Where the child is walking to: the nearest pending star that lies on a shortest route to the finish, else the finish. */
export function targetOf(s: State, w: World = worldOf(s)): Target | null {
  const cur = at(s);
  if (!cur || s.status === 'ended') return null;
  const res = stat(s).res;
  const dHere = distancesTo(w.maze, cur, w.closed), dEnd = distancesTo(w.maze, w.maze.finish, w.closed);
  const total = dEnd[cur];
  if (total === undefined) return { node: w.maze.finish, star: true, finish: true };
  let best: string | null = null;
  w.maze.stars.forEach((id, i) => {
    if (id === w.maze.finish || id === cur || res[i] !== 'pending' || !starVisible(s, w.maze, id)) return;
    if (dHere[id] === undefined || dEnd[id] === undefined || Math.abs(dHere[id] + dEnd[id] - total) > 0.01) return;
    if (best === null || dHere[id] < dHere[best]) best = id;
  });
  return best ? { node: best, star: true, finish: false } : { node: w.maze.finish, star: true, finish: true };
}

/** Shortest route from the child's node to the finish (node ids), honouring corridors closed right now. */
export function routeToFinish(s: State, w: World = worldOf(s)): string[] {
  const cur = at(s);
  return cur ? shortestRoute(w.maze, cur, w.maze.finish, w.closed) : [];
}

export type ActPhase = 'enter' | 'hold' | 'leave' | 'done';
export interface ActPose {
  phase: ActPhase;
  /** 0..1 progress inside the phase. */
  k: number;
  /** For a guardian that moves between two corridors: which one it blocks now, and 0..1 slide progress between them. */
  side: 'edge' | 'alt';
  slide: number;
}
export function actPose(a: Act, clock: number, hasAlt: boolean): ActPose {
  const enterEnd = a.t0 + ENTER_MS;
  const phase: ActPhase = clock < enterEnd ? 'enter' : clock < a.leaveAt ? 'hold' : clock < a.leaveAt + LEAVE_MS ? 'leave' : 'done';
  const k = phase === 'enter' ? (clock - a.t0) / ENTER_MS : phase === 'hold' ? (clock - enterEnd) / Math.max(1, a.leaveAt - enterEnd) : phase === 'leave' ? (clock - a.leaveAt) / LEAVE_MS : 1;
  let side: 'edge' | 'alt' = 'edge', slide = 0;
  if (hasAlt && phase === 'hold') {
    const half = 0.5, span = 0.14;
    side = k >= half ? 'alt' : 'edge';
    slide = Math.max(0, Math.min(1, (k - (half - span / 2)) / span));
  } else if (hasAlt && (phase === 'leave' || phase === 'done')) { side = 'alt'; slide = 1; }
  return { phase, k: Math.max(0, Math.min(1, k)), side, slide };
}

export const guardOf = (maze: Maze, id: string): GuardDef | undefined => maze.guards.find((g) => g.id === id);

// ---------------------------------------------------------------------------------------------------------------------
// transitions

const withStat = (s: State, patch: Partial<StageStat>): State => ({ ...s, stats: s.stats.map((t, i) => (i === s.stage ? { ...t, ...patch } : t)) });
const bump = (s: State, kind: Cue['kind']): Cue => ({ kind, n: (s.cue?.n ?? 0) + 1 });

/** Chooses the heading automatically when there is exactly one way onward (or only the way back at a dead end). */
function autoHeading(s: State): State {
  if (!s.trail.length) return { ...s, heading: null };
  const w = worldOf(s);
  const on = onward(s, w);
  const back = prevNode(s);
  const heading = on.length === 1 ? on[0] : on.length === 0 ? back : null;
  return heading === s.heading ? s : { ...s, heading };
}

function beginStage(s: State, at0: number): State {
  const w = worldOf(s);
  const n = w.maze.stars.length;
  const prev = stat(s);
  const fresh: StageStat = { ...emptyStat(), res: new Array<Outcome>(n).fill('pending'), maze: w.maze.id, simple: s.config.simple, activeMs: prev.activeMs };
  return autoHeading({
    ...s,
    status: 'running', safety: false,
    lastTick: at0, startedAt: s.startedAt || at0,
    goAt: s.clock + COUNTDOWN_MS,
    trail: [w.maze.start], heading: null, fired: [], act: null, contAt: -1, hintUntil: 0, cue: null,
    stats: s.stats.map((t, i) => (i === s.stage ? fresh : t)),
    sensor: { ...s.sensor, pending: false },
  });
}

function finishStage(s: State): State {
  return { ...s, status: 'stage-complete', act: null, heading: null, completed: s.completed.includes(s.stage) ? s.completed : [...s.completed, s.stage], skipped: s.skipped.filter((i) => i !== s.stage) };
}

function goToStage(s: State, stage: number): State {
  return { ...s, stage, status: 'ready', safety: false, trail: [], heading: null, fired: [], act: null, contAt: -1, hintUntil: 0, cue: null };
}

/** Starts a wait when a guard / gate / bridge / switch is due at the node the child was just confirmed at. */
function triggerAt(s: State, node: string, manual: boolean): State {
  const w = worldOf(s);
  const g = w.maze.guards.find((x) => x.at === node && (manual || !s.fired.includes(x.id)));
  if (g) {
    const friendly = g.kind === 'guard' || g.kind === 'swarm';
    if (!manual && !(friendly ? s.config.guards : s.config.events)) return s;
    const holdMs = friendly ? s.config.guardMs : s.config.eventMs;
    const act: Act = { id: g.id, kind: g.kind, at: node, t0: s.clock, holdMs, leaveAt: s.clock + ENTER_MS + holdMs, early: false };
    return withStat({ ...s, act, contAt: -1, fired: s.fired.includes(g.id) ? s.fired : [...s.fired, g.id] }, { waits: stat(s).waits + 1 });
  }
  const ev = w.maze.events.find((x) => x.at === node && !s.fired.includes(x.id));
  if (ev && (s.config.events || manual)) {
    const act: Act = { id: ev.id, kind: 'switch', at: node, t0: s.clock, holdMs: s.config.eventMs, leaveAt: s.clock + ENTER_MS + s.config.eventMs, early: false };
    return withStat({ ...s, act, contAt: -1, fired: [...s.fired, ev.id] }, { events: stat(s).events + 1 });
  }
  return s;
}

function arrive(s: State, assisted: boolean): State {
  if (!canMove(s) || !s.heading) return s;
  const w = worldOf(s);
  const from = at(s)!, to = s.heading;
  if (!w.maze.adj[from]?.includes(to) || w.closed.has(edgeKey(from, to))) return s;
  const st = stat(s);
  const back = prevNode(s);
  // was this a real decision? (two or more ways onward, and the child did not simply turn around)
  const options = openNeighbors(w.maze, from, w.closed).filter((m) => m !== back);
  const decision = options.length >= 2 && to !== back;
  const dEnd = distancesTo(w.maze, w.maze.finish, w.closed);
  const good = decision && dEnd[to] !== undefined && dEnd[from] !== undefined && dEnd[to] < dEnd[from] - 1e-6;
  const trail = [...s.trail, to].slice(-MAX_TRAIL);
  let next: State = { ...s, trail, heading: null, cue: null };
  const res = st.res.slice();
  const idx = w.maze.stars.indexOf(to);
  let starred = false;
  if (idx >= 0 && (res[idx] === 'pending' || res[idx] === 'skipped') && starVisible(s, w.maze, to)) {
    res[idx] = assisted ? 'assisted' : 'confirmed';
    starred = true;
    next = { ...next, starSeq: s.starSeq + 1 };
  }
  const nextOn = openNeighbors(w.maze, to, w.closed).filter((m) => m !== from);
  const dead = nextOn.length === 0 && to !== w.maze.finish && to !== w.maze.start;
  next = withStat(next, {
    res,
    moves: st.moves + 1,
    assistedMoves: st.assistedMoves + (assisted ? 1 : 0),
    choices: st.choices + (decision ? 1 : 0),
    correct: st.correct + (good ? 1 : 0),
    detours: st.detours + (decision && !good ? 1 : 0),
    deadEnds: st.deadEnds + (dead ? 1 : 0),
  });
  void starred;
  if (to === w.maze.finish) return finishStage(next);
  if (dead) next = { ...next, cue: bump(s, 'dead') };
  else if (good) next = { ...next, cue: bump(s, 'good') };
  next = triggerAt(next, to, false);
  return autoHeading(next);
}

export function reduce(s: State, c: Command): State {
  switch (c.type) {
    case 'configure': {
      if (s.status === 'ended') return s;
      const structural = (Object.keys(c.config) as (keyof Config)[]).some((k) => STRUCTURAL_KEYS.includes(k));
      if (structural && s.status !== 'ready') return s; // the maze never changes under a child who is already moving
      return { ...s, config: sanitizeConfig({ ...s.config, ...c.config }, s.config) };
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
      if (n.act && n.clock >= n.act.leaveAt + LEAVE_MS) {
        const done = n.act.kind !== 'switch';
        n = withStat({ ...n, act: null, contAt: n.clock }, done ? { waitsDone: stat(n).waitsDone + 1 } : {});
        n = autoHeading(n);
      }
      return n;
    }
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused' } : s;
    case 'safety':
      return s.status === 'running' ? { ...s, status: 'paused', safety: true } : s.status === 'paused' ? { ...s, safety: true } : s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', safety: false, lastTick: c.at } : s;
    case 'choose': {
      if (!canMove(s)) return s;
      const w = worldOf(s);
      if (!exits(s, w).includes(c.to) || s.heading === c.to) return s;
      const back = prevNode(s);
      return { ...s, heading: c.to, cue: c.to === back ? bump(s, 'back') : s.cue };
    }
    case 'arrive':
      return arrive(s, c.assisted);
    case 'release': {
      if (s.status !== 'running' || !s.act || s.clock >= s.act.leaveAt) return s;
      const leaveAt = Math.max(s.clock, s.act.t0 + ENTER_MS);
      return withStat({ ...s, act: { ...s.act, leaveAt, early: true } }, s.act.early ? {} : { releases: stat(s).releases + 1 });
    }
    case 'extend': {
      if (s.status !== 'running' || !s.act || s.clock >= s.act.leaveAt) return s;
      const ms = Math.max(0, Math.min(10000, Math.round(c.ms)));
      const holdMs = Math.min(30000, s.act.holdMs + ms);
      return { ...s, act: { ...s.act, holdMs, leaveAt: s.act.t0 + ENTER_MS + holdMs } };
    }
    case 'trigger': {
      if (s.status !== 'running' || s.clock < s.goAt || s.act) return s;
      const cur = at(s);
      return cur ? triggerAt(s, cur, true) : s;
    }
    case 'hint': {
      if (s.status !== 'running' || s.clock < s.goAt) return s;
      return withStat({ ...s, hintUntil: s.clock + HINT_MS }, { hints: stat(s).hints + 1 });
    }
    case 'skip': {
      if (s.status !== 'running' || s.clock < s.goAt) return s;
      const w = worldOf(s), t = targetOf(s, w);
      if (!t || t.finish) return s;
      const idx = w.maze.stars.indexOf(t.node);
      const res = stat(s).res.map((r, i) => (i === idx && r === 'pending' ? ('skipped' as const) : r));
      return withStat({ ...s, cue: bump(s, 'repeat') }, { res });
    }
    case 'repeat': {
      if (s.status !== 'running' && s.status !== 'paused') return s;
      if (s.act) return s;
      const st = stat(s);
      if (c.prev) {
        // step back to where the child stood before; star outcomes are untouched, so nothing can be awarded twice
        if (s.trail.length < 2) return s;
        const trail = s.trail.slice(0, -1);
        return autoHeading(withStat({ ...s, trail, heading: null, cue: bump(s, 'back') }, { repeats: st.repeats + 1 }));
      }
      return autoHeading(withStat({ ...s, heading: null, cue: bump(s, 'repeat') }, { repeats: st.repeats + 1 }));
    }
    case 'skipStage': {
      if (s.status === 'ended' || s.status === 'ready') return s;
      const st = stat(s);
      const res = st.res.map((r) => (r === 'pending' ? ('skipped' as const) : r));
      const n = withStat({ ...s, act: null, heading: null }, { res });
      const marked: State = { ...n, skipped: n.completed.includes(n.stage) || n.skipped.includes(n.stage) ? n.skipped : [...n.skipped, n.stage] };
      return marked.stage >= 8 ? { ...marked, status: 'ended', endedAt: c.at, safety: false } : goToStage(marked, marked.stage + 1);
    }
    case 'restartStage': {
      if (s.status === 'ended') return s;
      const stage = s.stage;
      return { ...goToStage(s, stage), stats: s.stats.map((t, i) => (i === stage ? { ...emptyStat(), activeMs: 0 } : t)), completed: s.completed.filter((i) => i !== stage), skipped: s.skipped.filter((i) => i !== stage) };
    }
    case 'next': {
      if (s.status !== 'stage-complete') return s;
      return s.stage >= 8 ? { ...s, status: 'ended', endedAt: c.at } : goToStage(s, s.stage + 1);
    }
    case 'end': {
      if (s.status === 'ended') return s;
      return { ...s, status: 'ended', endedAt: c.at, act: null, heading: null, safety: false };
    }
    case 'restart':
      return { ...createState(s.sessionId, s.seed), run: s.run + 1, config: s.config };
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
          if (s.act) pending = true;
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
  moves: number;
  assistedMoves: number;
  choices: number;
  correct: number;
  detours: number;
  deadEnds: number;
  waits: number;
  waitsDone: number;
  releases: number;
  events: number;
  hints: number;
  repeats: number;
  activeMs: number;
}

export function summarize(stats: StageStat[]): Summary {
  const out: Summary = { presented: 0, confirmed: 0, assisted: 0, skipped: 0, pending: 0, moves: 0, assistedMoves: 0, choices: 0, correct: 0, detours: 0, deadEnds: 0, waits: 0, waitsDone: 0, releases: 0, events: 0, hints: 0, repeats: 0, activeMs: 0 };
  for (const t of stats) {
    out.presented += t.res.length;
    out.confirmed += t.res.filter((r) => r === 'confirmed').length;
    out.assisted += t.res.filter((r) => r === 'assisted').length;
    out.skipped += t.res.filter((r) => r === 'skipped').length;
    out.pending += t.res.filter((r) => r === 'pending').length;
    out.moves += t.moves; out.assistedMoves += t.assistedMoves; out.choices += t.choices; out.correct += t.correct; out.detours += t.detours; out.deadEnds += t.deadEnds;
    out.waits += t.waits; out.waitsDone += t.waitsDone; out.releases += t.releases; out.events += t.events; out.hints += t.hints; out.repeats += t.repeats; out.activeMs += t.activeMs;
  }
  return out;
}
export const summary = (s: State): Summary => summarize(s.stats);
export const starsCollected = (s: State): number => stat(s).res.filter((r) => r === 'confirmed' || r === 'assisted').length;

export { STAGES };
