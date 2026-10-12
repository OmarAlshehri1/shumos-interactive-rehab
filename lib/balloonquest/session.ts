/**
 * Balloon Quest 3D session engine. Pure and deterministic: every function
 * takes a Session and returns a new Session (same reference when nothing
 * changed). No clocks, DOM, React, Firebase or randomness beyond seeded PRNGs:
 * the caller supplies elapsed simulation time through tickSession.
 *
 * Invariants (all covered by tests):
 *  - No timer and no failure state: a stage ends only by reaching its goal
 *    (or by the therapist skipping / ending).
 *  - A wrong-colour contact never removes the balloon, never deducts anything.
 *  - A selection is accepted at most once (balloon identity + input-event id).
 *  - Nothing scores or moves unless lifecycle === "playing".
 */
import { balloonBody, isOnStage, type Circle } from "./geometry";
import { hashSeed } from "./rng";
import { housekeep, HOUSEKEEPING_MS, initPopulation, stageIdPrefix } from "./spawner";
import { pickTarget, resolveStage, sanitizeSettings, specAt, stageIndexOf } from "./stages";
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  TOTAL_STAGES,
  type AcceptedSelection,
  type Difficulty,
  type Lifecycle,
  type Session,
  type SessionSummary,
  type SourceId,
  type StageNumber,
  type StageResult,
  type StageRuntime,
  type SuspendReason,
  type TherapistSettings,
} from "./types";

/** Largest simulated step accepted in one tick (a longer gap is a scheduling gap, handled by the runtime as a hold, never as time passing). */
export const MAX_TICK_MS = 250;
export const WRONG_COOLDOWN_MS = 800;
const LOG_LIMIT = 200;

const bump = (s: Session, patch: Partial<Session>): Session => ({ ...s, ...patch, revision: s.revision + 1 });

export interface CreateParams {
  sessionId: string;
  sessionEpoch: number;
  seed: number;
  startDifficulty?: Difficulty;
  startStage?: StageNumber;
  settings?: Partial<TherapistSettings>;
  runId?: number;
}

export const endIndexFor = (stageIndex: number, scope: TherapistSettings["scope"]) => (scope === "level" ? Math.floor(stageIndex / 3) * 3 + 2 : TOTAL_STAGES - 1);

export function createSession(p: CreateParams): Session {
  const startIndex = stageIndexOf(p.startDifficulty ?? "EASY", p.startStage ?? 1);
  const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...p.settings });
  return {
    version: 1,
    sessionId: p.sessionId,
    sessionEpoch: p.sessionEpoch,
    runId: p.runId ?? 1,
    seed: p.seed >>> 0,
    revision: 1,
    lifecycle: "ready",
    suspendReason: null,
    settings,
    startIndex,
    endIndex: endIndexFor(startIndex, settings.scope),
    stageIndex: startIndex,
    stage: null,
    results: [],
    selectionSeq: 0,
    selections: [],
    seenInputEvents: [],
    restarts: 0,
    summary: null,
  };
}

function buildStage(s: Session, index: number, attempt: number): StageRuntime {
  const spec = resolveStage(index, s.settings);
  const previous = s.stage && s.stage.index !== index ? s.stage.target : s.results.length ? s.results[s.results.length - 1].target : null;
  const target = pickTarget(s.seed, index, attempt, spec.palette, previous);
  const idPrefix = stageIdPrefix(s.runId, index, attempt);
  const seed = hashSeed(s.seed, s.runId, index, attempt);
  const pop = initPopulation(spec, target, seed, idPrefix);
  return {
    index,
    attempt,
    seed,
    idPrefix,
    spec: pop.spec,
    target,
    goalDone: 0,
    wrongCount: 0,
    correctSeq: 0,
    simTimeMs: 0,
    stepTimeMs: 0,
    balloons: pop.balloons,
    spawn: pop.spawn,
    slots: pop.slots,
  };
}

