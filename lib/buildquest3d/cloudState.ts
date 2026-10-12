/**
 * Build Quest 3D on the shared platform live-session record (`/liveSession`, game id `build-quest-3d`).
 *
 * The Control owns the authoritative accepted state; it is published as ONE compact JSON string (`build3.payload`,
 * accepted discrete state only: no pointer, hover, dwell or scene) next to the generic fields every consumer of
 * `liveSession.session` reads. Ownership, lease, presence, revision ordering and history use the same platform
 * mechanisms as every other game (lib/liveGame, lib/realtime/sessionRepository.ts); this file only knows what a
 * Build Quest record looks like.
 */
import { GameState } from "@/lib/game";
import type { LiveControlMeta } from "@/lib/liveGame/ownership";
import { Difficulty } from "@/lib/game";
import { type State } from "./gameplay";
import { recover, roomValid, validState } from "./protocol";
import { project, STAGES } from "./stages";

export const BUILD_QUEST_ENGINE_TAG = "build3" as const;
export const BUILD_QUEST_ENGINE_VERSION = 1 as const;
const PAYLOAD_MAX = 32768;

export interface BuildQuestLiveBlock extends LiveControlMeta {
  /** Accepted discrete state (JSON). */
  payload: string;
  stage: number;
  run: number;
  status: State["status"];
  placementCount: number;
  completedCount: number;
  skippedCount: number;
  /** Wall clock of the first running moment / of the end (0 = not yet). Used only for the history record. */
  startedAt: number;
  endedAt: number;
  startingStage: number;
}

/** What `liveSession.session` holds for Build Quest. Field names match what the generic consumers read. */
export interface BuildQuestLiveSession {
  engine: typeof BUILD_QUEST_ENGINE_TAG;
  engineVersion: typeof BUILD_QUEST_ENGINE_VERSION;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  build3: BuildQuestLiveBlock;
}

export const isBuildQuestLive = (raw: unknown): boolean => !!raw && typeof raw === "object" && (raw as { engine?: unknown }).engine === BUILD_QUEST_ENGINE_TAG;

/** Only accepted discrete state. No raw pointer, hover/dwell samples, telemetry, scene or patient identity. */
export function encodeAcceptedState(s: State): string {
  const { pointer: _pointer, hover: _hover, dwell: _dwell, inputReady: _ready, ...accepted } = s;
  void _pointer; void _hover; void _dwell; void _ready;
  // Internal per-frame revisions are not transmitted. The record revision is the network version.
  return JSON.stringify({ ...accepted, revision: 0 });
}

const difficultyOf = (stage: number): Difficulty => [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED][Math.min(2, Math.floor(stage / 3))];
export function legacyGameState(status: State["status"]): GameState {
  switch (status) {
    case "ready": return GameState.START_ZONE;
    case "running":
    case "paused": return GameState.PLAYING;
    case "complete": return GameState.STAGE_COMPLETE;
    default: return GameState.SESSION_COMPLETE;
  }
}

export interface LiveTimes { createdAt: number; startedAt: number; endedAt: number; startingStage: number }
export const sanitizeChildName = (name: string): string => name.trim().slice(0, 30);

