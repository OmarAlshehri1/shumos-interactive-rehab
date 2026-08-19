import { BubbleColor, BubbleShape, Difficulty, type StageNumber } from "./types";

/** Canonical 6-color palette — Easy's stagePlans name their own 2-3 colors explicitly (Blue/Yellow/Pink); Medium/Advanced slice or pick from this fixed order instead, so "4 colors" or "6 colors" always means the same thing across stages. */
export const BUBBLE_COLOR_ORDER: readonly BubbleColor[] = [
  BubbleColor.RED,
  BubbleColor.BLUE,
  BubbleColor.YELLOW,
  BubbleColor.GREEN,
  BubbleColor.PURPLE,
  BubbleColor.ORANGE,
];

/** Shapes available to a color+shape mission (Advanced 2/4/5) — DIAMOND included per task's supported-shapes list. */
export const BUBBLE_SHAPE_STATION_ORDER: readonly BubbleShape[] = [
  BubbleShape.STAR,
  BubbleShape.HEART,
  BubbleShape.CIRCLE,
  BubbleShape.TRIANGLE,
  BubbleShape.DIAMOND,
];

/**
 * How a stage's mission sequence assigns direction to each successive
 * mission bubble (task section 5, extended for Phase 2's Medium "moving
 * ocean" stages).
 */
export enum BubbleMovementMode {
  RIGHT_TO_LEFT = "RIGHT_TO_LEFT",
  LEFT_TO_RIGHT = "LEFT_TO_RIGHT",
  /** Flips RIGHT_TO_LEFT / LEFT_TO_RIGHT with every successive mission, starting RIGHT_TO_LEFT. */
  ALTERNATING = "ALTERNATING",
  /**
   * TWO simultaneous currents (task section "Part F" Medium 2+): even lane
   * indices always flow RIGHT_TO_LEFT, odd lane indices always flow
   * LEFT_TO_RIGHT — direction is a property of the LANE, not the mission
   * index, so "upper current" and "lower current" each stay visually
   * consistent stage-long, unlike ALTERNATING which flips per mission
   * regardless of lane.
   */
  DUAL_CURRENT = "DUAL_CURRENT",
}

/** Coarse pace tiers — task section 5's "smooth, calm, easy to visually track... no frantic speed." Mapped to an edge-to-edge crossing duration in bubbleGenerator.ts; never shortened by difficulty (task section 15's "advanced does NOT mean faster" philosophy carries over unchanged). */
export enum BubbleSpeedTier {
  VERY_SLOW = "VERY_SLOW",
  SLOW = "SLOW",
  CALM = "CALM",
}

/** Whether a mission is identified by color alone, or by color + shape together (task's Advanced 2 "اللون والشكل"). */
export enum BubbleMissionMode {
  COLOR = "COLOR",
  COLOR_AND_SHAPE = "COLOR_AND_SHAPE",
}

/** The chest's reward currency — a pearl per correct pop (Medium 5) or a golden key (Advanced 5) — purely a visual skin on the SAME progress mechanic, never a second economy. */
export enum BubbleTreasureMode {
  NONE = "NONE",
  PEARLS = "PEARLS",
  KEYS = "KEYS",
}

/** Density/roster of decorative sea life this stage's ocean renders — purely presentational, never gameplay-scored (task Part D: "sea life is decorative... no score, no penalty"). */
export interface BubbleSeaLifeConfig {
  fish: "NONE" | "FEW" | "SCHOOL";
  jellyfish: boolean;
  turtle: boolean;
  seahorse: boolean;
}

/** Legacy boolean summary of BubbleSeaLifeConfig/treasureMode — kept so Phase 1 call sites (`plan.features.treasure` in session.ts/BubblePopPlayingScene) keep working unchanged; always DERIVED, never a second source of truth (see deriveFeatures below). */
export interface BubbleStageFeatures {
  fish: boolean;
  turtle: boolean;
  treasure: boolean;
}

/**
 * SINGLE SOURCE OF TRUTH (task section 14) for one stage's experience — the
 * exact same plan drives the real gameplay generator (bubbleGenerator.ts),
 * the therapist's Stage Card preview, and the Ready screen preview. Nothing
 * about a stage's identity is declared twice.
 */
