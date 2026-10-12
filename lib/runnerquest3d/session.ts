/**
 * Runner Quest 3D authoritative simulation. Pure and DOM-free: time is injected
 * as `dtMs`, there is no randomness except the seeded encounter plan. Mutates the
 * session in place and bumps `revision` whenever the Display must hear about it.
 *
 * Safety rules encoded here:
 *  - there is NO failure state and NO time limit; the runner never collides,
 *  - an unresolved obstacle makes the runner slow down and wait (a "hold"),
 *  - simulation time only advances while the lifecycle is "playing".
 */
import { freeLanes, generateStage } from "./encounters";
import { generateFloorObjectives } from "./floor";
import { DEFAULT_FLOOR, DEFAULT_SETTINGS, DIFFICULTIES, FLOOR_CM_MAX, FLOOR_MARGIN_MAX, SPACING_RANGE, SPEED_RANGE, type Encounter, type FloorCalibration, type HintKey, type Lane, type Level3, type Lifecycle, type Projection, type RunnerAction, type Session, type SessionSummary, type StageResult, type StageRuntime, type SuspendReason, type TherapistSettings } from "./types";
import { STAGES, TOTAL_STAGES } from "./stages";

export const HOLD_GAP_M = 1.6;
export const PRE_PAUSE_M = 7;
export const HINT_RANGE_M = 20;
export const ACCEL = 2.2;
export const DECEL = 2.6;
export const MAX_TICK_MS = 100;
export const STEP_WINDOW_M = { low: 5, normal: 7, high: 9.5 } as const;
const RECENT_INPUTS = 64;

export interface CreateParams {
  sessionId: string;
  sessionEpoch: number;
  seed: number;
  startIndex?: number;
  endIndex?: number;
  settings?: Partial<TherapistSettings>;
  projection?: Projection;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const LEVELS: readonly Level3[] = ["low", "normal", "high"];
const level = (v: unknown, fallback: Level3): Level3 => (LEVELS.includes(v as Level3) ? (v as Level3) : fallback);
const cm = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.round(clamp(v, 0, FLOOR_CM_MAX)) : 0);

export function sanitizeFloor(base: FloorCalibration, patch: Partial<FloorCalibration> | undefined): FloorCalibration {
  const f = { ...base, ...(patch ?? {}) };
  return {
    range: level(f.range, DEFAULT_FLOOR.range), pad: level(f.pad, DEFAULT_FLOOR.pad),
    margin: clamp(Number.isFinite(f.margin) ? f.margin : DEFAULT_FLOOR.margin, 0, FLOOR_MARGIN_MAX),
    grid: f.grid === true, highContrast: f.highContrast === true, guidance: f.guidance !== false, widthCm: cm(f.widthCm), heightCm: cm(f.heightCm),
  };
}

export function sanitizeSettings(base: TherapistSettings, patch: Partial<TherapistSettings>): TherapistSettings {
  const m = { ...base, ...patch, floor: sanitizeFloor(base.floor ?? DEFAULT_FLOOR, patch.floor) };
  m.speed = clamp(Number.isFinite(m.speed) ? m.speed : DEFAULT_SETTINGS.speed, SPEED_RANGE.min, SPEED_RANGE.max);
  m.spacing = clamp(Number.isFinite(m.spacing) ? m.spacing : 1, SPACING_RANGE.min, SPACING_RANGE.max);
  return m;
}

export function newStage(index: number, seed: number, settings: TherapistSettings, now: number, projection: Projection = "WALL"): StageRuntime {
  if (projection === "FLOOR") return newFloorStage(index, seed, settings, now);
  const plan = generateStage(index, seed, settings.spacing);
  return {
    index, spec: STAGES[index], seed, spacingUsed: settings.spacing, length: plan.length, encounters: plan.encounters,
    obstacles: plan.encounters.map((e) => ({ id: e.id, armed: false, resolved: false, how: null })),
    distance: 0, speed: 0, lane: 0, laneSeq: 0, stepSeq: 0, holding: false, holdObstacleId: null, holds: 0, stars: 0, checkpointsPassed: 0, assists: 0,
    simTimeMs: 0, startedWall: now, hint: null, celebrateSeq: 0,
  };
}

