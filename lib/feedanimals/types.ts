/**
 * Feed the Animals (أطعم الحيوانات) domain types.
 *
 * MULTI-GAME PLATFORM: reuses the truly generic pieces of lib/game — GameState,
 * Difficulty, StageNumber, STAGES_PER_DIFFICULTY, the rng/stateMachine helpers
 * — same convention lib/bubblepop/types.ts and lib/footsteps/types.ts already
 * establish. Nothing from either existing wall or floor game is reused —
 * this is its own SAFARI ADVENTURE world with its own therapist controls
 * (food size / reach height / reach side / movement pattern) and its own
 * animal/food domain.
 *
 * CORE GAMEPLAY SHAPE: unlike Bubble Pop Wall (one shared field of bubbles,
 * a sequence of targets requested one at a time from within it), Feed the
 * Animals presents ROUNDS one at a time — each round is one animal asking
 * for its food, with a small set of food choices on the wall (only one of
 * which is that animal's food). This is closer in spirit to Follow the
 * Footsteps' sequential currentIndex-over-an-array shape than to Bubble Pop
 * Wall's single shared field — see FeedAnimalsStageRuntime.
 */
import { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";

export { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber };

/** The five hero animal characters (task section 8) — a manageable, polished cast, each with its own food and its own idle/happy personality (see components/display/feedanimals/animals/AnimalArt.tsx). */
export enum Animal {
  MONKEY = "MONKEY",
  RABBIT = "RABBIT",
  PANDA = "PANDA",
  ELEPHANT = "ELEPHANT",
  GIRAFFE = "GIRAFFE",
}

/** The five foods (task section 10/11) — each maps to EXACTLY one animal, which is what guarantees "exactly one unambiguous correct answer" by construction (see feedGenerator.ts). */
export enum Food {
  BANANA = "BANANA",
  CARROT = "CARROT",
  BAMBOO = "BAMBOO",
  WATERMELON = "WATERMELON",
  LEAVES = "LEAVES",
}

/** Canonical animal display/cycling order. */
export const ANIMAL_ORDER: readonly Animal[] = [Animal.MONKEY, Animal.RABBIT, Animal.PANDA, Animal.ELEPHANT, Animal.GIRAFFE];

/** Canonical food display/cycling order — same index alignment as ANIMAL_ORDER (ANIMAL_ORDER[i] eats FOOD_ORDER[i]), but ANIMAL_FOOD_MAP below is the actual source of truth. */
export const FOOD_ORDER: readonly Food[] = [Food.BANANA, Food.CARROT, Food.BAMBOO, Food.WATERMELON, Food.LEAVES];

/**
 * THE FOOD PAIR MAPPING (task section 10) — the single source of truth for
 * "which food belongs to which animal." Deliberately a total bijection
 * (every animal has exactly one food, every food belongs to exactly one
 * animal): this is what makes target validity (task section 23 — "every
 * round MUST have exactly one unambiguous correct answer") a property that
 * holds BY CONSTRUCTION rather than something that must be separately
 * verified — any set of choices built from distinct Food values can never
 * contain two different foods that are both "correct" for the same animal.
 */
export const ANIMAL_FOOD_MAP: Record<Animal, Food> = {
  [Animal.MONKEY]: Food.BANANA,
  [Animal.RABBIT]: Food.CARROT,
  [Animal.PANDA]: Food.BAMBOO,
  [Animal.ELEPHANT]: Food.WATERMELON,
  [Animal.GIRAFFE]: Food.LEAVES,
};

/** Therapist-facing food target size preference (task section 14/11). */
export enum FoodSize {
  LARGE = "LARGE",
  MEDIUM = "MEDIUM",
  SMALL = "SMALL",
}

/** Therapist-facing vertical band of the wall food choices may occupy — same role as Bubble Pop Wall's ReachHeight, this game's own copy per the "each game owns its own domain types" convention. */
export enum ReachHeight {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  FULL = "FULL",
}

/** Therapist-facing horizontal band of the wall food choices may occupy. */
export enum ReachSide {
  LEFT = "LEFT",
  RIGHT = "RIGHT",
  FULL = "FULL",
}

/**
 * Therapist-facing spatial layout style (task section 15) — CENTRAL keeps
 * choices close to the wall's safe center; VARIED distributes them across
 * the configured reach zone; CROSS intentionally places the correct food on
 * the opposite horizontal half from the animal, encouraging a broader
 * reach — never called "cross-midline therapy" in any user-facing string,
 * per the task's explicit instruction; it is presented only as a layout
 * option.
 */
export enum MovementPattern {
  CENTRAL = "CENTRAL",
  VARIED = "VARIED",
  CROSS = "CROSS",
}

/** Position normalized to [0, 1] on each axis — same WALL convention as Bubble Pop Wall's NormalizedPosition (x=0 left edge, y=0 TOP edge). */
export interface NormalizedPosition {
  x: number;
  y: number;
}

/** One selectable food target on the wall, within a single round. */
export interface FoodChoice {
  id: string;
  food: Food;
  position: NormalizedPosition;
  /** Diameter, normalized as a fraction of the wall's shorter side. */
  size: number;
}

/**
 * One round: a single animal requesting its own food, plus every food
 * choice on the wall for that round (task section 12). `correctFood` is
 * always `ANIMAL_FOOD_MAP[animal]` — carried explicitly so scoring never
 * has to re-derive it. `fed` flips true once the therapist confirms the
 * correct choice (this round's equivalent of Bubble Pop Wall's
 * `bubble.isPopped`).
 */
export interface FeedRound {
  id: string;
  animal: Animal;
  correctFood: Food;
  /** The animal's own wall position for this round — deterministic, varies by MovementPattern (task section 9's "animal appears slightly left / food target appears right" example). */
  animalPosition: NormalizedPosition;
  choices: FoodChoice[];
  fed: boolean;
}

/** Therapist-configured settings for a session, entered on /control/feed-the-animals. */
export interface FeedAnimalsSessionConfig {
  childFirstName: string;
  difficulty: Difficulty;
  foodSize: FoodSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  movementPattern: MovementPattern;
  /** Which stage of `difficulty` this session actually begins at — same manual therapist choice as the other three games' startingStage. */
  startingStage: StageNumber;
}

/** A stage's outcome, in the therapist's own neutral language — same COMPLETED/SKIPPED semantics as every other game, never a judgment about the child. */
export enum FeedAnimalsStageStatus {
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
}

/**
 * Outcome of a single stage. Tracks both completion (roundsCompleted /
 * roundsPresented — "how many animals got fed") AND accuracy (correct /
 * (correct + incorrect) — "how many food choices landed right"), same dual
 * framing as Bubble Pop Wall's BubblePopStageResult, since this game
 * genuinely has both an honest completion story and a real incorrect-tap
 * count. `durationMs`/`averageResponseTimeMs` are null for a stage jumped
 * OVER and never actually entered — never 0, which would misleadingly read
 * as "instant."
 */
export interface FeedAnimalsStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: FeedAnimalsStageStatus;
  roundsPresented: number;
  roundsCompleted: number;
  incorrectCount: number;
  durationMs: number | null;
  /** متوسط زمن الاستجابة المسجل — interaction timing (round announced -> therapist confirmation), paused time excluded. Never a clinical reaction-time diagnosis. */
  averageResponseTimeMs: number | null;
}

/** Aggregate outcome of a full session — same shape philosophy as the other three games' summaries. */
export interface FeedAnimalsSessionSummary {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  /** Every difficulty with at least one played stage, in canonical EASY -> MEDIUM -> ADVANCED order. */
  difficultiesPlayed: Difficulty[];
  stageResults: FeedAnimalsStageResult[];
  totalRoundsPresented: number;
  /** "ساعدت N حيوان" (task section 50) — every completed round is one animal successfully fed. */
  totalRoundsCompleted: number;
  totalIncorrect: number;
  /** totalRoundsCompleted / totalRoundsPresented — null when nothing was presented. */
  completionRate: number | null;
  /** totalRoundsCompleted / (totalRoundsCompleted + totalIncorrect) — null when nothing was attempted. */
  accuracy: number | null;
  totalDurationMs: number;
  averageResponseTimeMs: number | null;
  /** The completed stage with the highest completion rate; ties broken by higher accuracy, then by lower average response time. */
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  completedAt: string;
}
