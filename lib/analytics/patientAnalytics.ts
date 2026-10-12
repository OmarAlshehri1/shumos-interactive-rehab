import { isRingHistory, isNineStageHistory } from '@/lib/spacepilot3d/history';
import { isBalloonQuest3DSession } from "@/lib/sessions/balloonQuestVersion";
import { DIFFICULTY_ORDER, type Difficulty } from "@/lib/game";
import { getHistoricalGameNameAr, type HistoricalGameId } from "@/lib/sessions/historicalGames";
import type { AnyStoredSession } from "@/lib/sessions/types";
import {
  averageFinite,
  finiteCount,
  finiteRatio,
  nonNegativeFiniteNumber,
  safeRatio,
  sumFinite,
} from "@/lib/dataIntegrity/numeric";

export type AnalyticsWindow = "7d" | "30d" | "all";

export interface MetricValue {
  key: string;
  label: string;
  value: number;
  format: "count" | "duration" | "percent" | "milliseconds";
}

export interface GameAnalytics {
  gameId: HistoricalGameId;
  gameNameAr: string;
  sessionCount: number;
  metrics: MetricValue[];
}

export interface TrendPoint {
  sessionId: string;
  completedAt: number;
  accuracy: number | null;
  responseTimeMs: number | null;
  difficultyRank: number;
  difficulty: Difficulty;
}

export interface PatientAnalytics {
  patientId: string;
  window: AnalyticsWindow;
  sessions: AnyStoredSession[];
  totalSessions: number;
  totalActivePlayTimeMs: number | null;
  averageStageDurationMs: number | null;
  completedStages: number | null;
  skippedStages: number | null;
  completionRate: number | null;
  sessionsByGame: Array<{ gameId: HistoricalGameId; label: string; count: number }>;
  sessionsByDifficulty: Array<{ difficulty: Difficulty; count: number }>;
  perGame: GameAnalytics[];
  trendPoints: TrendPoint[];
  trendGameLabel: string | null;
  insights: string[];
  hasTrendData: boolean;
}

const DAY_MS = 86_400_000;

export function sessionAccuracy(session: AnyStoredSession): number | null {
  if (session.gameId === "harvest-valley-3d" || session.gameId === "blooming-world-3d" || session.gameId === "fire-rescue-3d" || session.gameId === "pearl-voyage-3d") return null;
  if (session.gameId === "mirror-quest-3d" || session.gameId === "safe-hex-arena-3d" || session.gameId === "build-quest-3d" || session.gameId === "follow-the-footsteps" || session.gameId === "runner-quest-3d") return null; // Runner Quest has no accuracy concept
  if (session.gameId === "space-pilot") return finiteRatio(session.collectionRate);
  return finiteRatio(session.accuracy);
}

export function sessionResponseTimeMs(session: AnyStoredSession): number | null {
  if (session.gameId === "harvest-valley-3d" || session.gameId === "blooming-world-3d" || session.gameId === "fire-rescue-3d" || session.gameId === "pearl-voyage-3d") return null;
  if (session.gameId === "balloon-quest") return nonNegativeFiniteNumber(session.averageReactionTimeMs);
  if (session.gameId === "follow-the-footsteps") return nonNegativeFiniteNumber(session.averageStepTimeMs);
  if (session.gameId === "mirror-quest-3d" || session.gameId === "safe-hex-arena-3d" || session.gameId === "build-quest-3d" || session.gameId === "space-pilot" || session.gameId === "runner-quest-3d") return null;
  return nonNegativeFiniteNumber(session.averageResponseTimeMs);
}

function metric(key: string, label: string, value: number | null, format: MetricValue["format"]): MetricValue | null {
  return value === null || !Number.isFinite(value) ? null : { key, label, value, format };
}

