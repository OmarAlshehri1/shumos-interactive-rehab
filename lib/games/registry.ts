/**
 * GAME LIBRARY — the typed source of truth for which rehabilitation
 * activities /control's home screen (the "مكتبة الأنشطة" library) offers.
 *
 * Deliberately just a small typed array, not a plugin framework: adding a
 * future game means (1) a new entry here, (2) a thumbnail component
 * registered in components/control/library/gameThumbnails.tsx, and (3) a
 * new static route folder under app/control/<id>/page.tsx that renders
 * that game's own setup/controller experience — see Balloon Quest's
 * app/control/balloon-quest/page.tsx for the pattern to copy. Nothing here
 * knows how a game actually plays; this is metadata + a routing address
 * only, kept intentionally decoupled from any one game's engine.
 *
 * `route` is a plain static path rather than a `[gameId]` dynamic segment —
 * with routes this explicit and this few, a dynamic segment would only add
 * indirection (see the Task's "no complicated dynamic routing unless
 * necessary").
 */
export type GameId = "balloon-quest";

export type GameStatus = "ready";

/**
 * COMPACT LIBRARY TASK: which physical surface an activity is projected
 * onto — shown on its card so the therapist can tell at a glance what kind
 * of setup it needs before opening it. Only FLOOR is actually used today
 * (Balloon Quest); WALL is declared now so a future wall-projected game
 * doesn't need a registry/type change later, per "prepare the registry to
 * support typed activity/surface metadata... do not add a wall game now."
 */
export type SurfaceType = "FLOOR" | "WALL";

export const SURFACE_TYPE_LABELS_AR: Record<SurfaceType, string> = {
  FLOOR: "لعبة أرضية",
  WALL: "لعبة جدارية",
};

export interface GameDefinition {
  id: GameId;
  nameAr: string;
  nameEn: string;
  /** Short, non-clinical description of the activity — movement/play framing only, never a therapeutic claim. */
  shortDescriptionAr: string;
  status: GameStatus;
  /** Which surface this activity projects onto — GameCard derives its "لعبة أرضية"/"لعبة جدارية" pill from this, never a hardcoded label. */
  surfaceType: SurfaceType;
  /** The /control route this game's setup/controller experience lives at. */
  route: string;
}

export const GAME_REGISTRY: readonly GameDefinition[] = [
  {
    id: "balloon-quest",
    nameAr: "مغامرة البالونات",
    nameEn: "Balloon Quest",
    shortDescriptionAr: "نشاط تفاعلي يعتمد على الحركة وتمييز الألوان ضمن مستويات متعددة.",
    status: "ready",
    surfaceType: "FLOOR",
    route: "/control/balloon-quest",
  },
];

export function getGameById(id: string): GameDefinition | undefined {
  return GAME_REGISTRY.find((game) => game.id === id);
}

/**
 * The single place "balloon-quest" is spelled as a literal for anything
 * that needs to KNOW it's Balloon Quest specifically (as opposed to code
 * that just iterates GAME_REGISTRY generically) — e.g. the Balloon Quest
 * controller stamping its own canonical session with a gameId when it
 * creates one. See lib/control/useRealtimeControllerSession.ts.
 */
export const BALLOON_QUEST_GAME_ID: GameId = "balloon-quest";