/** FLOOR stage: the journey's objectives ride on the shared StageRuntime (distance = objectives resolved, length = total) so lifecycle, results and history are shared. */
function newFloorStage(index: number, seed: number, settings: TherapistSettings, now: number): StageRuntime {
  const objectives = generateFloorObjectives(index, seed);
  return {
    index, spec: STAGES[index], seed, spacingUsed: settings.spacing, length: objectives.length, encounters: [],
    obstacles: objectives.map((o) => ({ id: o.id, armed: false, resolved: false, how: null })),
    distance: 0, speed: 0, lane: 0, laneSeq: 0, stepSeq: 0, holding: false, holdObstacleId: null, holds: 0, stars: 0, checkpointsPassed: 0, assists: 0,
    simTimeMs: 0, startedWall: now, hint: null, celebrateSeq: 0,
    floor: { objectives, current: 0, region: 0, regionSeq: 0, cueSeq: 0, completed: 0, skipped: 0, assisted: 0 },
  };
}

export function createSession(p: CreateParams): Session {
  const startIndex = clamp(p.startIndex ?? 0, 0, TOTAL_STAGES - 1);
  const endIndex = clamp(p.endIndex ?? TOTAL_STAGES - 1, startIndex, TOTAL_STAGES - 1);
  const settings = sanitizeSettings(DEFAULT_SETTINGS, p.settings ?? {});
  return {
    sessionId: p.sessionId, sessionEpoch: p.sessionEpoch, runId: 0, projection: p.projection ?? "WALL", revision: 0, seed: p.seed, settings,
    lifecycle: "ready", suspendReason: null, startIndex, endIndex, stageIndex: startIndex,
    stage: newStage(startIndex, p.seed, settings, p.sessionEpoch, p.projection ?? "WALL"), results: [], summary: null, recentInputIds: [],
  };
}

const bump = (s: Session) => { s.revision += 1; };
const unresolved = (st: StageRuntime, e: Encounter, i: number) => !st.obstacles[i].resolved && e.z >= st.distance - 1e-6;

/** Index of the next obstacle that can block (side/hurdle/gate) and is unresolved. */
export function nextBlocking(st: StageRuntime): number {
  for (let i = 0; i < st.encounters.length; i++) {
    const e = st.encounters[i];
    if ((e.kind === "side" || e.kind === "hurdle" || e.kind === "gate") && unresolved(st, e, i)) return i;
  }
  return -1;
}

export function isBlocked(st: StageRuntime, settings: TherapistSettings, i: number, lane: Lane = st.lane): boolean {
  const e = st.encounters[i];
  if (!e.lanes.includes(lane)) return false;
  if (e.kind === "hurdle") return !(st.obstacles[i].armed || !settings.footLiftRequired);
  return e.kind === "side" || e.kind === "gate";
}

/** Nearest lane (by lane steps) from which the obstacle can be passed. */
export function nearestFree(st: StageRuntime, settings: TherapistSettings, i: number): Lane | null {
  const free = freeLanes(st.encounters[i]);
  if (st.encounters[i].kind === "hurdle") return null; // hurdles are solved with a step
  return free.length ? free.reduce((a, b) => (Math.abs(a - st.lane) <= Math.abs(b - st.lane) ? a : b)) : null;
}

function hintFor(s: Session, st: StageRuntime): HintKey {
  const i = nextBlocking(st);
  if (i < 0) return null;
  const e = st.encounters[i];
  if (e.z - st.distance > HINT_RANGE_M || !isBlocked(st, s.settings, i)) return null;
  if (e.kind === "hurdle") {
    const free = freeLanes(e);
    return free.length === 0 ? "step" : "step"; // a step always works; lateral dodge is also fine
  }
  if (e.kind === "gate") return "choose-path";
  const f = nearestFree(st, s.settings, i);
  return f === null || f === st.lane ? null : f < st.lane ? "move-left" : "move-right";
}

