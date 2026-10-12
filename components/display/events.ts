import type { BalloonColor, StageNumber } from "@/lib/game";
import type { Foot, RouteObstacleKind } from "@/lib/footsteps";
import type { BubbleColor, BubbleShape } from "@/lib/bubblepop";
import type { Difficulty, StarLane } from "@/lib/spacepilot";
import type { ChaseColor, PadId } from "@/lib/colorchase";

/**
 * Semantic event boundary between the display experience and anything that
 * wants to react to it — currently the Task 4 audio layer, later possibly
 * Firebase/analytics. Scenes fire these at the moment each event visually
 * happens (e.g. "balloon_pop" fires when the pop animation starts, not when
 * the engine records the selection), so subscribers stay in sync with the
 * screen without needing to re-derive timing themselves.
 *
 * Naming matches Task 4's semantic event list (WELCOME, INSTRUCTION,
 * COUNTDOWN_3/2/1, START, BALLOON_POP, CORRECT, INCORRECT, STAGE_COMPLETE,
 * SESSION_COMPLETE, AMBIENCE_START/STOP) rather than Task 3's original flat
 * "countdown"/"pop" names, so a subscriber can switch on `type` directly.
 */
export type DisplayEvent =
  | {type:"bridge_sound";timestamp:number;kind:"checkpoint"|"deviation"|"stage"|"final";stage:number}
  | { type: "game_feedback"; timestamp: number; text: string; milestone: boolean; volume: number }
  | { type: "game_introduction"; timestamp: number; key: string; text: string }
  | { type: "welcome"; timestamp: number; childName: string }
  /** TASK 8.2: fired once when the Start Zone scene appears — isFirstStage distinguishes "before Stage 1" from "returning between stages" wording. */
  | { type: "start_zone"; timestamp: number; isFirstStage: boolean }
  | { type: "instruction"; timestamp: number; targetColor: BalloonColor; stageNumber: StageNumber }
  | { type: "countdown_3"; timestamp: number }
  | { type: "countdown_2"; timestamp: number }
  | { type: "countdown_1"; timestamp: number }
  | { type: "start"; timestamp: number }
  | { type: "balloon_pop"; timestamp: number }
  | { type: "correct"; timestamp: number; correctCount: number; totalTargets: number }
  | { type: "incorrect"; timestamp: number }
  | { type: "stage_complete"; timestamp: number; childName: string; stageNumber: StageNumber }
  | { type: "session_complete"; timestamp: number; childName: string }
  | { type: "ambience_start"; timestamp: number }
  | { type: "ambience_stop"; timestamp: number }
  /** Fired once, the instant the shared Shumos Waiting World is tapped (audio-unlock gesture) — speaks the waiting world's own visible Arabic message exactly once, never looped (see ShumosWaitingWorld.tsx). */
  | { type: "waiting_world_greeting"; timestamp: number }
  /** Shared across every game (task's PAUSE audit item) — fired once when a game's PlayingScene-equivalent shows its "توقف مؤقت" overlay, so the child is told what's happening rather than left reading it. */
  | { type: "paused"; timestamp: number }
  // MULTI-GAME PLATFORM — Follow the Footsteps' own events (task section
  // 43-54's "completely unique game world" requirement). Deliberately its
  // own event vocabulary rather than reusing Balloon Quest's balloon_pop/
  // correct/incorrect/instruction/session_complete: this game has no
  // color target and no incorrect branch (NO NEGATIVE SCORING), and its
  // ambience/celebrations must sound nothing like the garden's. `welcome`,
  // `start_zone`, and the shared `countdown_*`/`start` ticks ARE reused
  // unchanged (see WelcomeScene-equivalent/StartZoneScene-equivalent) since
  // the Start Zone instruction is spec'd with the exact same wording
  // regardless of game, and 3-2-1 is genuinely game-agnostic.
  | { type: "footsteps_welcome"; timestamp: number; childName: string }
  | { type: "footsteps_instruction"; timestamp: number; childName: string; stageNumber: StageNumber }
  /** Fired the instant a footprint is confirmed — drives the per-step cosmic chime and, at milestones, a spoken encouragement line. */
  | { type: "footstep_confirm"; timestamp: number; foot: Foot; stepIndex: number; totalSteps: number }
  /** JOURNEY REDESIGN — fired the instant the target a checkpoint sits on is confirmed. A milestone within the stage, never a reason to end it — drives a short chime + optional short encouragement line, never the stage-complete celebration. */
  | { type: "footsteps_checkpoint_reached"; timestamp: number }
  /** ROUTE ARCHITECTURE REWRITE — replaces the old SINGLE/PAIR stance mechanic (ADVANCED only). Fired the instant the target just before a cosmic obstacle is confirmed — the obstacle is now the child's next movement cue. */
  | { type: "footsteps_obstacle_active"; timestamp: number; obstacleId: string; kind: RouteObstacleKind }
  /** Fired the instant the target just past a cosmic obstacle is confirmed — the child has moved past it; drives its "breaks into stars/glows-cracks-dissolves/sparkle sweep" reward. */
  | { type: "footsteps_obstacle_cleared"; timestamp: number; obstacleId: string; kind: RouteObstacleKind }
  | { type: "footsteps_stage_complete"; timestamp: number; childName: string; stageNumber: StageNumber }
  | { type: "footsteps_session_complete"; timestamp: number; childName: string }
  | { type: "cosmic_ambience_start"; timestamp: number }
  | { type: "cosmic_ambience_stop"; timestamp: number }
  // MULTI-GAME PLATFORM — Bubble Pop Wall's own events (task section 45-54's
  // "completely unique game world" requirement, third time over). Its own
  // event vocabulary again: this game DOES have an incorrect branch (unlike
  // Follow the Footsteps), but its own gentle tone (task section 30), and a
  // per-TARGET announcement (`bubblepop_target_request`) rather than
  // Balloon Quest's per-STAGE `instruction` — a stage here asks for several
  // DIFFERENT bubbles in sequence, not one fixed color for the whole stage.
  | { type: "bubblepop_welcome"; timestamp: number; childName: string }
  | { type: "bubblepop_ready_position"; timestamp: number; childName: string; isFirstStage: boolean }
  | { type: "bubblepop_instruction"; timestamp: number; childName: string; stageNumber: StageNumber }
  /** Fired whenever a NEW bubble becomes the current request — at the moment PLAYING begins, and again after every correct pop. Phase 2 Part C: the spoken cue is SHORT (color alone, or "shape color" — never a full sentence or the child's name every time). */
  | { type: "bubblepop_target_request"; timestamp: number; childName: string; color: BubbleColor; shape: BubbleShape; announceShape: boolean }
  /** Phase 2 Part G — fired ONCE, instead of bubblepop_target_request, when the FIRST bubble of a two-step sequence mission becomes current: announces both steps together ("أزرق، ثم أصفر"). The second step announces normally via bubblepop_target_request once it becomes current. */
  | {
      type: "bubblepop_sequence_request";
      timestamp: number;
      firstColor: BubbleColor;
      firstShape: BubbleShape;
      announceFirstShape: boolean;
      secondColor: BubbleColor;
      secondShape: BubbleShape;
      announceSecondShape: boolean;
    }
  /** Fired the instant a correct bubble pops — drives the watery pop SFX. */
  | { type: "bubblepop_pop"; timestamp: number }
  | { type: "bubblepop_correct"; timestamp: number; correctCount: number; totalTargets: number }
  | { type: "bubblepop_incorrect"; timestamp: number }
  | { type: "bubblepop_stage_complete"; timestamp: number; childName: string; stageNumber: StageNumber }
  | { type: "bubblepop_session_complete"; timestamp: number; childName: string }
  | { type: "underwater_ambience_start"; timestamp: number }
  | { type: "underwater_ambience_stop"; timestamp: number }
  // SPACE PILOT — Level 1 "رحلة النجوم" own events (own event vocabulary,
  // same convention as every other game above): the child pilots a rocket
  // through 3 fixed lanes and collects a sequence of large stars in real
  // time — there is no per-target THERAPIST tap the way Bubble Pop Wall/Feed
  // the Animals have; `space_pilot_star_collected`/`_missed` fire the
  // instant a star resolves (see lib/spacepilot/session.ts's
  // resolveSpacePilotStarArrival), driven by the controller's own timed
  // chain, never by a display-side guess.
  | { type: "space_pilot_welcome"; timestamp: number; childName: string }
  | { type: "space_pilot_ready_position"; timestamp: number }
  | { type: "space_pilot_instruction"; timestamp: number; childName: string; difficulty: Difficulty }
  /** Fired the instant the (therapist-mirrored) UP/DOWN press actually changes the rocket's lane — never fired for a press already at the TOP/BOTTOM boundary (see moveSpacePilotRocketLane's no-op return). */
  | { type: "space_pilot_lane_change"; timestamp: number; direction: "UP" | "DOWN"; lane: StarLane }
  /** Fired the instant a star (other than the last) resolves as collected — drives the collectible chime + the rocket's own upgrade power-up sound, `upgradeLevel` (== the star's own 1-based index) shapes the chime's rising pitch/texture (task's "as upgrades progress, the pitch/texture may gently rise"). */
  | { type: "space_pilot_star_collected"; timestamp: number; upgradeLevel: number }
  /** Fired the instant a star passes uncollected — a gentle neutral sound, never a failure buzzer (task's "no failure sound"). */
  | { type: "space_pilot_star_missed"; timestamp: number }
  /** Fired instead of space_pilot_star_collected for star 8 specifically — task's "final collectible star should feel special... strong resolving space chord." ADVANCED also gets the portal payoff (see space_pilot_portal below), fired alongside this one. */
  | { type: "space_pilot_final_star_collected"; timestamp: number; childName: string }
  // MEDIUM/ADVANCED — the encounter model's own events (asteroids/FIRE/
  // alien), additive to the star events above (a STAR encounter on these
  // difficulties still fires space_pilot_star_collected/_missed).
  /** Fired the instant the (therapist-mirrored) FIRE press actually launches a shot — always, whether or not it hits anything (the visual travels regardless; only a genuine asteroid hit also fires space_pilot_asteroid_cleared). */
  | { type: "space_pilot_fire"; timestamp: number; lane: StarLane }
  /** Fired the instant an asteroid is destroyed by FIRE. */
  | { type: "space_pilot_asteroid_cleared"; timestamp: number }
  /** Fired the instant an asteroid passes without being cleared — never a failure (task's "No punishment"), whether the child dodged it or simply let it pass. */
  | { type: "space_pilot_asteroid_avoided"; timestamp: number }
  /** Fired the instant ADVANCED's friendly alien ship finishes passing through its lane. */
  | { type: "space_pilot_alien_passed"; timestamp: number }
  /** ADVANCED only — fired once alongside the final star's celebration, for the "portal opens / destination appears" payoff (task's "FINAL FORM PAYOFF"). */
  | { type: "space_pilot_portal"; timestamp: number }
  | { type: "space_pilot_stage_complete"; timestamp: number; childName: string; difficulty: Difficulty }
  | { type: "space_pilot_session_complete"; timestamp: number; childName: string }
  | { type: "space_ambience_start"; timestamp: number }
  | { type: "space_ambience_stop"; timestamp: number }
  | { type: "color_chase_welcome"; timestamp: number; childName: string }
  | { type: "color_chase_ready"; timestamp: number; isFirstStage: boolean }
  | { type: "color_chase_instruction"; timestamp: number; instruction: string }
  | { type: "color_chase_target"; timestamp: number; color: ChaseColor }
  | { type: "color_chase_pad_activation"; timestamp: number }
  | { type: "color_chase_correct"; timestamp: number; padId: PadId; combo: number; final: boolean }
  | { type: "color_chase_incorrect"; timestamp: number }
  | { type: "color_chase_danger"; timestamp: number }
  | { type: "color_chase_stage_complete"; timestamp: number; childName: string; stageNumber: StageNumber }
  | { type: "color_chase_session_complete"; timestamp: number; childName: string }
  | { type: "color_chase_ambience_start"; timestamp: number }
  | { type: "color_chase_ambience_stop"; timestamp: number };

export type DisplayEventType = DisplayEvent["type"];

export type DisplayEventListener = (event: DisplayEvent) => void;

export const noopDisplayEventListener: DisplayEventListener = () => {};