function perGameMetrics(gameId: HistoricalGameId, sessions: AnyStoredSession[]): MetricValue[] {
  const accuracy = averageFinite(sessions.filter(s => gameId !== 'space-pilot' || !isRingHistory(s)).map(sessionAccuracy));
  const response = averageFinite(sessions.map(sessionResponseTimeMs));
  const base = [
    metric("sessions", "الجلسات", sessions.length, "count"),
    metric("completedStages", "المراحل المكتملة", sumFinite(sessions.map((item) => finiteCount(item.completedStageCount))), "count"),
  ];

  const specific: Array<MetricValue | null> = [];
  if (gameId === "pearl-voyage-3d") {
    const items = sessions.filter(s => s.gameId === "pearl-voyage-3d");
    return [...base, metric("fish", "أسماك مكتشفة", sumFinite(items.map(s => s.fishDiscovered)), "count"), metric("assisted", "اكتشافات بمساعدة", sumFinite(items.map(s => s.assistedEncounters)), "count"), metric("independent", "اكتشافات دون مساعدة", sumFinite(items.map(s => s.independentEncounters)), "count"), metric("skipped", "اكتشافات متخطاة", sumFinite(items.map(s => s.skippedEncounters)), "count")].filter((item): item is MetricValue => item !== null);
  }
  if (gameId === "fire-rescue-3d") {
    const items = sessions.filter(s => s.gameId === "fire-rescue-3d");
    return [...base, metric("driving", "أهداف قيادة", sumFinite(items.map(s => s.drivingObjectives)), "count"), metric("fires", "مناطق أُطفئت", sumFinite(items.map(s => s.fireTargetsExtinguished)), "count"), metric("assisted", "أهداف بمساعدة", sumFinite(items.map(s => s.assistedObjectives)), "count")].filter((m): m is MetricValue => m !== null);
  }
  if (gameId === "mirror-quest-3d") {
    const items = sessions.filter(s => s.gameId === "mirror-quest-3d");
    specific.push(metric("poses", "الحركات المقبولة", sumFinite(items.map(s => s.totalPoses)), "count"));
    specific.push(metric("assists", "بمساعدة المعالج", sumFinite(items.map(s => s.totalAssists)), "count"));
  }
  if (gameId === "safe-hex-arena-3d") {
    const items = sessions.filter((s) => s.gameId === "safe-hex-arena-3d");
    specific.push(metric("rounds", "الجولات المكتملة", sumFinite(items.map((s) => s.totalRoundsCompleted)), "count"));
    specific.push(metric("safeTransitions", "انتقالات آمنة مؤكدة", sumFinite(items.map((s) => s.totalSafeTransitions)), "count"));
    specific.push(metric("assists", "بمساعدة المعالج", sumFinite(items.map((s) => s.totalAssists)), "count"));
  }
  if (gameId === "build-quest-3d") {
    const build = sessions.filter((s) => s.gameId === "build-quest-3d");
    specific.push(metric("piecesPlaced", "القطع الموضوعة", sumFinite(build.map(s => s.totalPiecesPlaced)), "count"));
  }
  if (gameId === "balloon-quest") {
    const items = sessions.filter((item) => item.gameId === gameId);
    specific.push(metric("correct", "الأهداف الصحيحة", sumFinite(items.map((item) => finiteCount(item.totalCorrect))), "count"));
    // Balloon Quest 3D records store informational wrong-colour touches in the same field; they are not "incorrect attempts", so only legacy records feed this metric.
    specific.push(metric("incorrect", "المحاولات غير الصحيحة", sumFinite(items.filter((item) => !isBalloonQuest3DSession(item)).map((item) => finiteCount(item.totalIncorrect))), "count"));
  } else if (gameId === "follow-the-footsteps") {
    const items = sessions.filter((item) => item.gameId === gameId);
    specific.push(metric("steps", "الخطوات المكتملة", sumFinite(items.map((item) => finiteCount(item.totalStepsCompleted))), "count"));
    specific.push(metric("route", "إكمال المسار", averageFinite(items.map((item) => finiteRatio(item.completionRate))), "percent"));
  } else if (gameId === "bubble-pop-wall") {
    const items = sessions.filter((item) => item.gameId === gameId);
    specific.push(metric("targets", "الفقاعات الصحيحة", sumFinite(items.map((item) => finiteCount(item.totalTargetsCompleted))), "count"));
    specific.push(metric("incorrect", "الاختيارات غير الصحيحة", sumFinite(items.map((item) => finiteCount(item.totalIncorrect))), "count"));
  } else if (gameId === "feed-the-animals") {
    const items = sessions.filter((item) => item.gameId === gameId);
    specific.push(metric("animals", "الحيوانات التي أُطعمت", sumFinite(items.map((item) => finiteCount(item.totalRoundsCompleted))), "count"));
    specific.push(metric("path", "إكمال المهام", averageFinite(items.map((item) => finiteRatio(item.completionRate))), "percent"));
  } else if (gameId === "space-pilot") {
    const items = sessions.filter((item) => item.gameId === gameId);
    specific.push(metric("stars", "النجوم المجمعة", sumFinite(items.map((item) => finiteCount(isRingHistory(item) ? null : item.totalStarsCollected))), "count"));
    const ringItems = items.filter(isRingHistory);
    if (ringItems.length) { specific.push(metric("rings", "الحلقات المجمعة", sumFinite(ringItems.map(item => item.totalRingsCollected)), "count")); specific.push(metric("ringCollectionRate", "نسبة جمع الحلقات", averageFinite(ringItems.map(sessionAccuracy)), "percent")); }
    const encounterItems = items.filter((item) => item.endingDifficulty !== "EASY");
    specific.push(metric("asteroidsCleared", "النيازك المزالة", encounterItems.length ? sumFinite(encounterItems.map((item) => finiteCount(isRingHistory(item) ? null : item.asteroidsCleared))) : null, "count"));
    specific.push(metric("asteroidsAvoided", "النيازك المتفاداة", encounterItems.length ? sumFinite(encounterItems.map((item) => finiteCount(item.asteroidsAvoided))) : null, "count"));
    const upgrades = items.map((item) => finiteCount(item.finalUpgradeLevel)).filter((value): value is number => value !== null);
    specific.push(metric("upgrade", "أعلى ترقية", upgrades.length ? Math.max(...upgrades) : null, "count"));
  } else if (gameId === "harvest-valley-3d") {
    const items = sessions.filter(item => item.gameId === gameId);
    specific.push(metric("harvested", "خلايا محصودة", sumFinite(items.map(item=>item.harvestedCells)), "count"));
    specific.push(metric("assisted", "خلايا بمساعدة", sumFinite(items.map(item=>item.assistedActions)), "count"));
  } else if (gameId === "blooming-world-3d") {
    const items = sessions.filter(item => item.gameId === gameId);
    specific.push(metric("restored", "المناطق المزهرة", sumFinite(items.map(item=>item.restoredRegions)), "count"));
    specific.push(metric("assisted", "المناطق بمساعدة", sumFinite(items.map(item=>item.assistedRegions)), "count"));
  } else if (gameId === "runner-quest-3d") {
    const items = sessions.filter((item) => item.gameId === gameId);
    specific.push(metric("stars", "النجوم", sumFinite(items.map((item) => finiteCount(item.totalStars))), "count"));
    specific.push(metric("assists", "مساعدات المعالج", sumFinite(items.map((item) => finiteCount(item.totalAssists))), "count"));
  } else if (gameId === "color-chase") {
    const items = sessions.filter((item) => item.gameId === gameId);
    // nine-stage Color Chase 3D records (`engine: "cc3-garden"`) carry objective counts only: no accuracy, no wrong-choice or danger counts
    const gardenItems = items.filter((item) => item.gameId === "color-chase" && "engine" in item && item.engine === "cc3-garden");
    if (gardenItems.length) {
      specific.push(metric("objectives", "أهداف الألوان المكتملة", sumFinite(gardenItems.map((item) => ("objectivesCompleted" in item ? finiteCount(item.objectivesCompleted) : null))), "count"));
      specific.push(metric("assisted", "مساعدات المعالج", sumFinite(gardenItems.map((item) => ("assistedObjectives" in item ? finiteCount(item.assistedObjectives) : null))), "count"));
    }
    specific.push(metric("correctPads", "اللوحات الصحيحة", sumFinite(items.map((item) => finiteCount(item.totalCorrect))), "count"));
    specific.push(metric("wrongPads", "اختيارات اللون غير الصحيحة", sumFinite(items.map((item) => finiteCount(item.totalIncorrect))), "count"));
    specific.push(metric("danger", "لمسات مناطق الخطر", sumFinite(items.map((item) => finiteCount(item.totalDangerPresses))), "count"));
  }

  if (accuracy !== null) specific.push(metric("accuracy", gameId === "space-pilot" ? "نسبة جمع النجوم" : "متوسط الدقة", accuracy, "percent"));
  if (response !== null) specific.push(metric("response", "متوسط زمن الاستجابة", response, "milliseconds"));
  return [...base, ...specific].filter((item): item is MetricValue => item !== null);
}