function signature(s: Session): string {
  const st = s.stage;
  if (!st) return s.lifecycle;
  let resolved = 0;
  for (const o of st.obstacles) if (o.resolved) resolved++;
  const f = st.floor;
  return `${s.lifecycle}|${st.lane}|${st.laneSeq}|${st.stepSeq}|${resolved}|${st.holding ? 1 : 0}|${st.hint}|${st.stars}|${st.celebrateSeq}|${st.assists}${f ? `|${f.current}|${f.region}|${f.regionSeq}|${f.cueSeq}|${f.skipped}` : ""}`;
}

/** Applies `fn`, bumping the revision iff anything the Display renders discretely changed. */
function track<T>(s: Session, fn: () => T): T {
  const before = signature(s);
  const out = fn();
  if (signature(s) !== before) bump(s);
  return out;
}

// ---------- lifecycle ----------
export function startSession(s: Session): boolean {
  if (s.lifecycle !== "ready") return false;
  s.lifecycle = "playing";
  bump(s);
  return true;
}
export function pauseSession(s: Session): boolean {
  if (s.lifecycle !== "playing") return false;
  s.lifecycle = "paused";
  if (s.stage) s.stage.speed = 0;
  bump(s);
  return true;
}
export function resumeSession(s: Session): boolean {
  if (s.lifecycle !== "paused" && s.lifecycle !== "suspended") return false;
  s.lifecycle = "playing";
  s.suspendReason = null;
  bump(s);
  return true;
}
export function suspendSession(s: Session, reason: SuspendReason): boolean {
  if (s.lifecycle !== "playing") return false;
  s.lifecycle = "suspended";
  s.suspendReason = reason;
  if (s.stage) s.stage.speed = 0;
  bump(s);
  return true;
}

/** Restart the current stage from its start line (same seed => same encounters). Results of earlier stages stay. */
export function restartStage(s: Session): boolean {
  if (s.lifecycle === "completed" || s.lifecycle === "ended") return false;
  s.stage = newStage(s.stageIndex, s.seed, s.settings, s.stage?.startedWall ?? s.sessionEpoch, s.projection);
  s.lifecycle = "ready";
  s.suspendReason = null;
  bump(s);
  return true;
}

/** Whole new run: bumps runId so a Display discards anything older. */
export function newRun(s: Session, seed?: number): void {
  s.runId += 1;
  if (seed !== undefined) s.seed = seed;
  s.results = [];
  s.summary = null;
  s.stageIndex = s.startIndex;
  s.stage = newStage(s.startIndex, s.seed, s.settings, s.sessionEpoch, s.projection);
  s.lifecycle = "ready";
  s.suspendReason = null;
  s.recentInputIds = [];
  bump(s);
}

export function selectStageRange(s: Session, startIndex: number, endIndex: number): boolean {
  if (s.lifecycle !== "ready" && s.lifecycle !== "paused" && s.lifecycle !== "completed" && s.lifecycle !== "ended") return false;
  s.startIndex = clamp(startIndex, 0, TOTAL_STAGES - 1);
  s.endIndex = clamp(endIndex, s.startIndex, TOTAL_STAGES - 1);
  newRun(s);
  return true;
}

function resultOf(st: StageRuntime, status: "completed" | "skipped"): StageResult {
  const floor = st.floor;
  // FLOOR: "resolved" means objectives actually completed (assisted ones count, skipped ones do not).
  const resolved = floor ? floor.completed : st.obstacles.filter((o) => o.resolved).length;
  return { index: st.index, difficulty: st.spec.difficulty, stage: st.spec.stage, status, stars: st.stars, holds: st.holds, assists: st.assists, activeMs: Math.round(st.simTimeMs), obstaclesResolved: resolved, obstaclesTotal: st.obstacles.length, distance: Math.round(st.distance),
    projection: floor ? "FLOOR" : "WALL", objectivesSkipped: floor ? floor.skipped : 0 };
}

