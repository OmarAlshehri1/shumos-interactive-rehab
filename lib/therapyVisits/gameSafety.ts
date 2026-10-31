import type { LiveSessionRecord } from "@/lib/realtime/types";
import type { AnyStoredSession } from "@/lib/sessions/types";
/** Resolve actual immutable result keys; never accept a previous run as proof of this run saving. */
export function historyKeyForLive(record: LiveSessionRecord): string | null {
  const session = record.session as unknown as Record<string, unknown>,
    engine = session.engine;
  const suffixed = [
      "fp3",
      "cc3",
      "dome3",
      "mirror3",
      "hex3",
      "tg3",
      "fm3",
      "rs3",
      "bs3",
      "ac3", "af3",
      "ow3",
    ],
    conditional = ["bw3", "hv3", "bb3"];
  if (
    typeof engine === "string" &&
    [...suffixed, ...conditional].includes(engine)
  ) {
    try {
      const payload = (session[engine] as { payload: string }).payload;
      const state = JSON.parse(payload);
      if (!Number.isInteger(state.run) || state.run < 0) return null;
      return suffixed.includes(engine) || state.run > 0
        ? `${record.sessionId}-r${state.run}`
        : record.sessionId;
    } catch {
      return null;
    }
  }
  return record.sessionId;
}
export function confirmedLiveResult(
  record: LiveSessionRecord,
  result: AnyStoredSession | null,
): boolean {
  return (
    !!result &&
    record.session.gameState === "SESSION_COMPLETE" &&
    result.sessionId === historyKeyForLive(record) &&
    result.patientId === record.patientId &&
    result.gameId === record.gameId
  );
}
export function visitGamePaused(record: LiveSessionRecord | null): boolean {
  if (
    !record ||
    record.session.gameState === "SESSION_COMPLETE" ||
    record.session.gameState === "START_ZONE"
  )
    return true;
  if ((record.session as unknown as { isPaused?: boolean }).isPaused === true)
    return true;
  const s = record.session as unknown as Record<string, unknown>;
  try {
    const meta = s[s.engine as string] as {
      payload?: string;
      snapshot?: string;
      status?: string;
      state?: { lifecycle?: string };
    };
    const state = JSON.parse(meta?.payload ?? meta?.snapshot ?? "null");
    return (
      meta?.status === "paused" ||
      meta?.state?.lifecycle === "paused" ||
      state?.status === "paused" ||
      state?.lifecycle === "paused" ||
      state?.state?.lifecycle === "paused"
    );
  } catch {
    return false;
  }
}
export function ownedByTab(record: LiveSessionRecord, tab: string): boolean {
  const s = record.session as unknown as Record<string, unknown>;
  return (
    (s[s.engine as string] as { controlTabId?: string })?.controlTabId === tab
  );
}

