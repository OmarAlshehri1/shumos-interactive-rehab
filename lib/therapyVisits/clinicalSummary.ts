import { getGameById } from "@/lib/games/registry";
import { gameSkillTags } from "@/lib/games/library/skillTags";
import { getHistoricalGameNameAr } from "@/lib/sessions/historicalGames";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { ASSISTANCE_LABELS, elapsedMs, type Visit } from "./model";
import { hasRecordedLevels } from "./clinicalResults";
export const missing = "غير مسجل";
export const gameName = (id: Parameters<typeof getHistoricalGameNameAr>[0]) =>
  getHistoricalGameNameAr(id);
export const visitStatus = (v: Visit) =>
  !v.endedAt
    ? v.pausedAt
      ? "في استراحة"
      : "قيد التنفيذ"
    : Object.keys(v.entries).length === 0
      ? "انتهت دون أنشطة مسجلة"
      : Object.values(v.entries).every(
            (e) => e.evaluation.completion === "interrupted",
          )
        ? "انتهت بأنشطة متوقفة"
        : "منتهية";
export const difficultyName = (s: string) =>
  ({ EASY: "سهل", MEDIUM: "متوسط", ADVANCED: "متقدم" })[s] ?? missing;
export const completionName = (s: string) =>
  ({ completed: "مكتمل", partial: "جزئي", interrupted: "متوقف" })[s] ?? missing;
const mappings: Partial<
  Record<AnyStoredSession["gameId"], [string, string][]>
> = {
  "balance-bridge-3d": [
    ["checkpointsAttempted", "علامات جرى العمل عليها"],
    ["checkpointsConfirmed", "علامات أكدها الأخصائي"],
    ["assistedCheckpoints", "علامات بمساعدة"],
    ["skippedCheckpoints", "علامات متجاوزة"],
    ["holdCompletions", "ثبات مؤكد"],
  ],
  "rhythm-steps-3d": [
    ["totalTargetEvents", "الأهداف المعروضة"],
    ["confirmedEvents", "أهداف مؤكدة"],
    ["assistedEvents", "أهداف بمساعدة"],
    ["skippedEvents", "أهداف متجاوزة"],
    ["missedEvents", "أهداف غير مؤكدة"],
    ["repetitions", "التكرارات"],
  ],
  "turn-and-go-3d": [
    ["totalCheckpoints", "علامات المسار"],
    ["confirmedCheckpoints", "علامات مؤكدة"],
    ["assistedCheckpoints", "علامات بمساعدة"],
    ["skippedCheckpoints", "علامات متجاوزة"],
    ["stopHoldsCompleted", "توقف وثبات مؤكد"],
  ],
  "foot-maze-3d": [
    ["confirmedCheckpoints", "علامات مؤكدة"],
    ["assistedCheckpoints", "علامات بمساعدة"],
    ["skippedCheckpoints", "علامات متجاوزة"],
    ["routeChoices", "اختيارات المسار"],
    ["routeChoicesCorrect", "اختيارات صحيحة"],
  ],
  "body-sequence-3d": [
    ["totalMovements", "الحركات المعروضة"],
    ["confirmedMovements", "حركات مؤكدة"],
    ["assistedMovements", "حركات بمساعدة"],
    ["skippedMovements", "حركات متجاوزة"],
    ["movementAttempts", "محاولات مسجلة"],
    ["incorrectAttempts", "محاولات غير صحيحة مسجلة"],
  ],
};
const generic: [string, string][] = [
  ["totalCorrect", "نجاحات داخل اللعبة"],
  ["totalIncorrect", "محاولات غير صحيحة داخل اللعبة"],
  ["totalStepsCompleted", "خطوات مؤكدة"],
  ["totalTargetsCompleted", "أهداف مكتملة"],
  ["totalStarsCollected", "نجوم جُمعت"],
  ["completedObjectives", "أهداف مكتملة"],
  ["assistedObjectives", "أهداف بمساعدة"],
  ["skippedObjectives", "أهداف متجاوزة"],
];
export function clinicalMetrics(record: AnyStoredSession) {
  const raw = record as unknown as Record<string, unknown>;
  return (mappings[record.gameId] ?? generic)
    .filter(
      ([key]) =>
        typeof raw[key] === "number" &&
        Number.isFinite(raw[key]) &&
        (raw[key] as number) >= 0,
    )
    .map(([key, label]) => ({ key, label, value: raw[key] as number }));
}
export function recordedSide(record: AnyStoredSession): string {
  const settings = (record as unknown as { settings?: { limbs?: unknown } })
    .settings;
  const limbs = settings?.limbs;
  const labels: Record<string, string> = {
    right: "اليمنى",
    left: "اليسرى",
    both: "الجانبان",
    either: "أي جانب",
    any: "أي جانب",
    RIGHT_FOOT: "القدم اليمنى",
    LEFT_FOOT: "القدم اليسرى",
    RIGHT_HAND: "اليد اليمنى",
    LEFT_HAND: "اليد اليسرى",
  };
  return typeof limbs === "string"
    ? (labels[limbs] ?? missing)
    : Array.isArray(limbs)
      ? limbs
          .map((v) => labels[String(v)])
          .filter(Boolean)
          .join("، ") || missing
      : missing;
}
export function overallVisitSummary(v: Visit, records: AnyStoredSession[]) {
  const entries = Object.values(v.entries),
    games = entries.filter((e) => e.kind === "game"),
    exercises = entries.filter((e) => e.kind === "exercise");
  const relevant = records.filter((r) =>
    games.some((e) => e.kind === "game" && e.sessionId === r.sessionId),
  );
  const assistance = entries
    .map((e) => e.evaluation.assistance)
    .filter((a) => a !== "unrecorded");
  const skills = [
    ...new Set(
      games.flatMap((e) => {
        const g = e.kind === "game" ? getGameById(e.gameId) : null;
        return g ? gameSkillTags(g) : [];
      }),
    ),
  ];
  return {
    durationMs: elapsedMs(v, v.endedAt ?? v.updatedAt),
    gamesCompleted: games.filter((e) => e.evaluation.completion === "completed")
      .length,
    exercisesCompleted: exercises.filter(
      (e) =>
        e.kind === "exercise" &&
        e.confirmed &&
        e.evaluation.completion === "completed",
    ).length,
    interrupted: entries.filter(
      (e) => e.evaluation.completion === "interrupted",
    ).length,
    partial: entries.filter((e) => e.evaluation.completion === "partial")
      .length,
    skippedStages:
      relevant.length !== games.length
        ? null
        : relevant.reduce<number | null>(
            (sum, r) =>
              sum === null || typeof r.skippedStageCount !== "number"
                ? null
                : sum + r.skippedStageCount,
            0,
          ),
    assistance: [...new Set(assistance)].map((a) => ASSISTANCE_LABELS[a]),
    skills,
    rating: v.overallRating,
  };
}
export function comparablePrevious(
  v: Visit,
  visits: Visit[],
  records: AnyStoredSession[] = [],
): Visit | null {
  const objectives = (x: Visit) =>
    Object.values(x.entries).map((e) =>
      e.kind === "game"
        ? (() => {
            const r = records.find((r) => r.sessionId === e.sessionId);
            return r && hasRecordedLevels(r)
              ? `game:${e.gameId}:${r.endingDifficulty}:${r.endingStage}`
              : "";
          })()
        : `exercise:${e.title.trim()}:${e.goal.trim()}`,
    );
  const target = objectives(v).filter(Boolean);
  return (
    [...visits]
      .filter(
        (p) =>
          p.visitId !== v.visitId &&
          p.endedAt !== null &&
          p.startedAt < v.startedAt &&
          objectives(p).some((k) => target.includes(k)),
      )
      .sort(
        (a, b) =>
          b.startedAt - a.startedAt || a.visitId.localeCompare(b.visitId),
      )[0] ?? null
  );
}
export function ratingComparison(v: Visit, p: Visit | null) {
  if (!p) return "لا توجد جلسة سابقة بأهداف مشتركة.";
  if (v.overallRating === null || p.overallRating === null)
    return "تقييم إحدى الجلستين غير مسجل؛ لا يمكن مقارنة التقييم.";
  return `تقييم الأخصائي: ${p.overallRating}/5 في الجلسة السابقة، و${v.overallRating}/5 في هذه الجلسة.`;
}
export function independentSessions(
  records: AnyStoredSession[],
  visits: Visit[],
  claims: Record<string, unknown> = {},
) {
  const linked = new Set([
    ...Object.keys(claims),
    ...visits.flatMap((v) =>
      Object.values(v.entries)
        .filter((e) => e.kind === "game")
        .map((e) => (e.kind === "game" ? e.sessionId : "")),
    ),
  ]);
  return records.filter((r) => !linked.has(r.sessionId));
}