/** ready -> playing. Builds the first stage from the CURRENT settings. */
export function startSession(s: Session): Session {
  if (s.lifecycle !== "ready") return s;
  const endIndex = endIndexFor(s.startIndex, s.settings.scope);
  return bump(s, { lifecycle: "playing", suspendReason: null, endIndex, stageIndex: s.startIndex, stage: buildStage(s, s.startIndex, 0) });
}

/** Chooses where the (not yet started) session begins. */
export function setStart(s: Session, difficulty: Difficulty, stage: StageNumber): Session {
  if (s.lifecycle !== "ready") return s;
  const startIndex = stageIndexOf(difficulty, stage);
  if (startIndex === s.startIndex) return s;
  return bump(s, { startIndex, stageIndex: startIndex, endIndex: endIndexFor(startIndex, s.settings.scope) });
}

export function updateSettings(s: Session, patch: Partial<TherapistSettings>): Session {
  const settings = sanitizeSettings({ ...s.settings, ...patch });
  if (JSON.stringify(settings) === JSON.stringify(s.settings)) return s;
  const endIndex = s.lifecycle === "ready" || settings.scope !== s.settings.scope ? endIndexFor(s.lifecycle === "ready" ? s.startIndex : s.stageIndex, settings.scope) : s.endIndex;
  // Size/speed/count/colours/layout/reduced-motion take effect when the next stage (or a restart) is built; tolerance, input mode and flow flags apply at once.
  return bump(s, { settings, endIndex });
}

/** Advance the simulation by `dtMs` of ACTIVE play. No effect unless playing. */
export function tickSession(s: Session, dtMs: number): Session {
  if (s.lifecycle !== "playing" || !s.stage || !(dtMs > 0)) return s;
  const dt = Math.min(dtMs, MAX_TICK_MS);
  let stage: StageRuntime = { ...s.stage, simTimeMs: s.stage.simTimeMs + dt };
  let changed = false;
  while (stage.stepTimeMs + HOUSEKEEPING_MS <= stage.simTimeMs) {
    const stepTime = stage.stepTimeMs + HOUSEKEEPING_MS;
    const next = housekeep({ ...stage, stepTimeMs: stepTime }, stepTime);
    // housekeep returns its input object when nothing changed; compare against the stepped copy's fields.
    if (next.balloons !== stage.balloons || next.spawn !== stage.spawn) changed = true;
    stage = { ...next, stepTimeMs: stepTime, simTimeMs: stage.simTimeMs };
  }
  const session = { ...s, stage };
  return changed ? bump(session, {}) : session;
}

export interface SelectRequest {
  balloonId: string;
  source: SourceId;
  /** Optional unique id of the originating input event: a repeated id is ignored. */
  inputEventId?: string;
}
export type SelectResult = { session: Session; outcome: "correct" | "wrong" | "ignored"; reason?: string };