function windowStart(window: AnalyticsWindow, now: number): number | null {
  if (window === "7d") return now - 7 * DAY_MS;
  if (window === "30d") return now - 30 * DAY_MS;
  return null;
}

function activeDurations(session: AnyStoredSession): number[] {
  if (session.gameId === "space-pilot" || session.gameId === "harvest-valley-3d" || session.gameId === "blooming-world-3d" || session.gameId === "fire-rescue-3d" || session.gameId === "pearl-voyage-3d") {
    const duration = nonNegativeFiniteNumber(session.durationMs);
    return duration !== null ? [duration] : [];
  }
  return session.stageResults.map((result) => nonNegativeFiniteNumber(result.durationMs)).filter((value): value is number => value !== null);
}

function buildTrendInsights(sessions: AnyStoredSession[]): string[] {
  if (sessions.length < 4 || (sessions.some(isNineStageHistory) && sessions.some(s => s.gameId === 'space-pilot' && !isNineStageHistory(s))) || (sessions.some(isRingHistory) && sessions.some(s => s.gameId === 'space-pilot' && !isRingHistory(s)))) return [];
  const chronological = sessions.slice().sort((a, b) => (nonNegativeFiniteNumber(a.completedAt) ?? 0) - (nonNegativeFiniteNumber(b.completedAt) ?? 0));
  const sampleSize = Math.min(3, Math.floor(chronological.length / 2));
  const earlier = chronological.slice(0, sampleSize);
  const recent = chronological.slice(-sampleSize);
  const insights: string[] = [];

  const earlierAccuracyValues = earlier.map(sessionAccuracy);
  const recentAccuracyValues = recent.map(sessionAccuracy);
  const earlierAccuracy = earlierAccuracyValues.every((value) => value !== null) ? averageFinite(earlierAccuracyValues) : null;
  const recentAccuracy = recentAccuracyValues.every((value) => value !== null) ? averageFinite(recentAccuracyValues) : null;
  if (earlierAccuracy !== null && recentAccuracy !== null && Math.abs(recentAccuracy - earlierAccuracy) >= 0.01) {
    const verb = recentAccuracy > earlierAccuracy ? "ارتفعت" : "انخفضت";
    insights.push(`${verb} دقة اللعب المسجلة من ${Math.round(earlierAccuracy * 100)}٪ إلى ${Math.round(recentAccuracy * 100)}٪.`);
  }

  const earlierResponseValues = earlier.map(sessionResponseTimeMs);
  const recentResponseValues = recent.map(sessionResponseTimeMs);
  const earlierResponse = earlierResponseValues.every((value) => value !== null) ? averageFinite(earlierResponseValues) : null;
  const recentResponse = recentResponseValues.every((value) => value !== null) ? averageFinite(recentResponseValues) : null;
  if (earlierResponse !== null && recentResponse !== null && Math.abs(recentResponse - earlierResponse) >= 100) {
    const verb = recentResponse < earlierResponse ? "انخفض" : "ارتفع";
    insights.push(`${verb} متوسط زمن الاستجابة المسجل من ${(earlierResponse / 1000).toFixed(1)}ث إلى ${(recentResponse / 1000).toFixed(1)}ث.`);
  }

  const earlierRanks = earlier.map((item) => DIFFICULTY_ORDER.indexOf(item.endingDifficulty)).filter((rank) => rank >= 0);
  const recentRanks = recent.map((item) => DIFFICULTY_ORDER.indexOf(item.endingDifficulty)).filter((rank) => rank >= 0);
  const earlierDifficulty = earlierRanks.length ? Math.max(...earlierRanks) : -1;
  const recentDifficulty = recentRanks.length ? Math.max(...recentRanks) : -1;
  if (recentDifficulty > earlierDifficulty) {
    const labels = ["السهل", "المتوسط", "المتقدم"];
    insights.push(`وصلت الجلسات الأخيرة إلى المستوى ${labels[recentDifficulty]}.`);
  }
  return insights;
}

