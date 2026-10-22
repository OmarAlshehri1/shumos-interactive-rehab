import type { LiveSessionRecord } from "@/lib/realtime/types";
import { isUnstartedActivity } from "@/lib/therapyVisits/gameSafety";
import { visitGamePaused } from "@/lib/therapyVisits/gameSafety";
/** Presentation only. Never advances clocks, changes a session or interprets scoring. */
export function workspacePresentation(record: LiveSessionRecord | null, gameId: string) {
  const active = !!record && record.gameId === gameId && typeof (record.session as unknown as { engine?: unknown }).engine === "string" && !isUnstartedActivity(record) && record.session.gameState !== "SESSION_COMPLETE";
  if (!record || record.gameId !== gameId) return { active: false, paused: false, level: "", stage: "", elapsed: "", status: "" };
  const session = record.session as unknown as Record<string, unknown>;
  let native: Record<string, unknown> = {};
  try {
    const envelope = session[String(session.engine)] as { payload?: string; snapshot?: string; state?: Record<string, unknown> } | undefined;
    const decoded: unknown = envelope?.payload || envelope?.snapshot ? JSON.parse(envelope.payload ?? envelope.snapshot!) : envelope?.state;
    native = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded as Record<string, unknown> : {};
  } catch { /* Malformed records have no invented metrics. */ }
  const current = session.currentStage as { stageNumber?: number } | undefined;
  const difficulty = String(session.currentDifficulty ?? "");
  const level = ({ EASY: "سهل", MEDIUM: "متوسط", ADVANCED: "متقدم" } as Record<string, string>)[difficulty] ?? (typeof native.level === "number" ? ["سهل", "متوسط", "متقدم"][native.level] ?? "" : "");
  const stage = ["achievement-forest-3d", "achievement-city-3d", "ocean-wonders-3d"].includes(gameId) ? "" : typeof current?.stageNumber === "number" ? String(current.stageNumber) : typeof native.stage === "number" ? String(native.stage % 3 + 1) : "";
  const rewards = ["achievement-forest-3d", "achievement-city-3d", "ocean-wonders-3d"];
  const stats = Array.isArray(native.stats) ? native.stats as { activeMs?: number }[] : [];
  const ms = typeof native.elapsedMs === "number" ? native.elapsedMs : typeof native.activeTimeMs === "number" ? native.activeTimeMs : rewards.includes(gameId) && typeof native.clock === "number" ? native.clock : stats.length && stats.every(row => typeof row.activeMs === "number" && row.activeMs >= 0) ? stats.reduce((sum, row) => sum + row.activeMs!, 0) : null;
  const elapsed = ms !== null && Number.isFinite(ms) && ms >= 0 ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}` : "";
  const paused = visitGamePaused(record);
  const status = paused ? "متوقف مؤقتًا" : record.session.gameState === "STAGE_COMPLETE" || ["stage-complete", "level-complete", "mission-complete"].includes(String(native.status ?? native.lifecycle)) ? "اكتملت المرحلة" : "النشاط جارٍ";
  return { active, paused, level, stage, elapsed, status };
}
