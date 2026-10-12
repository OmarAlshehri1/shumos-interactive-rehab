import type { GameId } from "@/lib/games/registry";

export type Assistance =
  "unrecorded" | "independent" | "verbal" | "partial" | "full";
export const ASSISTANCE_LABELS: Record<Assistance, string> = {
  unrecorded: "لم تُسجّل",
  independent: "مستقل",
  verbal: "توجيه لفظي",
  partial: "مساعدة جزئية",
  full: "مساعدة كاملة",
};
export type Completion = "completed" | "partial" | "interrupted";
export interface Evaluation {
  rating: number | null;
  assistance: Assistance;
  notes: string;
  completion: Completion;
  updatedAt: number;
  updatedByUid: string;
}
export interface GameReference {
  kind: "game";
  sessionId: string;
  gameId: GameId;
  linkedAt: number;
  evaluation: Evaluation;
}
export interface ExerciseBlock {
  kind: "exercise";
  title: string;
  goal: string;
  repetitions: number;
  holdSeconds: number;
  confirmed: boolean;
  recordedAt: number;
  evaluation: Evaluation;
}
export interface Visit {
  version: 1;
  visitId: string;
  patientId: string | null;
  childName: string;
  ownerUid: string;
  controlTabId: string;
  title: string;
  therapistName: string;
  initialNotes: string;
  finalNotes: string;
  overallRating: number | null;
  startedAt: number;
  plannedMs: number;
  pausedMs: number;
  pausedAt: number | null;
  endedAt: number | null;
  revision: number;
  updatedAt: number;
  entries: Record<string, GameReference | ExerciseBlock>;
  breaks: Record<string, { startedAt: number; endedAt: number | null }>;
}
export const safeKey = (v: string) => /^[A-Za-z0-9_-]{1,150}$/.test(v);
export function elapsedMs(v: Visit, now: number): number {
  return Math.max(
    0,
    (v.endedAt ?? v.pausedAt ?? now) - v.startedAt - v.pausedMs,
  );
}
export function visitClock(v: Visit, now: number) {
  const elapsed = elapsedMs(v, now);
  return {
    elapsed,
    remaining: Math.max(0, v.plannedMs - elapsed),
    overtime: Math.max(0, elapsed - v.plannedMs),
    expired: elapsed >= v.plannedMs,
  };
}
export function formatClock(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
export function blankEvaluation(uid: string, now: number): Evaluation {
  return {
    rating: null,
    assistance: "unrecorded",
    notes: "",
    completion: "partial",
    updatedAt: now,
    updatedByUid: uid,
  };
}
export function pauseVisit(v: Visit, now: number): Visit {
  if (v.endedAt || v.pausedAt !== null) return v;
  return {
    ...v,
    pausedAt: now,
    breaks: { ...v.breaks, [`b${now}`]: { startedAt: now, endedAt: null } },
  };
}
export function resumeVisit(v: Visit, now: number): Visit {
  if (v.endedAt || v.pausedAt === null) return v;
  const breaks = Object.fromEntries(
    Object.entries(v.breaks).map(([k, b]) => [
      k,
      b.endedAt === null ? { ...b, endedAt: now } : b,
    ]),
  );
  return {
    ...v,
    pausedMs: v.pausedMs + Math.max(0, now - v.pausedAt),
    pausedAt: null,
    breaks,
  };
}
export function finishVisit(v: Visit, now: number): Visit {
  return v.endedAt ? v : { ...resumeVisit(v, now), endedAt: now };
}
export function validEvaluation(e: Evaluation): boolean {
  return (
    !!e &&
    (e.rating === null ||
      (Number.isInteger(e.rating) && e.rating >= 0 && e.rating <= 5)) &&
    e.assistance in ASSISTANCE_LABELS &&
    ["completed", "partial", "interrupted"].includes(e.completion) &&
    typeof e.notes === "string" &&
    e.notes.length <= 2000 &&
    Number.isFinite(e.updatedAt) &&
    e.updatedAt >= 0 &&
    typeof e.updatedByUid === "string"
  );
}
export function assertVisit(v: Visit): void {
  const text = (s: unknown, max: number, empty = false) =>
    typeof s === "string" && s.length <= max && (empty || s.trim().length > 0);
  if (
    !v ||
    v.version !== 1 ||
    !safeKey(v.visitId) ||
    (v.patientId !== null && !safeKey(v.patientId)) ||
    !text(v.ownerUid, 128) ||
    !text(v.controlTabId, 150) ||
    !text(v.childName, 50) ||
    !text(v.title, 100) ||
    !text(v.therapistName, 100) ||
    !text(v.initialNotes, 2000, true) ||
    !text(v.finalNotes, 2000, true)
  )
    throw Error("بيانات الجلسة غير صالحة");
  if (
    ![v.startedAt, v.plannedMs, v.pausedMs, v.updatedAt, v.revision].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    !Number.isInteger(v.revision) ||
    v.plannedMs < 60000 ||
    v.plannedMs > 8 * 60 * 60000 ||
    v.pausedMs > (v.endedAt ?? v.pausedAt ?? v.updatedAt) - v.startedAt ||
    [v.pausedAt, v.endedAt].some(
      (n) => n !== null && (!Number.isFinite(n) || n < v.startedAt),
    ) ||
    (v.pausedAt !== null && v.endedAt !== null) ||
    (v.overallRating !== null &&
      (!Number.isInteger(v.overallRating) ||
        v.overallRating < 0 ||
        v.overallRating > 5))
  )
    throw Error("توقيت الجلسة غير صالح");
  if (
    !v.entries ||
    Object.keys(v.entries).length > 200 ||
    !v.breaks ||
    Object.keys(v.breaks).length > 200
  )
    throw Error("عدد الأنشطة غير صالح");
  for (const [key, e] of Object.entries(v.entries)) {
    if (!safeKey(key) || !validEvaluation(e.evaluation))
      throw Error("تقييم غير صالح");
    if (e.kind === "game") {
      if (
        key !== e.sessionId ||
        !safeKey(e.sessionId) ||
        !text(e.gameId, 100) ||
        !Number.isFinite(e.linkedAt) ||
        e.linkedAt < v.startedAt
      )
        throw Error("مرجع نتيجة غير صالح");
    } else if (
      e.kind !== "exercise" ||
      !text(e.title, 100) ||
      !text(e.goal, 500, true) ||
      ![e.repetitions, e.holdSeconds].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 10000,
      ) ||
      typeof e.confirmed !== "boolean" ||
      !Number.isFinite(e.recordedAt) ||
      e.recordedAt < v.startedAt
    )
      throw Error("تمرين غير صالح");
  }
  for (const [key, b] of Object.entries(v.breaks))
    if (
      !safeKey(key) ||
      !Number.isFinite(b.startedAt) ||
      b.startedAt < v.startedAt ||
      (b.endedAt !== null &&
        (!Number.isFinite(b.endedAt) || b.endedAt < b.startedAt))
    )
      throw Error("استراحة غير صالحة");
}
/** Firebase removes null scalars and empty objects; restore only known optional fields. */
export function reviveVisit(raw: unknown): Visit | null {
  try {
    const r = raw as Visit;
    const v: Visit = {
      ...r,
      patientId: r.patientId ?? null,
      pausedAt: r.pausedAt ?? null,
      endedAt: r.endedAt ?? null,
      overallRating: r.overallRating ?? null,
      entries: Object.fromEntries(
        Object.entries(r.entries ?? {}).map(([k, e]) => [
          k,
          {
            ...e,
            evaluation: {
              ...e.evaluation,
              rating: e.evaluation.rating ?? null,
            },
          },
        ]),
      ),
      breaks: Object.fromEntries(
        Object.entries(r.breaks ?? {}).map(([k, b]) => [
          k,
          { ...b, endedAt: b.endedAt ?? null },
        ]),
      ),
    };
    assertVisit(v);
    return v;
  } catch {
    return null;
  }
}