export function buildPatientAnalytics(
  allSessions: readonly AnyStoredSession[],
  patientId: string,
  window: AnalyticsWindow = "all",
  now = Date.now(),
): PatientAnalytics {
  const start = windowStart(window, now);
  const sessions = allSessions
    .filter((session) => {
      if (session.patientId !== patientId) return false;
      const completedAt = nonNegativeFiniteNumber(session.completedAt);
      return start === null || (completedAt !== null && completedAt >= start);
    })
    .slice()
    .sort((a, b) => (nonNegativeFiniteNumber(b.completedAt) ?? -1) - (nonNegativeFiniteNumber(a.completedAt) ?? -1));
  const completedStages = sumFinite(sessions.map((item) => finiteCount(item.completedStageCount)));
  const skippedStages = sumFinite(sessions.map((item) => finiteCount(item.skippedStageCount)));

  const gameCounts = new Map<HistoricalGameId, number>();
  const difficultyCounts = new Map<Difficulty, number>();
  for (const session of sessions) {
    gameCounts.set(session.gameId, (gameCounts.get(session.gameId) ?? 0) + 1);
    difficultyCounts.set(session.endingDifficulty, (difficultyCounts.get(session.endingDifficulty) ?? 0) + 1);
  }

  const perGame = Array.from(gameCounts.keys()).map((gameId) => {
    const gameSessions = sessions.filter((session) => session.gameId === gameId);
    return {
      gameId,
      gameNameAr: getHistoricalGameNameAr(gameId),
      sessionCount: gameSessions.length,
      metrics: perGameMetrics(gameId, gameSessions),
    };
  });

  const trendGroups = perGame
    .map((game) => ({ game, sessions: sessions.filter((session) => session.gameId === game.gameId && nonNegativeFiniteNumber(session.completedAt) !== null) }))
    .filter((group) => group.sessions.length >= 4 && !(group.sessions.some(isRingHistory) && group.sessions.some(s => s.gameId === 'space-pilot' && !isRingHistory(s))))
    .sort((a, b) => b.sessions.length - a.sessions.length);
  const trendGroup = trendGroups[0] ?? null;
  const insights = trendGroups.flatMap(({ game, sessions: gameSessions }) =>
    buildTrendInsights(gameSessions).map((insight) => `${game.gameNameAr}: ${insight}`),
  );
  if (sessions.length) {
    const recent30 = sessions.filter((item) => {
      const completedAt = nonNegativeFiniteNumber(item.completedAt);
      return completedAt !== null && completedAt >= now - 30 * DAY_MS && completedAt <= now + 5 * 60_000;
    }).length;
    if (recent30 > 0) insights.unshift(`تم تسجيل ${recent30} ${recent30 === 1 ? "جلسة" : "جلسات"} خلال آخر 30 يومًا.`);
    const bestRecent = perGame
      .map((game) => ({ game, accuracy: game.metrics.find((item) => item.key === "accuracy")?.value ?? null }))
      .filter((item): item is { game: GameAnalytics; accuracy: number } => item.accuracy !== null)
      .sort((a, b) => b.accuracy - a.accuracy)[0];
    if (bestRecent) insights.push(`أعلى دقة مسجلة حسب النشاط كانت في ${bestRecent.game.gameNameAr}: ${Math.round(bestRecent.accuracy * 100)}٪.`);
  }

  const trendPoints = (trendGroup?.sessions ?? []).slice().reverse().map((session) => ({
    sessionId: session.sessionId,
    completedAt: nonNegativeFiniteNumber(session.completedAt)!,
    accuracy: sessionAccuracy(session),
    responseTimeMs: sessionResponseTimeMs(session),
    difficultyRank: Math.max(0, DIFFICULTY_ORDER.indexOf(session.endingDifficulty)),
    difficulty: session.endingDifficulty,
  }));
  const recordedActiveDurations = sessions.flatMap(activeDurations);

  return {
    patientId,
    window,
    sessions,
    totalSessions: sessions.length,
    totalActivePlayTimeMs: recordedActiveDurations.length ? sumFinite(recordedActiveDurations) : null,
    averageStageDurationMs: averageFinite(recordedActiveDurations),
    completedStages,
    skippedStages,
    completionRate: completedStages === null || skippedStages === null ? null : safeRatio(completedStages, completedStages + skippedStages),
    sessionsByGame: Array.from(gameCounts, ([gameId, count]) => ({ gameId, label: getHistoricalGameNameAr(gameId), count })),
    sessionsByDifficulty: Array.from(difficultyCounts, ([difficulty, count]) => ({ difficulty, count })),
    perGame,
    trendPoints,
    trendGameLabel: trendGroup?.game.gameNameAr ?? null,
    insights: insights.slice(0, 4),
    hasTrendData: trendGroup !== null,
  };
}