export interface BubbleStagePlan {
  stageNumber: StageNumber;
  titleAr: string;
  descriptionAr: string;
  /** Fixed station color palette. For a COLOR_AND_SHAPE mission this is the palette candidate TOKENS are drawn from, not the literal station set — see `stationCount`/StationToken. */
  stations: readonly BubbleColor[];
  /** How many stations/candidate pearls are actually shown at once — equals `stations.length` for a plain color stage; 4-6 for a color+shape stage (task's "4-6 candidate shell stations"). */
  stationCount: number;
  /** How many missions (one moving bubble each) make up this stage. For `sequenceLength === 2`, this is the number of individual bubbles — always even, grouped into missionCount/2 two-step sequences. */
  missionCount: number;
  movementMode: BubbleMovementMode;
  /** How many safe vertical lanes mission bubbles may travel along (task section 5's "2-3 safe vertical bubble lanes"). */
  laneCount: 1 | 2 | 3;
  speed: BubbleSpeedTier;
  /** Bubble diameter, normalized to the wall's shorter side. */
  baseSize: number;
  missionMode: BubbleMissionMode;
  /** Advanced 4/5 — alternates COLOR / COLOR_AND_SHAPE mission-to-mission instead of using `missionMode` uniformly for the whole stage. */
  mixedMode: boolean;
  allowedShapes: readonly BubbleShape[];
  /** 1 = normal single-step missions. 2 = missions are grouped into consecutive PAIRS presented/spoken together (task's "المهمة المزدوجة" two-step sequence) — see bubbleGenerator.ts and MissionPrompt's sequence rendering. */
  sequenceLength: 1 | 2;
  seaLife: BubbleSeaLifeConfig;
  treasureMode: BubbleTreasureMode;
  /** Derived summary — see BubbleStageFeatures' doc comment. */
  features: BubbleStageFeatures;
}

const NO_SEA_LIFE: BubbleSeaLifeConfig = { fish: "NONE", jellyfish: false, turtle: false, seahorse: false };

function deriveFeatures(seaLife: BubbleSeaLifeConfig, treasureMode: BubbleTreasureMode): BubbleStageFeatures {
  return { fish: seaLife.fish !== "NONE", turtle: seaLife.turtle, treasure: treasureMode !== BubbleTreasureMode.NONE };
}

/** Fills in every Phase 2 field with its "plain Easy-style stage" default, so each stage plan below only states what's actually different about it — task Part H's "define only what is needed." */
function stagePlan(
  partial: Pick<BubbleStagePlan, "stageNumber" | "titleAr" | "descriptionAr" | "stations" | "missionCount" | "movementMode" | "laneCount" | "speed" | "baseSize"> &
    Partial<BubbleStagePlan>,
): BubbleStagePlan {
  const seaLife = partial.seaLife ?? NO_SEA_LIFE;
  const treasureMode = partial.treasureMode ?? BubbleTreasureMode.NONE;
  return {
    stationCount: partial.stations.length,
    missionMode: BubbleMissionMode.COLOR,
    mixedMode: false,
    allowedShapes: [],
    sequenceLength: 1,
    seaLife,
    treasureMode,
    features: deriveFeatures(seaLife, treasureMode),
    ...partial,
  };
}

/**
 * EASY 1-5 (task Part E — "preserve, do not redesign again"): unchanged from
 * Phase 1's approved plans.
 */
export const BUBBLE_POP_EASY_STAGE_PLANS: Record<StageNumber, BubbleStagePlan> = {
  1: stagePlan({
    stageNumber: 1,
    titleAr: "أول الفقاعات",
    descriptionAr: "تعلّم اللعبة: فقاعة واحدة هادئة تعبر الجدار ببطء",
    stations: [BubbleColor.BLUE, BubbleColor.YELLOW],
    missionCount: 4,
    movementMode: BubbleMovementMode.RIGHT_TO_LEFT,
    laneCount: 1,
    speed: BubbleSpeedTier.VERY_SLOW,
    baseSize: 0.2,
  }),
  2: stagePlan({
    stageNumber: 2,
    titleAr: "التيار المعاكس",
    descriptionAr: "لون ثالث ينضم، والتيار يعبر الجدار من الجهة الأخرى",
    stations: [BubbleColor.BLUE, BubbleColor.YELLOW, BubbleColor.PINK],
    missionCount: 5,
    movementMode: BubbleMovementMode.LEFT_TO_RIGHT,
    laneCount: 1,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.19,
  }),
  3: stagePlan({
    stageNumber: 3,
    titleAr: "تيارات البحر",
    descriptionAr: "التيار يتبادل اتجاهه بين فقاعة وأخرى عبر عدة مسارات",
    stations: [BubbleColor.BLUE, BubbleColor.YELLOW, BubbleColor.PINK],
    missionCount: 6,
    movementMode: BubbleMovementMode.ALTERNATING,
    laneCount: 3,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.18,
  }),
  4: stagePlan({
    stageNumber: 4,
    titleAr: "أصدقاء البحر",
    descriptionAr: "نفس تيارات البحر المتبادلة، وأسماك ودودة تسبح معك",
    stations: [BubbleColor.BLUE, BubbleColor.YELLOW, BubbleColor.PINK],
    missionCount: 7,
    movementMode: BubbleMovementMode.ALTERNATING,
    laneCount: 3,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.175,
    seaLife: { fish: "FEW", jellyfish: false, turtle: false, seahorse: false },
  }),
  5: stagePlan({
    stageNumber: 5,
    titleAr: "الكنز الصغير",
    descriptionAr: "كل فقاعة صحيحة تضيء صندوق الكنز حتى ينفتح في النهاية",
    stations: [BubbleColor.BLUE, BubbleColor.YELLOW, BubbleColor.PINK],
    missionCount: 8,
    movementMode: BubbleMovementMode.ALTERNATING,
    laneCount: 3,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.17,
    seaLife: { fish: "FEW", jellyfish: false, turtle: true, seahorse: false },
    treasureMode: BubbleTreasureMode.PEARLS,
  }),
};

