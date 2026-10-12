import type { LiveSessionRecord } from "@/lib/realtime/types";
import type { AnyStoredSession } from "@/lib/sessions/types";
/** Resolve actual immutable result keys; never accept a previous run as proof of this run saving. */
export function historyKeyForLive(record: LiveSessionRecord): string | null {
  const session = record.session as unknown as Record<string, unknown>,
    engine = session.engine;
  const suffixed = ["fp3", "cc3", "dome3", "mirror3", "hex3"],
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