export function buildQuestLiveSession(s: State, childName: string, ownerId: string, times: LiveTimes, stamp: Pick<LiveControlMeta, "controlTabId" | "heartbeatAt" | "takeoverFrom">): BuildQuestLiveSession {
  return {
    engine: BUILD_QUEST_ENGINE_TAG,
    engineVersion: BUILD_QUEST_ENGINE_VERSION,
    sessionId: s.session,
    seed: 0,
    createdAt: times.createdAt,
    gameState: legacyGameState(s.status),
    currentDifficulty: difficultyOf(s.stage),
    currentStage: { stageNumber: ((s.stage % 3) + 1) as 1 | 2 | 3, stageIndex: s.stage },
    config: { childFirstName: sanitizeChildName(childName) || "الطفل" },
    build3: {
      ownerId,
      ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}),
      ...(typeof stamp.heartbeatAt === "number" ? { heartbeatAt: stamp.heartbeatAt } : {}),
      ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}),
      payload: encodeAcceptedState(s),
      stage: s.stage, run: s.run, status: s.status,
      placementCount: s.events.length, completedCount: s.completed.length, skippedCount: s.skipped.length,
      startedAt: times.startedAt, endedAt: times.endedAt, startingStage: times.startingStage,
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Decodes and fully validates the accepted state of a stored block; null for anything inconsistent. */
export function decodeAcceptedState(session: Pick<BuildQuestLiveSession, "sessionId" | "build3">, revision = 1): State | null {
  try {
    const b = session.build3;
    if (!roomValid(session.sessionId) || typeof b.payload !== "string" || b.payload.length === 0 || b.payload.length > PAYLOAD_MAX) return null;
    const v = JSON.parse(b.payload);
    const piece = STAGES[v.stage]?.pieces.find((p) => p.id === v.selected);
    const s = { ...v, revision, pointer: piece ? project(piece.source) : { x: 0.5, y: 0.5 }, hover: null, dwell: 0, inputReady: false };
    if (!validState(s, session.sessionId) || s.stage !== b.stage || s.run !== b.run || s.status !== b.status ||
        s.events.length !== b.placementCount || s.completed.length !== b.completedCount || s.skipped.length !== b.skippedCount) return null;
    return s;
  } catch { return null; }
}

/**
 * Realtime Database drops nulls and empty arrays, so a record read back is repaired where needed and then checked.
 * A malformed record fails safely to "no session" (waiting world); it is never rendered as a guess.
 */
export function reviveBuildQuestLive(raw: unknown): BuildQuestLiveSession | null {
  if (!isRecord(raw) || raw.engine !== BUILD_QUEST_ENGINE_TAG || raw.engineVersion !== BUILD_QUEST_ENGINE_VERSION || !isRecord(raw.build3) || !isRecord(raw.config) || !isRecord(raw.currentStage)) return null;
  const b = raw.build3;
  if (typeof raw.sessionId !== "string" || !finite(raw.createdAt) || typeof raw.config.childFirstName !== "string") return null;
  if (typeof b.ownerId !== "string" || typeof b.payload !== "string" || !nat(b.stage, 8) || !nat(b.run) || typeof b.status !== "string" || !nat(b.placementCount, 1000) || !nat(b.completedCount, 9) || !nat(b.skippedCount, 9) ||
      !finite(b.startedAt) || !finite(b.endedAt) || !nat(b.startingStage, 8)) return null;
  const session: BuildQuestLiveSession = {
    engine: BUILD_QUEST_ENGINE_TAG,
    engineVersion: BUILD_QUEST_ENGINE_VERSION,
    sessionId: raw.sessionId,
    seed: typeof raw.seed === "number" ? raw.seed : 0,
    createdAt: raw.createdAt,
    gameState: legacyGameState(b.status as State["status"]),
    currentDifficulty: difficultyOf(b.stage),
    currentStage: { stageNumber: ((b.stage % 3) + 1) as 1 | 2 | 3, stageIndex: b.stage },
    config: { childFirstName: raw.config.childFirstName },
    build3: {
      ownerId: b.ownerId,
      ...(typeof b.controlTabId === "string" ? { controlTabId: b.controlTabId } : {}),
      ...(typeof b.heartbeatAt === "number" ? { heartbeatAt: b.heartbeatAt } : {}),
      ...(typeof b.takeoverFrom === "string" ? { takeoverFrom: b.takeoverFrom } : {}),
      payload: b.payload, stage: b.stage, run: b.run, status: b.status as State["status"],
      placementCount: b.placementCount, completedCount: b.completedCount, skippedCount: b.skippedCount,
      startedAt: b.startedAt, endedAt: b.endedAt, startingStage: b.startingStage,
    },
  };
  return decodeAcceptedState(session) ? session : null;
}

/** The state a reloaded Control adopts: run advanced, play turned into a pause, ready for explicit resume. */
export function recoveredState(session: BuildQuestLiveSession): State | null {
  const s = decodeAcceptedState(session);
  return s && recover(s, session.sessionId);
}