export function pendingVisitResults(
  records: AnyStoredSession[],
  visits: Visit[],
  claims: Record<string, string>,
) {
  const linked = new Set(
    visits.flatMap((v) =>
      Object.values(v.entries)
        .filter((e) => e.kind === "game")
        .map((e) => (e.kind === "game" ? e.sessionId : "")),
    ),
  );
  return records.filter(
    (r) => !!claims[r.sessionId] && !linked.has(r.sessionId),
  );
}

/** Descriptive recorded values only, never an improvement claim or mixed-game score. */
export function objectiveComparison(
  current: Visit,
  previous: Visit | null,
  records: AnyStoredSession[],
): string[] {
  if (!previous) return [];
  const rows: string[] = [];
  for (const e of Object.values(current.entries)) {
    if (e.kind === "exercise") {
      const old = Object.values(previous.entries).find(
        (p) =>
          p.kind === "exercise" && p.title === e.title && p.goal === e.goal,
      );
      if (old?.kind === "exercise")
        rows.push(
          `${e.title} · التكرارات المسجلة: سابقاً ${old.repetitions}، حالياً ${e.repetitions}.`,
        );
    } else {
      const currentResult = records.find((r) => r.sessionId === e.sessionId);
      if (!currentResult || !hasRecordedLevels(currentResult)) continue;
      const old = Object.values(previous.entries)
        .filter((p) => p.kind === "game" && p.gameId === e.gameId)
        .map((p) =>
          records.find((r) => p.kind === "game" && r.sessionId === p.sessionId),
        )
        .find(
          (r) =>
            r &&
            r.startingDifficulty === currentResult.startingDifficulty &&
            r.startingStage === currentResult.startingStage &&
            r.endingDifficulty === currentResult.endingDifficulty &&
            r.endingStage === currentResult.endingStage,
        );
      if (!old || !hasRecordedLevels(old)) continue;
      const before = clinicalMetrics(old),
        after = clinicalMetrics(currentResult);
      const metric = after.find((m) => before.some((p) => p.key === m.key));
      if (metric)
        rows.push(
          `${gameName(e.gameId)} · ${metric.label}: سابقاً ${before.find((m) => m.key === metric.key)!.value}، حالياً ${metric.value}.`,
        );
    }
  }
  return rows.slice(0, 3);
}
