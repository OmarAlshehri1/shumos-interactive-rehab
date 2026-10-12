import { Difficulty } from "@/lib/game";
export const GAME_ID = "balance-bridge-3d" as const;
export const STAGES = [
  {
    name: "Sunny Wooden Bridge",
    ar: "الجسر الخشبي المشمس",
    objective: "امشِ إلى العلامة المضيئة",
    kind: "wood",
    points: [0, 0, 0, 0, 0],
    hold: [],
  },
  {
    name: "Flower Garden",
    ar: "حديقة الزهور",
    objective: "امشِ ثم توقّف عند الزهرة",
    kind: "garden",
    points: [0, -0.5, -0.5, 0.5, 0.5, 0],
    hold: [2, 4],
  },
  {
    name: "Golden Beach",
    ar: "الشاطئ الذهبي",
    objective: "اتبع الأسهم وانعطف بهدوء",
    kind: "beach",
    points: [0, -1.1, -1.1, 1.1, 1.1, 0],
    hold: [],
  },
  {
    name: "Frozen Lake",
    ar: "البحيرة المتجمّدة",
    objective: "اتبع علامات القدمين بالتناوب",
    kind: "ice",
    points: [0, -0.5, 0.5, -0.5, 0.5, 0],
    hold: [3],
  },
  {
    name: "Butterfly Forest",
    ar: "غابة الفراشات",
    objective: "اتبع المنعطفات وتوقّف عند الضوء",
    kind: "forest",
    points: [0, -1.3, -0.7, 1.3, 0.7, -0.5, 0],
    hold: [2, 5],
  },
  {
    name: "Crystal Valley",
    ar: "وادي البلّور",
    objective: "ضع قدميك عند العلامات المضيئة",
    kind: "crystal",
    points: [0, -0.8, 0.5, 1, -0.8, 0.5, 0],
    hold: [2, 4],
  },
  {
    name: "Cloud Garden",
    ar: "حديقة السحاب",
    objective: "اتبع الطريق المضيء بين الحدائق",
    kind: "cloud",
    points: [0, -1.4, -1.4, 0, 1.4, 1.4, 0],
    hold: [3],
  },
  {
    name: "Luminous Night Garden",
    ar: "حديقة الليل المضيئة",
    objective: "امشِ، توقّف، ثم تابع الضوء",
    kind: "night",
    points: [0, 0.9, -0.9, -0.9, 0.9, 0.9, 0],
    hold: [1, 3, 5],
  },
  {
    name: "The Magical Castle Bridge",
    ar: "جسر القلعة السحرية",
    objective: "اتبع العلامات حتى بوابة القلعة",
    kind: "castle",
    points: [0, -0.9, -0.9, 0.9, 0.9, -0.5, 0],
    hold: [2, 5],
  },
] as const;
export type Mode = "MANUAL" | "RIGHT_FOOT" | "LEFT_FOOT" | "DUAL_FOOT";
export type Guidance =
  "either" | "right" | "left" | "alternating" | "both" | "neutral";
export interface Config {
  projection: "FLOOR";
  mode: Mode;
  pathWidth: "wide" | "standard" | "narrower" | "custom";
  customWidthCm: number;
  measuredWidthCm: number | null;
  measuredHeightCm: number | null;
  rotation: 0 | 90 | 180 | 270;
  margin: number;
  difficulty: "gentle" | "guided" | "precise";
  routeChoice: "left" | "right";
  guidance: Guidance;
  holdSeconds: number;
  reduced: boolean;
  quality: "low" | "high";
  audio: boolean;
}
export const DEFAULT_CONFIG: Config = {
  projection: "FLOOR",
  mode: "MANUAL",
  pathWidth: "wide",
  customWidthCm: 70,
  measuredWidthCm: null,
  measuredHeightCm: null,
  rotation: 0,
  margin: 0.08,
  difficulty: "gentle",
  routeChoice: "left",
  guidance: "either",
  holdSeconds: 0,
  reduced: false,
  quality: "high",
  audio: true,
};
const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
export function sanitizeConfig(c: Partial<Config>): Config {
  const n = { ...DEFAULT_CONFIG, ...c };
  const dimension = (v: number | null) =>
    v === null ? null : clamp(v, 50, 2000);
  return {
    projection: "FLOOR",
    mode: ["MANUAL", "RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"].includes(n.mode)
      ? n.mode
      : "MANUAL",
    pathWidth: ["wide", "standard", "narrower", "custom"].includes(n.pathWidth)
      ? n.pathWidth
      : "wide",
    customWidthCm: clamp(n.customWidthCm, 30, 200),
    measuredWidthCm: dimension(n.measuredWidthCm),
    measuredHeightCm: dimension(n.measuredHeightCm),
    rotation: [0, 90, 180, 270].includes(n.rotation) ? n.rotation : 0,
    margin: clamp(n.margin, 0.03, 0.2),
    difficulty: ["gentle", "guided", "precise"].includes(n.difficulty)
      ? n.difficulty
      : "gentle",
    routeChoice: n.routeChoice === "right" ? "right" : "left",
    guidance: [
      "either",
      "right",
      "left",
      "alternating",
      "both",
      "neutral",
    ].includes(n.guidance)
      ? n.guidance
      : "either",
    holdSeconds: Math.round(clamp(n.holdSeconds, 0, 15)),
    reduced: !!n.reduced,
    quality: n.quality === "low" ? "low" : "high",
    audio: !!n.audio,
  };
}
/** Only measured dimensions permit cm labels. Width is a fraction of the complete projected field. */
export function calibratedFieldWidth(c: Config): number | null {
  if (!c.measuredWidthCm || !c.measuredHeightCm) return null;
  // Shared PlayStage letterboxes at 16:9; the orthographic scene fits 14:8 inside it.
  const stageWidth = Math.min(c.measuredWidthCm, (c.measuredHeightCm * 16) / 9);
  const stageHeight = Math.min(
    c.measuredHeightCm,
    (c.measuredWidthCm * 9) / 16,
  );
  const rotated = c.rotation === 90 || c.rotation === 270;
  return Math.min(
    rotated ? stageHeight : stageWidth,
    ((rotated ? stageWidth : stageHeight) * 14) / 8,
  );
}
export function widthFraction(c: Config) {
  const cm =
    c.pathWidth === "custom"
      ? c.customWidthCm
      : { wide: 100, standard: 80, narrower: 60 }[c.pathWidth];
  const measured = calibratedFieldWidth(c);
  return clamp(
    measured
      ? cm / measured
      : { wide: 0.17, standard: 0.14, narrower: 0.11, custom: 0.17 }[
          c.pathWidth
        ],
    0.07,
    0.28,
  );
}
export const difficultyOf = (i: number) =>
  i < 3 ? Difficulty.EASY : i < 6 ? Difficulty.MEDIUM : Difficulty.ADVANCED;
