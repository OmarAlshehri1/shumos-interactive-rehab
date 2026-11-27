import {BALANCE_BRIDGE_ENABLED,BALANCE_BRIDGE_REGISTRATION} from '@/lib/balancebridge3d/registration';
import {CASTLE_REGISTRATION} from '@/lib/castlelegends3d/registration';
import { LEGACY_BALLOON_QUEST } from '@/lib/balloonquest/rollback';
import { HARVEST_VALLEY_ENABLED, HARVEST_VALLEY_REGISTRATION } from '@/lib/harvestvalley3d/registration';
import { BLOOMING_WORLD_ENABLED, BLOOMING_WORLD_REGISTRATION } from '@/lib/bloomingworld3d/registration';
import { FIRE_RESCUE_ENABLED, FIRE_RESCUE_REGISTRATION } from '@/lib/firerescue3d/registration';
import { PEARL_VOYAGE_ENABLED, PEARL_VOYAGE_REGISTRATION } from '@/lib/pearlvoyage3d/registration';
import { MIRROR_QUEST_REGISTRATION, MIRROR_QUEST_ENABLED } from '@/lib/mirrorquest3d/registration';
import { SAFE_HEX_ARENA_REGISTRATION, SAFE_HEX_ARENA_ENABLED } from '@/lib/safehexarena3d/registration';
import { TURN_AND_GO_REGISTRATION, TURN_AND_GO_ENABLED } from '@/lib/turngo3d/registration';
import { FOOT_MAZE_REGISTRATION, FOOT_MAZE_ENABLED } from '@/lib/footmaze3d/registration';
import { RHYTHM_STEPS_REGISTRATION, RHYTHM_STEPS_ENABLED } from '@/lib/rhythmsteps3d/registration';
import { BODY_SEQUENCE_REGISTRATION, BODY_SEQUENCE_ENABLED } from '@/lib/bodysequence3d/registration';
import { ACHIEVEMENT_FOREST_REGISTRATION, ACHIEVEMENT_FOREST_ENABLED } from '@/lib/achievementforest/registration';
import { ACHIEVEMENT_CITY_REGISTRATION, ACHIEVEMENT_CITY_ENABLED } from '@/lib/achievementcity/registration';
import { OCEAN_WONDERS_REGISTRATION, OCEAN_WONDERS_ENABLED } from '@/lib/oceanwonders/registration';
import { FOOTSTEPS_3D_DESCRIPTION_AR, FOOTSTEPS_3D_ENABLED, FOOTSTEPS_3D_NAME_EN } from '@/lib/footsteps3d/registration';
import { COLOR_CHASE_3D_DESCRIPTION_AR, COLOR_CHASE_3D_ENABLED, COLOR_CHASE_3D_NAME_EN } from '@/lib/colorchase3d/registration';
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
import { SPACE_PILOT_3D_ENABLED } from '@/lib/spacepilot3d/releasePolicy';
import { RUNNER_QUEST_3D_ENABLED } from '@/lib/runnerquest3d/availability';
import { RUNNER_QUEST_3D_REGISTRATION as RQ3D } from '@/lib/runnerquest3d/registration';
import { BUILD_QUEST_3D_ENABLED, BUILD_QUEST_REGISTRATION as BQ3D } from '@/lib/buildquest3d/registration';
export type GameId = "ocean-wonders-3d" | "achievement-forest-3d" | "achievement-city-3d" | "body-sequence-3d" | "rhythm-steps-3d" | "foot-maze-3d" | "turn-and-go-3d" | "balance-bridge-3d" | "shumos-castle-legends-3d" | "pearl-voyage-3d" | "harvest-valley-3d" | "blooming-world-3d" | "fire-rescue-3d" | "balloon-quest" | "follow-the-footsteps" | "bubble-pop-wall" | "space-pilot" | "color-chase" | "runner-quest-3d" | "build-quest-3d" | "mirror-quest-3d" | "safe-hex-arena-3d";
/**
 * Retained for source compatibility only. Every game, Build Quest 3D included, now publishes into the shared
 * `/liveSession` record and is a full GameId; there is no longer any game with a separate cloud adapter.
 */
export type LocalGameId = never;

export type GameStatus = "ready";