export function getEasyBubbleStagePlan(stageNumber: StageNumber): BubbleStagePlan {
  return BUBBLE_POP_EASY_STAGE_PLANS[stageNumber];
}

const MEDIUM_COLORS = BUBBLE_COLOR_ORDER.slice(0, 4);

/**
 * MEDIUM 1-5 (task Part F — "the ocean itself becomes more alive, no speed
 * pressure"): 4 fixed color stations throughout; what changes stage to stage
 * is the ocean's own liveliness — a single stream, then dual opposing
 * currents, a fish school, a jellyfish gate, and finally a pearl-driven
 * treasure journey.
 */
export const BUBBLE_POP_MEDIUM_STAGE_PLANS: Record<StageNumber, BubbleStagePlan> = {
  1: stagePlan({
    stageNumber: 1,
    titleAr: "تيار الفقاعات",
    descriptionAr: "تيار طويل هادئ يعبر الجدار من اليمين لليسار",
    stations: MEDIUM_COLORS,
    missionCount: 7,
    movementMode: BubbleMovementMode.RIGHT_TO_LEFT,
    laneCount: 2,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.155,
  }),
  2: stagePlan({
    stageNumber: 2,
    titleAr: "تياران",
    descriptionAr: "تيار علوي يمين-يسار، وتيار سفلي يسار-يمين، في آن واحد",
    stations: MEDIUM_COLORS,
    missionCount: 8,
    movementMode: BubbleMovementMode.DUAL_CURRENT,
    laneCount: 2,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.15,
  }),
  3: stagePlan({
    stageNumber: 3,
    titleAr: "سرب الأسماك",
    descriptionAr: "نفس التيارين، وسرب أسماك حقيقي يسبح عبر الجدار",
    stations: MEDIUM_COLORS,
    missionCount: 8,
    movementMode: BubbleMovementMode.DUAL_CURRENT,
    laneCount: 2,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.15,
    seaLife: { fish: "SCHOOL", jellyfish: false, turtle: false, seahorse: false },
  }),
  4: stagePlan({
    stageNumber: 4,
    titleAr: "بوابة القنديل",
    descriptionAr: "قنديل بحر كبير وودود يعبر ببطء وسط التيارات",
    stations: MEDIUM_COLORS,
    missionCount: 8,
    movementMode: BubbleMovementMode.DUAL_CURRENT,
    laneCount: 2,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.145,
    seaLife: { fish: "FEW", jellyfish: true, turtle: false, seahorse: false },
  }),
  5: stagePlan({
    stageNumber: 5,
    titleAr: "رحلة الكنز",
    descriptionAr: "كل إجابة صحيحة تكسب لؤلؤة، حتى يفتح صندوق الكنز",
    stations: MEDIUM_COLORS,
    missionCount: 10,
    movementMode: BubbleMovementMode.DUAL_CURRENT,
    laneCount: 2,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.14,
    seaLife: { fish: "FEW", jellyfish: false, turtle: true, seahorse: false },
    treasureMode: BubbleTreasureMode.PEARLS,
  }),
};

