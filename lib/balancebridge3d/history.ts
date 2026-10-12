import { StageStatus, type StageNumber } from "@/lib/game";
import type { StoredSessionWorkflowFields } from "@/lib/sessions/workflowMetadata";
import { validState } from "./live";
import {
  GAME_ID,
  createState,
  sanitizeConfig,
  difficultyOf,
  type State,
  type StageResult,
} from "./engine";
export interface StoredBridgeSession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  engine: "bb3";
  resultVersion: 1;
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  startingDifficulty: ReturnType<typeof difficultyOf>;
  startingStage: StageNumber;
  endingDifficulty: ReturnType<typeof difficultyOf>;
  endingStage: StageNumber;
  completedStageCount: number;
  skippedStageCount: number;
  checkpointsAttempted: number;
  checkpointsConfirmed: number;
  assistedCheckpoints: number;
  skippedCheckpoints: number;
  pathDeviations: number;
  holdCompletions: number;
  sessionCompleted: boolean;
  stageResults: (StageResult & {
    difficulty: ReturnType<typeof difficultyOf>;
    stageNumber: StageNumber;
    stageIndex: number;
    status: StageStatus | "PARTIAL";
  })[];
}
export function buildHistory(
  s: State,
  patientId: string,
  uid: string,
): StoredBridgeSession {
  if (s.status !== "ended" || !patientId || !uid)
    throw Error("Ended bound session required");
  const rows = s.results.map((r) => ({
    ...r,
    difficulty: difficultyOf(r.stage),
    stageIndex: r.stage,
    stageNumber: ((r.stage % 3) + 1) as StageNumber,
    status: r.completed
      ? StageStatus.COMPLETED
      : r.checkpoints.every((c) => c.outcome !== "pending")
        ? StageStatus.SKIPPED
        : ("PARTIAL" as const),
  }));
  const points = rows.flatMap((r) => r.checkpoints);
  return {
    gameId: GAME_ID,
    engine: "bb3",
    resultVersion: 1,
    sessionId: s.run ? `${s.sessionId}-r${s.run}` : s.sessionId,
    patientId,
    createdByUid: uid,
    startedAt: s.startedAt,
    completedAt: s.endedAt,
    durationMs: s.elapsed,
    startingDifficulty: difficultyOf(s.startingStage),
    startingStage: ((s.startingStage % 3) + 1) as StageNumber,
    endingDifficulty: difficultyOf(s.stage),
    endingStage: ((s.stage % 3) + 1) as StageNumber,
    completedStageCount: rows.filter((r) => r.status === StageStatus.COMPLETED)
      .length,
    skippedStageCount: rows.filter((r) => r.status === StageStatus.SKIPPED)
      .length,
    checkpointsAttempted: points.reduce((a, c) => a + c.attempts, 0),
    checkpointsConfirmed: points.filter((c) =>
      ["confirmed", "assisted"].includes(c.outcome),
    ).length,
    assistedCheckpoints: points.filter((c) => c.outcome === "assisted").length,
    skippedCheckpoints: points.filter((c) => c.outcome === "skipped").length,
    pathDeviations: rows.reduce((a, r) => a + r.deviations, 0),
    holdCompletions: points.filter((c) => c.holdCompleted).length,
    sessionCompleted: rows.filter((r) => r.completed).length === 9,
    stageResults: rows,
  };
}
export function reviveBridgeHistory(raw: unknown): StoredBridgeSession | null {
  try {
    const r = raw as StoredBridgeSession;
    const rows: StoredBridgeSession["stageResults"] = Array.isArray(
      r.stageResults,
    )
      ? r.stageResults
      : Object.values(r.stageResults || {});
    if (
      r.gameId !== GAME_ID ||
      r.engine !== "bb3" ||
      r.resultVersion !== 1 ||
      ![r.sessionId, r.patientId, r.createdByUid].every(
        (v) => typeof v === "string" && v.length > 0,
      ) ||
      ![r.startedAt, r.completedAt, r.durationMs].every(
        (v) => Number.isFinite(v) && v >= 0,
      ) ||
      r.completedAt < r.startedAt ||
      rows.length > 9 ||
      new Set(rows.map((v) => v.stageIndex)).size !== rows.length
    )
      return null;
    const s = {
      ...r,
      stage:
        r.endingDifficulty === "EASY"
          ? r.endingStage - 1
          : r.endingDifficulty === "MEDIUM"
            ? r.endingStage + 2
            : r.endingStage + 5,
      startingStage:
        r.startingDifficulty === "EASY"
          ? r.startingStage - 1
          : r.startingDifficulty === "MEDIUM"
            ? r.startingStage + 2
            : r.startingStage + 5,
      run: 0,
      status: "ended",
      elapsed: r.durationMs,
      endedAt: r.completedAt,
      results: rows.map((row) => ({
        ...row,
        checkpoints: Array.isArray(row.checkpoints)
          ? row.checkpoints
          : Object.values(row.checkpoints || {}),
      })),
    } as unknown as State;
    if (
      !["EASY", "MEDIUM", "ADVANCED"].includes(r.endingDifficulty) ||
      !["EASY", "MEDIUM", "ADVANCED"].includes(r.startingDifficulty) ||
      ![r.startingStage, r.endingStage].every(
        (v) => Number.isInteger(v) && v >= 1 && v <= 3,
      )
    )
      return null;
    if (
      !s.results.every(
        (row) =>
          row.config?.projection === "FLOOR" &&
          Object.keys(sanitizeConfig(row.config)).every((k) => {
            const v = sanitizeConfig(row.config)[k as keyof typeof row.config],
              raw = row.config[k as keyof typeof row.config];
            return v === raw || (v === null && raw === undefined);
          }) &&
          Number.isInteger(row.stage) &&
          row.stage >= 0 &&
          row.stage <= 8 &&
          Array.isArray(row.checkpoints) &&
          row.checkpoints.every(
            (c, i) =>
              c.id === i &&
              ["pending", "confirmed", "assisted", "skipped"].includes(
                c.outcome,
              ) &&
              Number.isInteger(c.attempts) &&
              c.attempts >= 0,
          ),
      )
    )
      return null;
    s.results = s.results.map((row) => ({
      ...row,
      config: sanitizeConfig(row.config),
    }));
    const last = s.results.find((row) => row.stage === s.stage);
    if (!last) return null;
    const snapshot = {
      ...createState(r.sessionId),
      ...s,
      config: last.config,
      checkpoints: last.checkpoints,
      stageElapsed: last.elapsed,
      active: 0,
    };
    if (!validState(snapshot)) return null;
    if (
      !rows.every(
        (row) =>
          row.stageIndex === row.stage &&
          row.difficulty === difficultyOf(row.stage) &&
          row.stageNumber === (row.stage % 3) + 1 &&
          row.status ===
            (row.completed
              ? StageStatus.COMPLETED
              : row.checkpoints.every((c) => c.outcome !== "pending")
                ? StageStatus.SKIPPED
                : "PARTIAL"),
      )
    )
      return null;
    const rebuilt = buildHistory(snapshot, r.patientId, r.createdByUid);
    for (const key of [
      "completedStageCount",
      "skippedStageCount",
      "checkpointsAttempted",
      "checkpointsConfirmed",
      "assistedCheckpoints",
      "skippedCheckpoints",
      "pathDeviations",
      "holdCompletions",
      "sessionCompleted",
    ] as const)
      if (rebuilt[key] !== r[key]) return null;
    return { ...r, stageResults: rebuilt.stageResults };
  } catch {
    return null;
  }
}