export function buildSessionInsights(session: AnyStoredSession): string[] {
  const insights: string[] = [];
  const completed = finiteCount(session.completedStageCount);
  const skipped = finiteCount(session.skippedStageCount);
  const attempted = completed === null || skipped === null ? null : completed + skipped;
  if (attempted !== null && attempted > 0) insights.push(`أكمل ${completed} من ${attempted} مراحل مسجلة.`);
  if (skipped !== null && skipped > 0) insights.push(`تم تخطي ${skipped} ${skipped === 1 ? "مرحلة" : "مراحل"}.`);
  if(isNineStageHistory(session)){const repeats=Object.values(session.stageResults).reduce((n,r)=>n+r.repeats,0);if(repeats)insights.push(`أُعيدت مراحل قائد الفضاء ${repeats} مرة دون مضاعفة النتائج.`);}
  if ("stageResults" in session && !isNineStageHistory(session)) {
    const seen = new Set<string>();
    let repeats = 0;
    for (const result of session.stageResults) {
      const key = `${result.difficulty}-${result.stageNumber}`;
      if (seen.has(key)) repeats += 1;
      seen.add(key);
    }
    if (repeats > 0) insights.push(`تتضمن الجلسة ${repeats} إعادة محاولة مسجلة.`);
  }
  const accuracy = sessionAccuracy(session);
  if (accuracy !== null) insights.push(`${session.gameId === "space-pilot" ? (isRingHistory(session) ? "نسبة جمع الحلقات" : "نسبة جمع النجوم") : "دقة اللعب"} في هذه الجلسة ${Math.round(accuracy * 100)}٪.`);
  const response = sessionResponseTimeMs(session);
  if (response !== null && insights.length < 4) insights.push(`متوسط زمن الاستجابة المسجل ${(response / 1000).toFixed(1)}ث.`);
  return insights.slice(0, 4);
}