export interface Checkpoint {
  id: number;
  outcome: "pending" | "confirmed" | "assisted" | "skipped";
  attempts: number;
  holdCompleted: boolean;
}
export interface StageResult {
  stage: number;
  config: Config;
  checkpoints: Checkpoint[];
  deviations: number;
  repeats: number;
  elapsed: number;
  completed: boolean;
}
export interface State {
  sessionId: string;
  run: number;
  epoch: number;
  stage: number;
  startingStage: number;
  status: "ready" | "running" | "paused" | "stage-complete" | "ended";
  config: Config;
  checkpoints: Checkpoint[];
  active: number;
  deviations: number;
  repeats: number;
  feedback: number;
  instructions: number;
  holdElapsed: number;
  holding: boolean;
  countdown: number;
  elapsed: number;
  stageElapsed: number;
  startedAt: number;
  endedAt: number;
  lastTick: number;
  results: StageResult[];
}
const checkpoints = (stage: number): Checkpoint[] =>
  STAGES[stage].points.map((_, id) => ({
    id,
    outcome: "pending",
    attempts: 0,
    holdCompleted: false,
  }));
export function createState(sessionId: string): State {
  return {
    sessionId,
    run: 0,
    epoch: 0,
    stage: 0,
    startingStage: 0,
    status: "ready",
    config: { ...DEFAULT_CONFIG },
    checkpoints: checkpoints(0),
    active: 0,
    deviations: 0,
    repeats: 0,
    feedback: 0,
    instructions: 0,
    holdElapsed: 0,
    holding: false,
    countdown: 3000,
    elapsed: 0,
    stageElapsed: 0,
    startedAt: 0,
    endedAt: 0,
    lastTick: 0,
    results: [],
  };
}
export const progress = (s: State) =>
  Math.round(
    (s.checkpoints.filter((c) => c.outcome !== "pending").length /
      s.checkpoints.length) *
      100,
  );
export const tokenFor = (s: State) =>
  `${s.run}:${s.epoch}:${s.stage}:${s.active}`;
export const requiresHold = (s: State) =>
  s.config.holdSeconds > 0 &&
  (STAGES[s.stage].hold as readonly number[]).includes(s.active);
export const canConfirm = (s: State) =>
  s.status === "running" &&
  s.countdown === 0 &&
  (!requiresHold(s) ||
    (s.holding && s.holdElapsed >= s.config.holdSeconds * 1000));
export function routePoint(
  stage: number,
  index: number,
  choice: "left" | "right" = "left",
) {
  const points = STAGES[stage].points;
  return {
    x: points[index] * (stage === 6 && choice === "right" ? -1 : 1),
    z: 2.65 - (index * 5.3) / (points.length - 1),
  };
}
export type Command =
  | {
      type:
        | "start"
        | "pause"
        | "resume"
        | "restart"
        | "next"
        | "repeat"
        | "deviation"
        | "instructions"
        | "begin-hold";
    }
  | { type: "end" | "tick"; at: number }
  | { type: "stage"; stage: number }
  | { type: "config"; patch: Partial<Config> }
  | { type: "confirm"; token: string; assisted: boolean }
  | { type: "skip"; token: string };
