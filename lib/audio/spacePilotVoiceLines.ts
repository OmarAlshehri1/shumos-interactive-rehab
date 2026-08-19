/**
 * Space Pilot's own spoken Arabic phrase builders — deliberately a SEPARATE
 * module from every other game's own voiceLines file, per the platform's
 * "each game must not be mistakable for another" convention. Kept minimal
 * by design (task's "keep speech minimal... do NOT narrate every target
 * unless needed — the visual star position should teach the child").
 */

export function spacePilotWelcomeLine(childName: string): string {
  return `أهلاً ${childName}! جاهز لقيادة الصاروخ عبر الفضاء؟`;
}

export function spacePilotReadyPositionLine(): string {
  return "قف قدام الشاشة، وخلك جاهز تحرك الصاروخ!";
}

/** Task's exact spoken instruction for EASY: "اجمع النجوم!" */
export function spacePilotInstructionLine(): string {
  return "اجمع النجوم!";
}

/** MEDIUM makes FIRE the intended mechanic instead of leading with avoidance. */
export function spacePilotMediumInstructionLine(): string {
  return "أطلق على الصخور واجمع النجوم!";
}

/** ADVANCED keeps FIRE, collection, and the portal payoff in one short flow. */
export function spacePilotAdvancedInstructionLine(): string {
  return "أطلق على الصخور، واجمع النجوم، واعبر البوابة!";
}

/** Sparse lane-guidance cue (task's "occasional فوق!/تحت! may be used sparingly") — deliberately NOT wired to fire on every press; reserved for future tuning. */
export function spacePilotLaneCueLine(direction: "UP" | "DOWN"): string {
  return direction === "UP" ? "فوق!" : "تحت!";
}

/** Milestone encouragement — spoken only occasionally (every few stars, never after every single one), same deterministic cycling convention as every other game's milestone pool. */
const MILESTONE_POOL: readonly ((name: string) => string)[] = [
  (name) => `أحسنت يا ${name}!`,
  () => "رائع! صاروخك يتطور!",
  (name) => `شاطر يا ${name}!`,
];

export function spacePilotMilestoneLine(childName: string, occurrenceIndex: number): string {
  const index = ((occurrenceIndex % MILESTONE_POOL.length) + MILESTONE_POOL.length) % MILESTONE_POOL.length;
  return MILESTONE_POOL[index](childName);
}

export function allSpacePilotMilestoneLines(childName: string): string[] {
  return MILESTONE_POOL.map((build, i) => spacePilotMilestoneLine(childName, i));
}

/** Spoken once, for the FINAL (8th) star specifically — task's "the final collectible star should feel special." */
export function spacePilotFinalStarLine(childName: string): string {
  return `مذهل يا ${childName}! أنت الآن قائد فضاء حقيقي!`;
}

const STAGE_COMPLETE_TITLE_AR: Record<string, string> = {
  EASY: "رحلة النجوم",
  MEDIUM: "حزام النيازك",
  ADVANCED: "مهمة المجرة",
};

/** `difficulty` is the plain EASY/MEDIUM/ADVANCED string (lib/game's Difficulty enum's own values) — kept untyped here so this file stays free of a lib/game import, same "voice line builders are pure string functions" convention as every other line above. */
export function spacePilotStageCompleteLine(childName: string, difficulty: string = "EASY"): string {
  return `أحسنت يا ${childName}! أكملت ${STAGE_COMPLETE_TITLE_AR[difficulty] ?? STAGE_COMPLETE_TITLE_AR.EASY}!`;
}

export function spacePilotSessionCompleteLine(childName: string): string {
  return `أحسنت يا ${childName}!`;
}
