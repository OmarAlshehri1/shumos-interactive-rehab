import { Difficulty, EncounterType, StarLane, type SpaceEncounter } from "./types";

/**
 * MEDIUM's hand-designed encounter sequence (task's "Mix: star / asteroid /
 * star / asteroid / star / two-lane decision / star / asteroid / final
 * star. Do NOT random-spam objects. Every encounter should have enough
 * spacing."). Introduces FIRE alongside UP/DOWN: every asteroid can be
 * either dodged (lane change) or destroyed (FIRE) — both outcomes are
 * always harmless (task's "No punishment. No lives. No game over."), so
 * there is deliberately no unsafe pattern to avoid here. 5 stars total —
 * MEDIUM's rocket visibly upgrades through the early/mid transformation
 * tiers (bright flame, wide wings, stripe, dual exhaust, wing lights) but
 * never has to reach the full 8-star hero form; that payoff is reserved for
 * ADVANCED.
 */
export const MEDIUM_ENCOUNTER_SEQUENCE: readonly Omit<SpaceEncounter, "id" | "status">[] = [
  { index: 0, type: EncounterType.STAR, lane: StarLane.MIDDLE },
  { index: 1, type: EncounterType.ASTEROID, lane: StarLane.TOP },
  { index: 2, type: EncounterType.STAR, lane: StarLane.BOTTOM },
  { index: 3, type: EncounterType.ASTEROID, lane: StarLane.MIDDLE },
  { index: 4, type: EncounterType.STAR, lane: StarLane.TOP },
  { index: 5, type: EncounterType.ASTEROID, lane: StarLane.BOTTOM }, // the task's "two-lane decision" beat — a deliberate big lane jump away from the rocket's likely TOP position, giving the child a real dodge-or-fire choice
  { index: 6, type: EncounterType.STAR, lane: StarLane.MIDDLE },
  { index: 7, type: EncounterType.ASTEROID, lane: StarLane.TOP },
  { index: 8, type: EncounterType.STAR, lane: StarLane.BOTTOM }, // final star
];

/**
 * ADVANCED's hand-designed encounter sequence (task's "Star -> asteroid,
 * Star -> lane change, Comet/debris -> dodge, Star -> asteroid requiring
 * FIRE, Friendly alien ship crosses another lane, Star, Two-object
 * decision, Energy barrier/debris, Final star -> portal"). Exactly 8 stars
 * (same ladder EASY uses) so the final star always lands on the rocket's
 * full level-8 hero form — the task's "MOST dramatic transformation... by
 * the end the rocket should look like the HERO spacecraft." Comets/debris/
 * energy-barriers are all represented as ASTEROID encounters (same
 * dodge-or-FIRE resolution, just different set dressing at render time);
 * the one ALIEN encounter is a friendly ship that only ever needs a lane
 * change to pass — never a FIRE target (task's "FIRE should interact with
 * asteroids... rather than shooting living aliens").
 */
export const ADVANCED_ENCOUNTER_SEQUENCE: readonly Omit<SpaceEncounter, "id" | "status">[] = [
  { index: 0, type: EncounterType.STAR, lane: StarLane.MIDDLE },
  { index: 1, type: EncounterType.ASTEROID, lane: StarLane.TOP },
  { index: 2, type: EncounterType.STAR, lane: StarLane.BOTTOM },
  { index: 3, type: EncounterType.ASTEROID, lane: StarLane.MIDDLE }, // lane-change beat
  { index: 4, type: EncounterType.STAR, lane: StarLane.TOP },
  { index: 5, type: EncounterType.ASTEROID, lane: StarLane.BOTTOM }, // comet/debris dodge
  { index: 6, type: EncounterType.STAR, lane: StarLane.MIDDLE },
  { index: 7, type: EncounterType.ASTEROID, lane: StarLane.TOP }, // asteroid requiring FIRE (narrow lead-in tuned by ENCOUNTER_LEAD_MS)
  { index: 8, type: EncounterType.ALIEN, lane: StarLane.BOTTOM }, // friendly alien ship crosses
  { index: 9, type: EncounterType.STAR, lane: StarLane.TOP },
  { index: 10, type: EncounterType.STAR, lane: StarLane.MIDDLE },
  { index: 11, type: EncounterType.ASTEROID, lane: StarLane.BOTTOM }, // two-object decision beat
  { index: 12, type: EncounterType.STAR, lane: StarLane.TOP },
  { index: 13, type: EncounterType.ASTEROID, lane: StarLane.MIDDLE }, // energy barrier/debris
  { index: 14, type: EncounterType.STAR, lane: StarLane.BOTTOM }, // final star -> portal
];

const SEQUENCE_BY_DIFFICULTY: Record<Difficulty, readonly Omit<SpaceEncounter, "id" | "status">[]> = {
  [Difficulty.EASY]: [], // EASY never uses the encounter model — see SpacePilotStageRuntime's own STAR_LANE_SEQUENCE
  [Difficulty.MEDIUM]: MEDIUM_ENCOUNTER_SEQUENCE,
  [Difficulty.ADVANCED]: ADVANCED_ENCOUNTER_SEQUENCE,
};

export function encounterSequenceFor(difficulty: Difficulty): readonly Omit<SpaceEncounter, "id" | "status">[] {
  return SEQUENCE_BY_DIFFICULTY[difficulty];
}

export function totalStarsInSequence(difficulty: Difficulty): number {
  return encounterSequenceFor(difficulty).filter((e) => e.type === EncounterType.STAR).length;
}

/** Pediatric pacing per difficulty — generous throughout (task's "Do NOT make this a fast reaction game" for MEDIUM, "ONLY slightly" faster for ADVANCED). */
const TIMING_BY_DIFFICULTY: Record<Difficulty, { firstArrivalMs: number; intervalMs: number }> = {
  [Difficulty.EASY]: { firstArrivalMs: 5000, intervalMs: 7000 },
  [Difficulty.MEDIUM]: { firstArrivalMs: 5500, intervalMs: 7500 },
  [Difficulty.ADVANCED]: { firstArrivalMs: 5000, intervalMs: 6800 },
};

export function encounterArrivalOffsetMs(difficulty: Difficulty, index: number): number {
  const { firstArrivalMs, intervalMs } = TIMING_BY_DIFFICULTY[difficulty];
  return firstArrivalMs + index * intervalMs;
}

/** How long before an encounter's scheduled arrival it enters from the left edge — generous warning distance (task's "see asteroid -> understand lane -> choose"), shared by every difficulty's PlayingScene rendering. */
export const ENCOUNTER_LEAD_MS = 5200;
/** How long a resolved (avoided/passed) encounter continues drifting past the rocket before it's gone. */
export const ENCOUNTER_TAIL_MS = 1300;
