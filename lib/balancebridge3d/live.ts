import { GameState } from "@/lib/game";
import type { LiveControlMeta } from "@/lib/liveGame/ownership";
import {
  GAME_ID,
  STAGES,
  sanitizeConfig,
  difficultyOf,
  type State,
} from "./engine";
export { GAME_ID };
export interface BridgeLiveSession {
  engine: "bb3";
  engineVersion: 1;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: ReturnType<typeof difficultyOf>;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  bb3: LiveControlMeta & { payload: string };
}
export const encode = (s: State) => JSON.stringify({ ...s, lastTick: 0 });
export function makeLive(
  s: State,
  uid: string,
  name: string,
  stamp: Partial<LiveControlMeta> = {},
): BridgeLiveSession {
  return {
    engine: "bb3",
    engineVersion: 1,
    sessionId: s.sessionId,
    seed: 31,
    createdAt: s.startedAt,
    gameState:
      s.status === "ended"
        ? GameState.SESSION_COMPLETE
        : s.status === "stage-complete"
          ? GameState.STAGE_COMPLETE
          : s.status === "ready"
            ? GameState.START_ZONE
            : GameState.PLAYING,
    currentDifficulty: difficultyOf(s.stage),
    currentStage: {
      stageNumber: ((s.stage % 3) + 1) as 1 | 2 | 3,
      stageIndex: s.stage,
    },
    config: { childFirstName: name.trim().slice(0, 30) || "صديقي" },
    bb3: {
      ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}),
      ...(stamp.heartbeatAt !== undefined
        ? { heartbeatAt: stamp.heartbeatAt }
        : {}),
      ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}),
      ownerId: uid,
      payload: encode(s),
    },
  };
}
const nat = (v: unknown, max = 1e9): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
export function validState(raw: unknown): raw is State {
  try {
    const s = raw as State;
    const config = (c: State["config"]) =>
      Object.keys(sanitizeConfig(c)).every(
        (k) =>
          sanitizeConfig(c)[k as keyof typeof c] === c[k as keyof typeof c],
      ) && Object.keys(c).length === Object.keys(sanitizeConfig(c)).length;
    const rows = (r: State["checkpoints"], stage: number) =>
      Array.isArray(r) &&
      r.length === STAGES[stage].points.length &&
      r.every(
        (c, i) =>
          c.id === i &&
          ["pending", "confirmed", "assisted", "skipped"].includes(c.outcome) &&
          nat(c.attempts) &&
          typeof c.holdCompleted === "boolean" &&
          (!c.holdCompleted || ["confirmed", "assisted"].includes(c.outcome)),
      );
    if (
      !s ||
      typeof s.sessionId !== "string" ||
      !s.sessionId.length ||
      s.sessionId.length > 80 ||
      !nat(s.stage, 8) ||
      !nat(s.startingStage, 8) ||
      !["ready", "running", "paused", "stage-complete", "ended"].includes(
        s.status,
      ) ||
      !config(s.config) ||
      !rows(s.checkpoints, s.stage) ||
      !nat(s.active, s.checkpoints.length - 1)
    )
      return false;
    if (
      ![
        s.run,
        s.epoch,
        s.deviations,
        s.repeats,
        s.feedback,
        s.instructions,
      ].every((v) => nat(v)) ||
      ![
        s.countdown,
        s.holdElapsed,
        s.elapsed,
        s.stageElapsed,
        s.startedAt,
        s.endedAt,
        s.lastTick,
      ].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) ||
      typeof s.holding !== "boolean" ||
      s.countdown > 3000 ||
      s.holdElapsed > s.config.holdSeconds * 1000 ||
      s.stageElapsed > s.elapsed
    )
      return false;
    if (
      (s.status === "stage-complete" &&
        s.checkpoints.some((c) => c.outcome === "pending")) ||
      (["running", "paused"].includes(s.status) &&
        s.checkpoints[s.active].outcome !== "pending") ||
      (s.status === "ended" && (!s.endedAt || s.endedAt < s.startedAt))
    )
      return false;
    return (
      Array.isArray(s.results) &&
      s.results.length <= 9 &&
      new Set(s.results.map((r) => r.stage)).size === s.results.length &&
      s.results.every(
        (r) =>
          nat(r.stage, 8) &&
          config(r.config) &&
          rows(r.checkpoints, r.stage) &&
          nat(r.deviations) &&
          nat(r.repeats) &&
          Number.isFinite(r.elapsed) &&
          r.elapsed >= 0 &&
          typeof r.completed === "boolean" &&
          r.completed ===
            r.checkpoints.every((c) =>
              ["confirmed", "assisted"].includes(c.outcome),
            ),
      )
    );
  } catch {
    return false;
  }
}
export function decode(raw: unknown): State | null {
  try {
    const r = raw as BridgeLiveSession;
    if (
      r?.engine !== "bb3" ||
      r.engineVersion !== 1 ||
      typeof r.bb3?.payload !== "string" ||
      r.bb3.payload.length > 32768
    )
      return null;
    const s = JSON.parse(r.bb3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
  } catch {
    return null;
  }
}
export function reviveBridgeLive(raw: unknown): BridgeLiveSession | null {
  const r = raw as BridgeLiveSession,
    s = decode(raw);
  return s &&
    typeof r.bb3.ownerId === "string" &&
    r.bb3.ownerId.length > 0 &&
    typeof r.bb3.controlTabId === "string" &&
    r.bb3.controlTabId.length > 0 &&
    nat(r.bb3.heartbeatAt, Number.MAX_SAFE_INTEGER) &&
    r.currentStage?.stageIndex === s.stage &&
    r.currentStage.stageNumber === (s.stage % 3) + 1 &&
    r.currentDifficulty === difficultyOf(s.stage) &&
    typeof r.config?.childFirstName === "string" &&
    r.config.childFirstName.length > 0 &&
    r.config.childFirstName.length <= 30
    ? r
    : null;
}
export function recoveredState(r: BridgeLiveSession) {
  const s = decode(r);
  return s
    ? {
        ...s,
        status: s.status === "running" ? ("paused" as const) : s.status,
        lastTick: 0,
      }
    : null;
}