/** Never discard active/recovered progress. Only explicit native ready state is a setup preview. */
export function isUnstartedActivity(record: LiveSessionRecord | null): boolean {
  if (!record) return false;
  const session = record.session as unknown as Record<string, unknown>;
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  try {
    // Original shared sessions have no native engine envelope. Their setup
    // lifecycle and runtime counters are the evidence, not the mere existence
    // of a liveSession record (which is published before Play).
    if (session.engine === undefined) {
      if (!record.gameId || !["balloon-quest", "follow-the-footsteps", "bubble-pop-wall", "space-pilot", "color-chase"].includes(record.gameId)) return false;
      if (!["WELCOME", "SETUP", "START_ZONE"].includes(String(session.gameState))) return false;
      if (!Array.isArray(session.results) || session.results.length || session.summary || session.endedAt) return false;
      if (!object(session.currentStage)) return false;
      const stage = session.currentStage;
      if (stage.startedAt || stage.completedAt || stage.pausedAt) return false;
      for (const key of ["correctCount", "incorrectCount", "collectedCount", "currentStarIndex", "currentIndex", "currentTargetIndex", "totalPausedMs", "elapsedMs"])
        if (typeof stage[key] === "number" && stage[key] !== 0) return false;
      if (Array.isArray(stage.reactionTimesMs) && stage.reactionTimesMs.length) return false;
      return true;
    }
    if (session.gameState !== "START_ZONE") return false;
    if (typeof session.engine !== "string") return false;
    const meta = session[session.engine];
    if (!object(meta)) return false;
    const emptyDraftResults = (value: unknown) =>
      Array.isArray(value) &&
      value.every((row) => {
        if (!object(row) || row.completed !== false || row.skipped !== false)
          return false;
        if (session.engine === "bw3")
          return (
            Array.isArray(row.regions) &&
            row.regions.every(
              (region) =>
                object(region) &&
                region.hits === 0 &&
                region.assisted === 0 &&
                Array.isArray(region.accepted) &&
                region.accepted.length === 0,
            )
          );
        if (session.engine === "hv3")
          return (
            row.harvested === 0 &&
            row.assisted === 0 &&
            row.skippedObjectives === 0
          );
        return false;
      });
    const roots = [session, meta];
    for (const key of ["payload", "snapshot"])
      if (typeof meta[key] === "string") {
        const parsed: unknown = JSON.parse(meta[key] as string);
        if (!object(parsed)) return false;
        roots.push(parsed);
      }
    if (object(meta.state)) roots.push(meta.state);
    const states = roots.flatMap((root) => [
      root,
      ...(object(root.state) ? [root.state] : []),
      ...(object(root.stage) ? [root.stage] : []),
    ]);
    let ready = false;
    for (const state of states) {
      const lifecycle = state.lifecycle ?? state.status;
      if (lifecycle !== undefined) {
        if (!["ready", "setup", "idle"].includes(String(lifecycle)))
          return false;
        ready = true;
      }
      for (const key of [
        "startedAt",
        "endedAt",
        "elapsed",
        "elapsedMs",
        "elapsedSeconds",
        "activeTimeMs",
        "activeMs",
        "simTimeMs",
        "completedStages",
        "skippedStages",
        "placementCount",
        "completedCount",
        "skippedCount",
        "selectionSeq",
        "goalDone",
        "distance",
        "stars",
        "checkpointsPassed",
      ])
        if (typeof state[key] === "number" && (state[key] as number) > 0)
          return false;
      for (const key of [
        "attempts",
        "completed",
        "skipped",
        "stageResults",
        "results",
        "events",
        "accepted",
        "selections",
        "practiceEvents",
        "cut",
        "skippedCells",
      ])
        if (
          Array.isArray(state[key]) &&
          state[key].length > 0 &&
          !(key === "results" && emptyDraftResults(state[key]))
        )
          return false;
      for (const key of ["checkpoints", "steps"]) {
        const rows = state[key];
        if (
          Array.isArray(rows) &&
          rows.some(
            (row) =>
              object(row) &&
              ((typeof row.outcome === "string" && row.outcome !== "pending") ||
                (typeof row.out === "string" && row.out !== "pending")),
          )
        )
          return false;
      }
      if (object(state.summary)) return false;
    }
    return ready;
  } catch {
    return false;
  }
}

/** Native sessions are window-scoped; older shared previews only stamp staff ownership. */
export function ownsUnstartedActivity(record: LiveSessionRecord, tab: string, uid: string): boolean {
  if (!isUnstartedActivity(record)) return false;
  const session = record.session as unknown as Record<string, unknown>;
  const meta = typeof session.engine === "string"
    ? session[session.engine] as { ownerId?: string; controlTabId?: string } | undefined
    : undefined;
  const owner = (record as LiveSessionRecord & { controllerUid?: string }).controllerUid ?? meta?.ownerId;
  // Runner and the original shared controllers predate window ownership. Keep
  // their account-level boundary; never borrow a different window's native setup.
  return owner === uid && (!meta?.controlTabId || meta.controlTabId === tab);
}