export function selectBalloon(s: Session, req: SelectRequest): SelectResult {
  const ignore = (reason: string): SelectResult => ({ session: s, outcome: "ignored", reason });
  if (s.lifecycle !== "playing" || !s.stage) return ignore("not-playing");
  if (req.inputEventId && s.seenInputEvents.includes(req.inputEventId)) return ignore("duplicate-event");
  const stage = s.stage;
  const balloon = stage.balloons.find((b) => b.id === req.balloonId);
  if (!balloon) return ignore("unknown-balloon");
  if (balloon.popping) return ignore("already-selected");
  if (!isOnStage(balloon, stage.spec, stage.simTimeMs)) return ignore("off-stage");

  const seen = req.inputEventId ? [...s.seenInputEvents, req.inputEventId].slice(-LOG_LIMIT) : s.seenInputEvents;
  const record = (outcome: "correct" | "wrong"): AcceptedSelection => ({
    sequence: s.selectionSeq + 1,
    inputEventId: req.inputEventId ?? null,
    runId: s.runId,
    stageIndex: stage.index,
    stageAttempt: stage.attempt,
    balloonId: balloon.id,
    color: balloon.color,
    outcome,
    source: req.source,
    simTimeMs: stage.simTimeMs,
  });

  if (balloon.color !== stage.target) {
    // Gentle cue only: the balloon stays, nothing is deducted. A short cooldown keeps one lingering touch from counting repeatedly.
    if (stage.simTimeMs - balloon.lastWrongAtMs < WRONG_COOLDOWN_MS) return ignore("wrong-cooldown");
    const balloons = stage.balloons.map((b) => (b.id === balloon.id ? { ...b, wrongCueCount: b.wrongCueCount + 1, lastWrongAtMs: stage.simTimeMs } : b));
    const next = bump(s, {
      stage: { ...stage, balloons, wrongCount: stage.wrongCount + 1 },
      selectionSeq: s.selectionSeq + 1,
      selections: [...s.selections, record("wrong")].slice(-LOG_LIMIT),
      seenInputEvents: seen,
    });
    return { session: next, outcome: "wrong" };
  }

  const balloons = stage.balloons.map((b) => (b.id === balloon.id ? { ...b, popping: true, poppedAtMs: stage.simTimeMs } : b));
  const goalDone = stage.goalDone + 1;
  const updatedStage: StageRuntime = { ...stage, balloons, goalDone, correctSeq: stage.correctSeq + 1, spawn: { ...stage.spawn, lastSlot: balloon.slot } };
  let next = bump(s, {
    stage: updatedStage,
    selectionSeq: s.selectionSeq + 1,
    selections: [...s.selections, record("correct")].slice(-LOG_LIMIT),
    seenInputEvents: seen,
  });
  if (goalDone >= updatedStage.spec.goal) next = completeStage(next, "completed");
  return { session: next, outcome: "correct" };
}

function resultFor(s: Session, status: StageResult["status"]): StageResult {
  const st = s.stage!;
  return {
    index: st.index,
    difficulty: st.spec.difficulty,
    stage: st.spec.stage,
    status,
    target: st.target,
    goal: st.spec.goal,
    correct: st.goalDone,
    wrongContacts: st.wrongCount,
    activeMs: Math.round(st.simTimeMs),
    attempts: st.attempt + 1,
  };
}

function summarize(s: Session, reason: SessionSummary["reason"]): SessionSummary {
  const stages = s.results;
  return {
    sessionId: s.sessionId,
    runId: s.runId,
    reason,
    stages,
    completedStages: stages.filter((r) => r.status === "completed").length,
    skippedStages: stages.filter((r) => r.status === "skipped").length,
    totalCorrect: stages.reduce((a, r) => a + r.correct, 0),
    totalWrongContacts: stages.reduce((a, r) => a + r.wrongContacts, 0),
    activeMs: stages.reduce((a, r) => a + r.activeMs, 0),
    restarts: s.restarts,
  };
}

/** Records the current stage and moves to stage-complete, or to completed after the last planned stage. */
function completeStage(s: Session, status: StageResult["status"]): Session {
  const results = [...s.results, resultFor(s, status)];
  const withResult = { ...s, results };
  if (s.stageIndex >= s.endIndex) {
    return bump(withResult, { lifecycle: "completed", suspendReason: null, summary: summarize(withResult, "completed") });
  }
  return bump(withResult, { lifecycle: "stage-complete", suspendReason: null });
}

function beginStage(s: Session, index: number, lifecycle: Lifecycle): Session {
  return bump(s, { stageIndex: index, stage: buildStage(s, index, 0), lifecycle });
}

/** stage-complete -> next stage (therapist action or auto-advance). */
export function advanceStage(s: Session): Session {
  if (s.lifecycle !== "stage-complete") return s;
  return beginStage(s, s.stageIndex + 1, "playing");
}

/** Therapist skip: the current stage is recorded as skipped (never as a failure) and the next planned stage begins. */
export function skipStage(s: Session): Session {
  if (!s.stage || !(["playing", "paused", "suspended"] as Lifecycle[]).includes(s.lifecycle)) return s;
  const hold: Lifecycle = s.lifecycle === "playing" ? "playing" : s.lifecycle;
  const done = completeStageSkipped(s);
  if (done.lifecycle === "completed") return done;
  return beginStage({ ...done, lifecycle: hold, suspendReason: s.suspendReason }, s.stageIndex + 1, hold);
}