function buildSummary(s: Session, reason: SessionSummary["reason"]): SessionSummary {
  return {
    reason,
    completedStages: s.results.filter((r) => r.status === "completed").length,
    skippedStages: s.results.filter((r) => r.status === "skipped").length,
    totalStars: s.results.reduce((a, r) => a + r.stars, 0),
    totalHolds: s.results.reduce((a, r) => a + r.holds, 0),
    totalAssists: s.results.reduce((a, r) => a + r.assists, 0),
    projection: s.projection,
    totalObjectivesSkipped: s.results.reduce((a, r) => a + r.objectivesSkipped, 0),
    activeMs: s.results.reduce((a, r) => a + r.activeMs, 0),
    stages: s.results.slice(),
  };
}

function finishStage(s: Session, status: "completed" | "skipped"): void {
  const st = s.stage!;
  s.results.push(resultOf(st, status));
  st.speed = 0;
  st.holding = false;
  st.hint = null;
  if (s.stageIndex >= s.endIndex) {
    s.lifecycle = "completed";
    s.summary = buildSummary(s, "completed");
  } else {
    s.lifecycle = "stage-complete";
  }
  bump(s);
}

export function skipStage(s: Session): boolean {
  if (!s.stage || (s.lifecycle !== "playing" && s.lifecycle !== "paused" && s.lifecycle !== "ready" && s.lifecycle !== "suspended")) return false;
  finishStage(s, "skipped");
  return true;
}

/** Therapist moves on after a stage-complete screen. Never automatic. */
export function advanceStage(s: Session): boolean {
  if (s.lifecycle !== "stage-complete") return false;
  s.stageIndex += 1;
  s.stage = newStage(s.stageIndex, s.seed, s.settings, s.sessionEpoch, s.projection);
  s.lifecycle = "ready";
  bump(s);
  return true;
}

export function endSession(s: Session): boolean {
  if (s.lifecycle === "completed" || s.lifecycle === "ended") return false;
  // An unfinished stage is deliberately not recorded as completed.
  s.lifecycle = "ended";
  s.summary = buildSummary(s, "therapist-ended");
  if (s.stage) s.stage.speed = 0;
  bump(s);
  return true;
}

export function updateSettings(s: Session, patch: Partial<TherapistSettings>): void {
  s.settings = sanitizeSettings(s.settings, patch);
  bump(s);
}

// ---------- actions ----------
export type ActionOutcome = "applied" | "ignored";

function remember(s: Session, id: string | undefined): boolean {
  if (!id) return true;
  if (s.recentInputIds.includes(id)) return false;
  s.recentInputIds.push(id);
  if (s.recentInputIds.length > RECENT_INPUTS) s.recentInputIds.shift();
  return true;
}

export function applyAction(s: Session, action: RunnerAction, inputId?: string): ActionOutcome {
  const st = s.stage;
  if (!st || s.lifecycle !== "playing") return "ignored";
  if (!remember(s, inputId)) return "ignored";
  if (st.floor) return track(s, () => applyFloorAction(s, st, action));
  return track(s, () => {
    if (action.kind === "region") return "ignored";
    if (action.kind === "lane") {
      const next = clamp(st.lane + action.dir, -1, 1) as Lane;
      if (next === st.lane) return "ignored";
      st.lane = next;
      st.laneSeq += 1;
      st.hint = hintFor(s, st);
      return "applied";
    }
    // step: arm the nearest unresolved hurdle that is in the (tolerance-wide) window ahead
    const win = STEP_WINDOW_M[s.settings.tolerance];
    for (let i = 0; i < st.encounters.length; i++) {
      const e = st.encounters[i];
      if (e.kind !== "hurdle" || st.obstacles[i].resolved) continue;
      const ahead = e.z - st.distance;
      if (ahead < -0.5) continue;
      if (ahead > win) break;
      if (st.obstacles[i].armed) return "ignored";
      st.obstacles[i].armed = true;
      st.stepSeq += 1;
      return "applied";
    }
    return "ignored";
  });
}