/** Verified display surfaces, kept independent of the requested input device. */
export type SurfaceType = "FLOOR" | "WALL" | "BOTH";

export const SURFACE_TYPE_LABELS_AR: Record<SurfaceType, string> = {
  BOTH: "جدار وأرضية",
  FLOOR: "أرضية",
  WALL: "جدار",
};

export interface GameDefinition {
  id: GameId | LocalGameId;
  nameAr: string;
  nameEn: string;
  /** Short, non-clinical description of the activity — movement/play framing only, never a therapeutic claim. */
  shortDescriptionAr: string;
  /** Plain-language interaction focus; descriptive only, never an outcome claim. */
  focusTagsAr: readonly string[];
  /** Optional intended movement categories; not a claim of therapeutic effectiveness. */
  activitySkills?: readonly import("./library/skillTags").ActivitySkill[];
  status: GameStatus;
  /** Which surface this activity projects onto — GameCard derives its "لعبة أرضية"/"لعبة جدارية" pill from this, never a hardcoded label. */
  surfaceType: SurfaceType;
  /** The /control route this game's setup/controller experience lives at. */
  route: string;
  /**
   * SENSOR INTEGRATION: whether this game's live route wires the shared
   * RIGHT_HAND runtime (see components/control/sensors/SensorRuntimeProvider.tsx)
   * into its own real map/dock — a virtual hand that calls this game's
   * canonical action on contact, alongside mouse/touch, never instead of it.
   * The single source of truth DisplayScreen.tsx checks before drawing the
   * mirrored hand on /display, and the therapist library could use later to
   * badge sensor-ready activities. false for Space Pilot — it has no
   * discrete-target selection step (continuous flight), so there is no
   * canonical "contact -> action" moment for a pointer to trigger.
   */
  sensorCompatible: boolean;
}