function completeStageSkipped(s: Session): Session {
  const results = [...s.results, resultFor(s, "skipped")];
  const withResult = { ...s, results };
  if (s.stageIndex >= s.endIndex) return bump(withResult, { lifecycle: "completed", suspendReason: null, summary: summarize(withResult, "completed") });
  return bump(withResult, {});
}

/** Rebuilds the current stage from scratch (new deterministic attempt). Partial progress for that attempt is discarded. */
export function restartStage(s: Session): Session {
  if (!s.stage || !(["playing", "paused", "suspended"] as Lifecycle[]).includes(s.lifecycle)) return s;
  return bump(s, { stage: buildStage(s, s.stageIndex, s.stage.attempt + 1), restarts: s.restarts + 1 });
}

/**
 * A session adopted by a freshly loaded Control (after a reload or a lost tab). Everything accepted so far
 * is kept as is (scores, accepted selections, seen input-event ids, results); nothing that was moving keeps
 * moving: play and automatic holds become a plain pause that only the therapist can lift. Terminal and
 * between-stage states are kept as they are. The revision always advances so the change is republished.
 */
export function recoverSession(s: Session): Session {
  const paused = s.lifecycle === "playing" || s.lifecycle === "suspended" || s.lifecycle === "paused";
  return bump(s, paused ? { lifecycle: "paused", suspendReason: null } : {});
}
export function pauseSession(s: Session): Session {
  return s.lifecycle === "playing" ? bump(s, { lifecycle: "paused", suspendReason: null }) : s;
}
export function resumeSession(s: Session): Session {
  return s.lifecycle === "paused" || s.lifecycle === "suspended" ? bump(s, { lifecycle: "playing", suspendReason: null }) : s;
}
/** Automatic hold (input lost, display gone, tab hidden, scheduling gap). Nothing moves or scores while suspended. */
export function suspendSession(s: Session, reason: SuspendReason): Session {
  if (s.lifecycle !== "playing") return s;
  return bump(s, { lifecycle: "suspended", suspendReason: reason });
}

/** Therapist ends the session early. The unfinished stage is kept in the summary only if play actually happened in it. */
export function endSession(s: Session): Session {
  if (s.lifecycle === "completed" || s.lifecycle === "ended") return s;
  let withResult = s;
  const inProgress = s.stage && s.lifecycle !== "stage-complete" && (s.stage.goalDone > 0 || s.stage.wrongCount > 0);
  if (inProgress) withResult = { ...s, results: [...s.results, resultFor(s, "skipped")] };
  return bump(withResult, { lifecycle: "ended", suspendReason: null, summary: summarize(withResult, "therapist-ended") });
}

/** Starts a fresh RUN of the same session from the planned first stage (old run's messages become stale). */
export function newRun(s: Session): Session {
  return bump(s, {
    runId: s.runId + 1,
    lifecycle: "ready",
    suspendReason: null,
    stageIndex: s.startIndex,
    stage: null,
    results: [],
    selections: [],
    seenInputEvents: [],
    selectionSeq: 0,
    summary: null,
    restarts: 0,
  });
}

/** Selectable body circles (isotropic cqh) at the current simulation time, including the therapist's contact tolerance. */
export function selectableBodies(s: Session): Array<Circle & { id: string }> {
  if (!s.stage || s.lifecycle !== "playing") return [];
  const { stage } = s;
  return stage.balloons
    .filter((b) => !b.popping && isOnStage(b, stage.spec, stage.simTimeMs))
    .map((b) => ({ id: b.id, ...balloonBody(b, stage.spec, stage.simTimeMs, s.settings.contactTolerance) }));
}

export const difficultyOf = (index: number): Difficulty => DIFFICULTIES[Math.floor(index / 3)];
export const stageOf = (index: number): StageNumber => ((index % 3) + 1) as StageNumber;
export { specAt };
