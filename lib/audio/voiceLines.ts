import type { BalloonColor, StageNumber } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "@/components/display/colorPalette";
import { stageOrdinalAr } from "@/components/display/copy";

/**
 * Arabic phrase builders for spoken feedback — kept as pure string
 * functions with no browser dependency, so they're easy to unit test and
 * easy to swap wording without touching AudioManager or either
 * VoiceProvider. Reuses the color adjectives from colorPalette.ts (the
 * written and spoken color names stay in sync), but every other phrase
 * here is intentionally *spoken* Saudi-colloquial Arabic, not a
 * word-for-word reading of the written on-screen text — e.g. the spoken
 * incorrect line ("قريب! جرّب مرة ثانية") deliberately differs from the
 * visual floating text ("حاول مرة أخرى" in components/display/copy.ts),
 * because natural spoken and natural written phrasing aren't the same
 * thing, and the visual copy is approved/unchanged.
 *
 * Nothing here hardcodes "محمد" — every phrase takes childName as a plain
 * parameter, sourced from lib/demo's fixed demo config today and from
 * /control in the future.
 */

export function welcomeLine(childName: string): string {
  return `أهلاً ${childName}! مستعد لمغامرة البالونات؟`;
}

export function instructionLine(targetColor: BalloonColor): string {
  return `يلا، دور على البالونات ${BALLOON_COLOR_THEME[targetColor].adjectiveAr}!`;
}

/** TASK 8.2: spoken once before Stage 1, asking the child to stand in the projected Start Zone. */
export function startZoneFirstLine(): string {
  return "يلا، وقف داخل المربع الأبيض عشان نبدأ!";
}

/** TASK 8.2: spoken every time the child must return to the Start Zone between stages (never before Stage 1 — see startZoneFirstLine). */
export function startZoneReturnLine(): string {
  return "ممتاز! الحين ارجع للمربع الأبيض عشان نبدأ المرحلة الجاية.";
}

export function countdownLine(tick: "3" | "2" | "1" | "start"): string {
  switch (tick) {
    case "3":
      return "ثلاثة";
    case "2":
      return "اثنان";
    case "1":
      return "واحد";
    case "start":
      return "ابدأ!";
  }
}

export function incorrectLine(): string {
  return "قريب! جرّب مرة ثانية";
}

/** Opening word varies deliberately by stage number so a 5-stage difficulty doesn't repeat the same word each time. */
const STAGE_COMPLETE_OPENER: Record<StageNumber, string> = {
  1: "بطل",
  2: "نجم",
  3: "عبقري",
  4: "خارق",
  5: "أسطورة",
};

export function stageCompleteLine(childName: string, stageNumber: StageNumber): string {
  return `${STAGE_COMPLETE_OPENER[stageNumber]} يا ${childName}! خلصت المرحلة ${stageOrdinalAr(stageNumber)}!`;
}

export function sessionCompleteLine(childName: string): string {
  return `يا سلام يا ${childName}! خلصت مغامرة البالونات كلها!`;
}

/**
 * Progress milestones within a stage, checked at ~25% / ~50% / ~75% of
 * that stage's target balloons. The final target is deliberately excluded
 * here — that moment is already covered by the richer, personalized
 * stage-complete line, so speaking twice about the same pop would feel
 * redundant.
 */
export type EncouragementBand = "quarter" | "half" | "threeQuarter";

const ENCOURAGEMENT_POOLS: Record<EncouragementBand, readonly ((name: string) => string)[]> = {
  quarter: [(name) => `رائع يا ${name}!`, (name) => `شاطر يا ${name}!`],
  half: [(name) => `أحسنت يا ${name}!`, (name) => `ممتاز يا ${name}، كمل!`],
  threeQuarter: [(name) => `باقي شوي يا ${name}!`, (name) => `قربت خلصت يا ${name}!`],
};

/**
 * Which single band (if any) this pop newly crossed, comparing the
 * balloon count before and after. Bands are checked from highest to
 * lowest so a stage with very few targets (a pop can cross more than one
 * band at once) only speaks the most meaningful one reached, once.
 */
export function crossedEncouragementBand(previousCorrect: number, correct: number, totalTargets: number): EncouragementBand | null {
  if (totalTargets <= 0 || correct >= totalTargets) return null; // the final target belongs to the stage-complete line, not here
  const previousRatio = previousCorrect / totalTargets;
  const currentRatio = correct / totalTargets;
  const bands: readonly [number, EncouragementBand][] = [
    [0.75, "threeQuarter"],
    [0.5, "half"],
    [0.25, "quarter"],
  ];
  for (const [threshold, band] of bands) {
    if (currentRatio >= threshold && previousRatio < threshold) return band;
  }
  return null;
}

/**
 * Picks a phrase for the given band. `occurrenceIndex` is how many times
 * this specific band has already been used earlier in the session (0 the
 * first time, 1 the second, ...) — cycling deterministically through the
 * pool guarantees no back-to-back repeat *and* better variety across a
 * full 3-stage session, where the same band (e.g. "half") is often crossed
 * once per stage. No randomness involved.
 */
export function encouragementLine(band: EncouragementBand, childName: string, occurrenceIndex: number): string {
  const pool = ENCOURAGEMENT_POOLS[band];
  const index = ((occurrenceIndex % pool.length) + pool.length) % pool.length;
  return pool[index](childName);
}

/** Every phrase template this session's config makes predictable, for prefetching (see AudioManager.prefetchForSession). */
export function allEncouragementLines(childName: string): string[] {
  const bands: readonly EncouragementBand[] = ["quarter", "half", "threeQuarter"];
  const lines: string[] = [];
  for (const band of bands) {
    for (let i = 0; i < ENCOURAGEMENT_POOLS[band].length; i++) {
      lines.push(encouragementLine(band, childName, i));
    }
  }
  return lines;
}