export const GAME_REGISTRY: readonly GameDefinition[] = [
  ...(BALANCE_BRIDGE_ENABLED?[BALANCE_BRIDGE_REGISTRATION satisfies GameDefinition]:[]),
  CASTLE_REGISTRATION,
  ...(HARVEST_VALLEY_ENABLED ? [HARVEST_VALLEY_REGISTRATION satisfies GameDefinition] : []),
  ...(BLOOMING_WORLD_ENABLED ? [BLOOMING_WORLD_REGISTRATION satisfies GameDefinition] : []),
  ...(FIRE_RESCUE_ENABLED ? [FIRE_RESCUE_REGISTRATION satisfies GameDefinition] : []),
  // Pearl Voyage 3D: shared-liveSession wall game, feature-flagged (lib/pearlvoyage3d/registration.ts). Rollback: unset NEXT_PUBLIC_PEARL_VOYAGE_3D.
  ...(PEARL_VOYAGE_ENABLED ? [PEARL_VOYAGE_REGISTRATION satisfies GameDefinition] : []),
  ...(MIRROR_QUEST_ENABLED ? [MIRROR_QUEST_REGISTRATION satisfies GameDefinition] : []),
  // Safe Hex Arena 3D: shared-liveSession floor game, feature-flagged (lib/safehexarena3d/registration.ts). Rollback: unset NEXT_PUBLIC_SAFE_HEX_ARENA_3D.
  ...(SAFE_HEX_ARENA_ENABLED ? [SAFE_HEX_ARENA_REGISTRATION satisfies GameDefinition] : []),
  // Turn & Go 3D: shared-liveSession floor game, feature-flagged (lib/turngo3d/registration.ts). Rollback: unset NEXT_PUBLIC_TURN_AND_GO_3D.
  ...(TURN_AND_GO_ENABLED ? [{ ...TURN_AND_GO_REGISTRATION, focusTagsAr: [...TURN_AND_GO_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  // Foot Maze 3D: shared-liveSession floor game, feature-flagged (lib/footmaze3d/registration.ts). Rollback: unset NEXT_PUBLIC_FOOT_MAZE_3D.
  ...(FOOT_MAZE_ENABLED ? [{ ...FOOT_MAZE_REGISTRATION, focusTagsAr: [...FOOT_MAZE_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  // Rhythm Steps 3D: shared-liveSession floor game, feature-flagged (lib/rhythmsteps3d/registration.ts). Rollback: unset NEXT_PUBLIC_RHYTHM_STEPS_3D.
  ...(RHYTHM_STEPS_ENABLED ? [{ ...RHYTHM_STEPS_REGISTRATION, focusTagsAr: [...RHYTHM_STEPS_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  // Body Sequence 3D: shared-liveSession floor game, feature-flagged (lib/bodysequence3d/registration.ts). Rollback: unset NEXT_PUBLIC_BODY_SEQUENCE_3D.
  ...(BODY_SEQUENCE_ENABLED ? [{ ...BODY_SEQUENCE_REGISTRATION, focusTagsAr: [...BODY_SEQUENCE_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  // Achievement Forest 3D: shared-liveSession wall reward game, feature-flagged (lib/achievementforest/registration.ts). Rollback: unset NEXT_PUBLIC_ACHIEVEMENT_FOREST_3D.
  // Achievement City 3D: shared-liveSession wall reward game, feature-flagged (lib/achievementcity/registration.ts). Rollback: unset NEXT_PUBLIC_ACHIEVEMENT_CITY_3D.
  ...(ACHIEVEMENT_FOREST_ENABLED ? [{ ...ACHIEVEMENT_FOREST_REGISTRATION, focusTagsAr: [...ACHIEVEMENT_FOREST_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  ...(ACHIEVEMENT_CITY_ENABLED ? [{ ...ACHIEVEMENT_CITY_REGISTRATION, focusTagsAr: [...ACHIEVEMENT_CITY_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  // Ocean Wonders 3D: shared-liveSession wall reward game, feature-flagged (lib/oceanwonders/registration.ts). Rollback: unset NEXT_PUBLIC_OCEAN_WONDERS_3D.
  ...(OCEAN_WONDERS_ENABLED ? [{ ...OCEAN_WONDERS_REGISTRATION, focusTagsAr: [...OCEAN_WONDERS_REGISTRATION.focusTagsAr] } satisfies GameDefinition] : []),
  {
    id: "balloon-quest",
    nameAr: "مغامرة البالونات",
    nameEn: "Balloon Quest",
    shortDescriptionAr: "يلمس الطفل البالون الملوّن المطلوب بين بالونات ثابتة أو صاعدة، على ثلاثة مستويات.",
    focusTagsAr: ["تمييز الألوان", "وصول وحركة"],
    status: "ready",
    surfaceType: LEGACY_BALLOON_QUEST ? "FLOOR" : "BOTH",
    route: "/control/balloon-quest",
    sensorCompatible: true,
  },
  {
    id: "follow-the-footsteps",
    nameAr: "اتبع الخطوات",
    nameEn: FOOTSTEPS_3D_ENABLED ? FOOTSTEPS_3D_NAME_EN : "Follow the Footsteps",
    shortDescriptionAr: FOOTSTEPS_3D_ENABLED ? FOOTSTEPS_3D_DESCRIPTION_AR : "يتبع الطفل المسار الأرضي خطوةً بعد خطوة حتى يصل إلى النجمة.",
    focusTagsAr: ["اتباع المسار", "حركة بمساعدة"],
    status: "ready",
    surfaceType: "FLOOR",
    route: "/control/follow-the-footsteps",
    // the 3D engine has no pointer hand: its foot sensors are movement hints only (see lib/footsteps3d)
    sensorCompatible: !FOOTSTEPS_3D_ENABLED,
  },
  {
    id: "bubble-pop-wall",
    nameAr: "فرقع الفقاعات",
    nameEn: "Bubble Pop Wall 3D",
    shortDescriptionAr: "قبة العجائب: يصل الطفل إلى عوالم صغيرة، ويوجّهها ويضيئها بحركة هادئة.",
    focusTagsAr: ["وصول وتوجيه", "ثبات وتناوب اليدين"],
    status: "ready",
    surfaceType: "WALL",
    route: "/control/bubble-pop-wall",
    sensorCompatible: true,
  },
  {
    id: "space-pilot",
    nameAr: "قائد الفضاء",
    nameEn: SPACE_PILOT_3D_ENABLED ? "Space Pilot 3D" : "Space Pilot",
    shortDescriptionAr: SPACE_PILOT_3D_ENABLED ? "رحلة ثلاثية الأبعاد عبر الحلقات الذهبية، بتوجيه المعالج أو اليد اليمنى ومزامنة بين الأجهزة." : "يحرّك الطفل الصاروخ بين المسارات، ويجمع النجوم ويتفاعل مع العوائق.",
    focusTagsAr: ["اختيار واتخاذ قرار", "تناسق بصري حركي"],
    status: "ready",
    surfaceType: "WALL",
    route: "/control/space-pilot",
    sensorCompatible: SPACE_PILOT_3D_ENABLED,
  },
  {
    id: "color-chase",
    nameAr: "مطاردة الألوان",
    nameEn: COLOR_CHASE_3D_ENABLED ? COLOR_CHASE_3D_NAME_EN : "Color Chase",
    shortDescriptionAr: COLOR_CHASE_3D_ENABLED ? COLOR_CHASE_3D_DESCRIPTION_AR : "يتحرك الطفل بين الألوان المضيئة ويختار اللون المطلوب.",
    focusTagsAr: ["تمييز الألوان", "حركة بمساعدة"],
    status: "ready",
    surfaceType: "FLOOR",
    route: "/control/color-chase",
    // the 3D engine has no pointer hand: its foot sensors are movement hints only (see lib/colorchase3d)
    sensorCompatible: !COLOR_CHASE_3D_ENABLED,
  },
  // Runner Quest 3D: live-session game (cross-device), feature-flagged (lib/runnerquest3d/availability.ts). Rollback: unset NEXT_PUBLIC_RUNNER_QUEST_3D.
  ...(RUNNER_QUEST_3D_ENABLED
    ? [{ id: RQ3D.id, nameAr: RQ3D.nameAr, nameEn: RQ3D.nameEn, shortDescriptionAr: RQ3D.shortDescriptionAr, focusTagsAr: [...RQ3D.focusTagsAr], status: RQ3D.status, surfaceType: RQ3D.surfaceType, route: RQ3D.route, sensorCompatible: RQ3D.sensorCompatible } satisfies GameDefinition]
    : []),
  ...(BUILD_QUEST_3D_ENABLED
    ? [{ id: BQ3D.id, nameAr: BQ3D.nameAr, nameEn: BQ3D.nameEn, shortDescriptionAr: BQ3D.shortDescriptionAr, focusTagsAr: [...BQ3D.focusTagsAr], status: BQ3D.status, surfaceType: BQ3D.surfaceType, route: BQ3D.route, sensorCompatible: BQ3D.sensorCompatible } satisfies GameDefinition]
    : []),
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
export const BALLOON_QUEST_GAME_ID = "balloon-quest";

/** Same role as BALLOON_QUEST_GAME_ID above, for Follow the Footsteps — see lib/control/useFootstepsRealtimeControllerSession.ts. */
export const FOLLOW_THE_FOOTSTEPS_GAME_ID = "follow-the-footsteps";

/** Same role as BALLOON_QUEST_GAME_ID above, for Bubble Pop Wall — see lib/control/bubblepop/useBubblePopRealtimeControllerSession.ts. */
export const BUBBLE_POP_WALL_GAME_ID = "bubble-pop-wall";

/** Same role as BALLOON_QUEST_GAME_ID above, for Space Pilot — see lib/control/spacepilot/useSpacePilotRealtimeControllerSession.ts. */
export const SPACE_PILOT_GAME_ID = "space-pilot";

/** Canonical id for Color Chase controller, display, audio, and history integration. */
export const COLOR_CHASE_GAME_ID = "color-chase";

/** Runner Quest 3D canonical id for the live session, display routing and history (see lib/runnerquest3d/registration.ts). */
export const RUNNER_QUEST_3D_GAME_ID = "runner-quest-3d";

/** Build Quest 3D canonical id for the live session, display routing and history (see lib/buildquest3d/registration.ts). */
export const BUILD_QUEST_GAME_ID = "build-quest-3d";

/** Retired engines remain registered for live recovery and historical revivers. */
export const isLaunchableGame = (game: Pick<GameDefinition,"id">) => game.id !== "bubble-pop-wall";
export const LAUNCHABLE_GAMES = GAME_REGISTRY.filter(isLaunchableGame);