export function getMediumBubbleStagePlan(stageNumber: StageNumber): BubbleStagePlan {
  return BUBBLE_POP_MEDIUM_STAGE_PLANS[stageNumber];
}

const ADVANCED_SIX_COLORS = BUBBLE_COLOR_ORDER;
const ADVANCED_FOUR_COLORS = BUBBLE_COLOR_ORDER.slice(0, 4);
const ADVANCED_SHAPES = BUBBLE_SHAPE_STATION_ORDER;

/**
 * ADVANCED 1-5 (task Part G — "mission complexity, NOT frantic speed"): up
 * to 6 candidate stations, color+shape recognition, two-step sequences, and
 * a rich, busy-but-never-confusing ocean, ending in the showcase "great
 * treasure" key stage.
 */
export const BUBBLE_POP_ADVANCED_STAGE_PLANS: Record<StageNumber, BubbleStagePlan> = {
  1: stagePlan({
    stageNumber: 1,
    titleAr: "تيار الألوان",
    descriptionAr: "ستة ألوان، وفقاعات تتحرك من الجهتين",
    stations: ADVANCED_SIX_COLORS,
    missionCount: 9,
    movementMode: BubbleMovementMode.ALTERNATING,
    laneCount: 3,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.135,
  }),
  2: stagePlan({
    stageNumber: 2,
    titleAr: "اللون والشكل",
    descriptionAr: "كل مهمة الآن لون وشكل معًا — لؤلؤة واحدة صحيحة بين عدة مرشحات",
    stations: ADVANCED_FOUR_COLORS,
    stationCount: 5,
    missionCount: 6,
    movementMode: BubbleMovementMode.ALTERNATING,
    laneCount: 2,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.135,
    missionMode: BubbleMissionMode.COLOR_AND_SHAPE,
    allowedShapes: ADVANCED_SHAPES,
  }),
  3: stagePlan({
    stageNumber: 3,
    titleAr: "المهمة المزدوجة",
    descriptionAr: "مهمتان متتاليتان في كل جولة — أزرق، ثم أصفر",
    stations: ADVANCED_FOUR_COLORS,
    missionCount: 6,
    movementMode: BubbleMovementMode.ALTERNATING,
    laneCount: 2,
    speed: BubbleSpeedTier.SLOW,
    baseSize: 0.14,
    sequenceLength: 2,
  }),
  4: stagePlan({
    stageNumber: 4,
    titleAr: "مغامرة المحيط",
    descriptionAr: "محيط غني بالحياة البحرية، ومهمات لون وشكل متبادلة",
    stations: ADVANCED_SIX_COLORS,
    stationCount: 6,
    missionCount: 8,
    movementMode: BubbleMovementMode.DUAL_CURRENT,
    laneCount: 3,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.13,
    missionMode: BubbleMissionMode.COLOR,
    mixedMode: true,
    allowedShapes: ADVANCED_SHAPES,
    seaLife: { fish: "SCHOOL", jellyfish: true, turtle: true, seahorse: true },
  }),
  5: stagePlan({
    stageNumber: 5,
    titleAr: "الكنز الكبير",
    descriptionAr: "المرحلة الختامية — كل مهمة صحيحة تكسب مفتاحًا ذهبيًا نحو صندوق الكنز الكبير",
    stations: ADVANCED_SIX_COLORS,
    stationCount: 6,
    missionCount: 10,
    movementMode: BubbleMovementMode.DUAL_CURRENT,
    laneCount: 3,
    speed: BubbleSpeedTier.CALM,
    baseSize: 0.13,
    missionMode: BubbleMissionMode.COLOR,
    mixedMode: true,
    allowedShapes: ADVANCED_SHAPES,
    seaLife: { fish: "SCHOOL", jellyfish: true, turtle: true, seahorse: true },
    treasureMode: BubbleTreasureMode.KEYS,
  }),
};

export function getAdvancedBubbleStagePlan(stageNumber: StageNumber): BubbleStagePlan {
  return BUBBLE_POP_ADVANCED_STAGE_PLANS[stageNumber];
}

/** Resolves the single source of truth for a (difficulty, stage) pair (task Part H). */
export function getBubbleStagePlan(difficulty: Difficulty, stageNumber: StageNumber): BubbleStagePlan {
  if (difficulty === Difficulty.EASY) return getEasyBubbleStagePlan(stageNumber);
  if (difficulty === Difficulty.MEDIUM) return getMediumBubbleStagePlan(stageNumber);
  return getAdvancedBubbleStagePlan(stageNumber);
}