/** Therapist helps past the obstacle the runner is waiting at. */
export function assistPastObstacle(s: Session): boolean {
  const st = s.stage;
  if (!st || (s.lifecycle !== "playing" && s.lifecycle !== "paused")) return false;
  if (st.floor) return track(s, () => resolveFloorObjective(s, st, "assisted"));
  const i = nextBlocking(st);
  if (i < 0) return false;
  return track(s, () => {
    const e = st.encounters[i];
    st.obstacles[i].resolved = true;
    st.obstacles[i].how = "assisted";
    st.assists += 1;
    st.distance = Math.max(st.distance, e.z + 0.2);
    st.holding = false;
    st.holdObstacleId = null;
    st.hint = hintFor(s, st);
    return true;
  });
}

// ---------- simulation ----------
export function tickSession(s: Session, dtMsRaw: number): void {
  const st = s.stage;
  if (!st || s.lifecycle !== "playing") return;
  const dtMs = clamp(dtMsRaw, 0, MAX_TICK_MS);
  if (dtMs <= 0) return;
  if (st.floor) { st.simTimeMs += dtMs; return; } // FLOOR has no motion, no clock and no timeout: only active time accumulates
  track(s, () => {
    const dt = dtMs / 1000;
    st.simTimeMs += dtMs;
    const ni = nextBlocking(st);
    let target = s.settings.speed;
    let stopAt = Infinity;
    let blocked = false;
    if (ni >= 0 && isBlocked(st, s.settings, ni)) {
      blocked = true;
      const e = st.encounters[ni];
      stopAt = s.settings.pauseBeforeObstacle && e.z - st.distance > HOLD_GAP_M ? e.z - Math.max(PRE_PAUSE_M, HOLD_GAP_M) : e.z - HOLD_GAP_M;
      stopAt = Math.max(stopAt, 0);
    }
    const room = Math.max(0, stopAt - st.distance);
    const brakeCap = blocked ? Math.sqrt(2 * DECEL * room) : Infinity;
    target = Math.min(target, brakeCap);
    st.speed = st.speed < target ? Math.min(target, st.speed + ACCEL * dt) : Math.max(target, st.speed - DECEL * dt * 2);
    let move = st.speed * dt;
    if (blocked && st.distance + move >= stopAt - 1e-6) {
      move = Math.max(0, stopAt - st.distance);
      if (room < 0.08) st.speed = 0;
    }
    st.distance += move;
    // Hold bookkeeping (one hold per obstacle).
    const nowHolding = blocked && stopAt - st.distance < 0.08 && st.speed < 0.05;
    if (nowHolding && !st.holding && ni >= 0 && st.holdObstacleId !== st.encounters[ni].id) {
      st.holds += 1;
      st.holdObstacleId = st.encounters[ni].id;
    }
    st.holding = nowHolding;
    // Resolve everything the runner has now passed.
    for (let i = 0; i < st.encounters.length; i++) {
      const e = st.encounters[i];
      const o = st.obstacles[i];
      if (o.resolved || st.distance < e.z) continue;
      resolvePass(s, st, e, o);
    }
    st.hint = hintFor(s, st);
    if (st.distance >= st.length) {
      st.distance = st.length;
      finishStage(s, "completed");
    }
  });
}

function resolvePass(s: Session, st: StageRuntime, e: Encounter, o: { armed: boolean; resolved: boolean; how: string | null }): void {
  o.resolved = true;
  switch (e.kind) {
    case "checkpoint":
      st.checkpointsPassed += 1;
      st.celebrateSeq += 1;
      st.stars += 1;
      o.how = "reached";
      break;
    case "marker":
      if (st.lane === e.target) { st.stars += 1; st.celebrateSeq += 1; o.how = "reached"; } else o.how = "dodged";
      break;
    case "gate":
      st.stars += 1;
      o.how = "reached";
      break;
    case "hurdle":
      o.how = e.lanes.includes(st.lane) ? (s.settings.footLiftRequired ? "stepped" : "auto") : "dodged";
      st.stars += 1;
      break;
    default:
      o.how = "dodged";
      st.stars += 1;
  }
}