const archive = (s: State): State => ({
  ...s,
  results: [
    ...s.results.filter((r) => r.stage !== s.stage),
    {
      stage: s.stage,
      config: { ...s.config },
      checkpoints: s.checkpoints.map((c) => ({ ...c })),
      deviations: s.deviations,
      repeats: s.repeats,
      elapsed: s.stageElapsed,
      completed: s.checkpoints.every(
        (c) => c.outcome === "confirmed" || c.outcome === "assisted",
      ),
    },
  ].sort((a, b) => a.stage - b.stage),
});
const fresh = (s: State, stage: number): State => ({
  ...s,
  stage,
  status: "ready",
  epoch: s.epoch + 1,
  checkpoints: checkpoints(stage),
  active: 0,
  deviations: 0,
  repeats: 0,
  holdElapsed: 0,
  holding: false,
  countdown: 3000,
  stageElapsed: 0,
  lastTick: 0,
});
export function reduce(s: State, c: Command): State {
  if (c.type === "restart")
    return {
      ...createState(s.sessionId),
      run: s.run + 1,
      epoch: s.epoch + 1,
      config: s.config,
      stage: s.startingStage,
      startingStage: s.startingStage,
      checkpoints: checkpoints(s.startingStage),
    };
  if (s.status === "ended") return s;
  switch (c.type) {
    case "start":
      return s.status === "ready"
        ? {
            ...s,
            status: "running",
            startedAt: s.startedAt || Date.now(),
            lastTick: 0,
          }
        : s;
    case "pause":
      return s.status === "running"
        ? { ...s, status: "paused", lastTick: 0 }
        : s;
    case "resume":
      return s.status === "paused"
        ? { ...s, status: "running", lastTick: 0 }
        : s;
    case "tick": {
      if (s.status !== "running" || !Number.isFinite(c.at) || c.at < s.lastTick)
        return s;
      const dt = s.lastTick ? clamp(c.at - s.lastTick, 0, 250) : 0;
      if (s.countdown > 0)
        return {
          ...s,
          countdown: Math.max(0, s.countdown - dt),
          lastTick: c.at,
        };
      return {
        ...s,
        elapsed: s.elapsed + dt,
        stageElapsed: s.stageElapsed + dt,
        holdElapsed:
          requiresHold(s) && s.holding
            ? Math.min(s.config.holdSeconds * 1000, s.holdElapsed + dt)
            : 0,
        lastTick: c.at,
      };
    }
    case "end":
      return Number.isFinite(c.at)
        ? {
            ...archive(s),
            status: "ended",
            startedAt: s.startedAt || c.at,
            endedAt: Math.max(c.at, s.startedAt),
            lastTick: 0,
          }
        : s;
    case "config":
      return s.status === "ready"
        ? fresh(
            { ...s, config: sanitizeConfig({ ...s.config, ...c.patch }) },
            s.stage,
          )
        : s;
    case "stage":
      return ["ready", "paused", "stage-complete"].includes(s.status) &&
        Number.isInteger(c.stage) &&
        c.stage >= 0 &&
        c.stage < 9
        ? fresh(
            {
              ...s,
              ...(s.startedAt ? archive(s) : {}),
              startingStage: s.startedAt ? s.startingStage : c.stage,
            },
            c.stage,
          )
        : s;
    case "next":
      return s.status === "stage-complete" && s.stage < 8
        ? fresh(archive(s), s.stage + 1)
        : s;
    case "begin-hold":
      return s.status === "running" &&
        s.countdown === 0 &&
        requiresHold(s) &&
        !s.holding
        ? { ...s, holding: true, holdElapsed: 0, epoch: s.epoch + 1 }
        : s;
    case "instructions":
      return { ...s, instructions: s.instructions + 1 };
    case "deviation":
      return s.status === "running"
        ? {
            ...s,
            deviations: s.deviations + 1,
            feedback: s.feedback + 1,
            holdElapsed: 0,
            holding: false,
            epoch: s.epoch + 1,
          }
        : s;
    case "repeat":
      return s.status === "running"
        ? {
            ...s,
            epoch: s.epoch + 1,
            repeats: s.repeats + 1,
            holdElapsed: 0,
            holding: false,
            checkpoints: s.checkpoints.map((p) =>
              p.id === s.active ? { ...p, attempts: p.attempts + 1 } : p,
            ),
          }
        : s;
    case "skip":
    case "confirm": {
      if (
        s.status !== "running" ||
        s.countdown > 0 ||
        c.token !== tokenFor(s) ||
        (c.type === "confirm" && !canConfirm(s))
      )
        return s;
      const next = {
        ...s,
        epoch: s.epoch + 1,
        holdElapsed: 0,
        holding: false,
        checkpoints: s.checkpoints.map((p) =>
          p.id === s.active
            ? {
                ...p,
                outcome:
                  c.type === "skip"
                    ? ("skipped" as const)
                    : c.assisted
                      ? ("assisted" as const)
                      : ("confirmed" as const),
                attempts: p.attempts + 1,
                holdCompleted: c.type === "confirm" && requiresHold(s),
              }
            : p,
        ),
      };
      const active = next.checkpoints.find((p) => p.outcome === "pending")?.id;
      return active === undefined
        ? archive({ ...next, status: "stage-complete" })
        : { ...next, active };
    }
  }
}