export function sessionStarsTotal(s: Session): number {
  return s.results.reduce((a, r) => a + r.stars, 0) + (s.stage?.stars ?? 0);
}
export const lifecycleIs = (s: Session, ...l: Lifecycle[]) => l.includes(s.lifecycle);
export const stageDifficulty = (index: number) => DIFFICULTIES[Math.floor(index / 3)];


// ---------- FLOOR projection ----------
/** The ONLY way a session changes projection: before it begins (ready, nothing played), then the stage is rebuilt under a new runId. */
export function setProjection(s: Session, projection: Projection): boolean {
  if (projection !== "WALL" && projection !== "FLOOR") return false;
  if (s.lifecycle !== "ready" || s.results.length !== 0 || s.stageIndex !== s.startIndex) return false;
  if (s.projection === projection) return true;
  s.projection = projection;
  newRun(s);
  return true;
}

export function floorCurrent(st: StageRuntime) {
  const f = st.floor;
  return f && f.current < f.objectives.length ? f.objectives[f.current] : null;
}

/** Marks the current objective resolved and moves the journey on. Returns false when there is nothing left to resolve. */
function resolveFloorObjective(s: Session, st: StageRuntime, how: "reached" | "stepped" | "rest" | "assisted" | "skipped"): boolean {
  const f = st.floor!;
  const o = floorCurrent(st);
  if (!o) return false;
  st.obstacles[f.current].resolved = true;
  st.obstacles[f.current].how = how;
  if (how === "skipped") f.skipped += 1;
  else {
    f.completed += 1;
    if (how !== "rest") { st.stars += 1; st.celebrateSeq += 1; }
    if (how === "assisted") { f.assisted += 1; st.assists += 1; }
  }
  f.current += 1;
  st.distance = f.current;
  if (o.kind === "region" && o.target !== null && (how === "reached" || how === "assisted")) f.region = o.target;
  if (f.current >= f.objectives.length) finishStage(s, "completed");
  return true;
}

function applyFloorAction(s: Session, st: StageRuntime, action: RunnerAction): ActionOutcome {
  const f = st.floor!;
  const o = floorCurrent(st);
  if (!o) return "ignored";
  if (action.kind === "step") {
    if (o.kind === "step") return resolveFloorObjective(s, st, "stepped") ? "applied" : "ignored";
    if (o.kind === "rest") return resolveFloorObjective(s, st, "rest") ? "applied" : "ignored";
    return "ignored";
  }
  const region: Lane = action.kind === "lane" ? action.dir : action.region;
  if (o.kind !== "region") { // a movement the objective does not ask for is simply not counted; the child is never "wrong"
    return "ignored";
  }
  if (region === o.target) return resolveFloorObjective(s, st, "reached") ? "applied" : "ignored";
  if (region === f.region) return "ignored";
  f.region = region; // the child is somewhere else: show it, no penalty, the target stays lit
  f.regionSeq += 1;
  return "applied";
}

/** Therapist: replay the cue for the current objective (no scoring effect). */
export function repeatObjective(s: Session): boolean {
  const st = s.stage;
  if (!st?.floor || (s.lifecycle !== "playing" && s.lifecycle !== "paused") || !floorCurrent(st)) return false;
  return track(s, () => { st.floor!.cueSeq += 1; return true; });
}

/** Therapist: move past the current objective without crediting it (never a penalty; counted separately in the result). */
export function skipObjective(s: Session): boolean {
  const st = s.stage;
  if (!st?.floor || (s.lifecycle !== "playing" && s.lifecycle !== "paused")) return false;
  return track(s, () => resolveFloorObjective(s, st, "skipped"));
}
