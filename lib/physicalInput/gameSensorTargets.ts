import type { Balloon } from "@/lib/game";
import type { Footprint } from "@/lib/footsteps";
import { type BubbleColor, type BubbleShape, type BubblePopStageRuntime, currentTargetId, getBubbleStagePlan } from "@/lib/bubblepop";
import { PAD_IDS, type PadId } from "@/lib/colorchase";
import { stationScreenX, STATION_SCREEN_Y } from "@/components/display/bubblepop/stations/stationLayout";
import type { CircularContactTarget } from "./ContactActivationGate";

/**
 * PRODUCTION SENSOR INTEGRATION — pure, framework-free target-geometry and
 * contact-id-resolution helpers, one per real game, extracted so the exact
 * math a live map hands to useSensorPointerTargets can be unit-tested
 * without rendering React (this repo has no React component-rendering test
 * setup — see lib/physicalInput/__tests__/gameSensorTargets.test.ts). Each
 * function mirrors the geometry the matching *SensorContactDemo.tsx already
 * proved against the real engine/display layout; the live map components
 * (BalloonMap, FootMap, StationBar, ColorChaseControlScreen)
 * call these directly instead of re-deriving the same math inline.
 *
 * The one-shot "enter once, hold does nothing, exit rearms" contact
 * detection itself is NOT re-tested here — see ContactActivationGate.test.ts
 * and SensorContactRouter.test.ts for that; this file only owns "which
 * normalized targets exist right now" and "which real id does a contact's
 * target id resolve to."
 */

/** Balloon Quest — every unpopped balloon in the current stage, at its engine-generated normalized position. */
export function balloonSensorTargets(balloons: readonly Balloon[]): CircularContactTarget[] {
  return balloons.filter((balloon) => !balloon.isPopped).map((balloon) => ({ id: balloon.id, x: balloon.position.x, y: balloon.position.y, radius: balloon.size / 2 }));
}

/** No explicit size field on Footprint (unlike Balloon) — matches CanonicalBalloonContactDemo's sibling FollowFootstepsSensorContactDemo's generous fixed radius. */
export const CURRENT_FOOTPRINT_HIT_RADIUS = 0.09;

/** Follow the Footsteps — only ever the ONE current (next-to-confirm) footprint; confirmCurrentFootstep takes no target id, so the id here is only used to detect contact, never passed through. */
export function footstepsSensorTargets(currentFootprint: Footprint | null): CircularContactTarget[] {
  if (!currentFootprint) return [];
  return [{ id: currentFootprint.id, x: currentFootprint.position.x, y: currentFootprint.position.y, radius: CURRENT_FOOTPRINT_HIT_RADIUS }];
}

/** Matches StationBar's own rendered pearl size closely enough for a generous, therapist-safe hit radius — same value BubblePopSensorContactDemo already validated. */
export const STATION_HIT_RADIUS = 0.09;

export interface BubblePopStationItem {
  key: string;
  color: BubbleColor;
  shape?: BubbleShape;
  isCurrent: boolean;
}

/**
 * Bubble Pop Wall's fixed station dock — the SAME source StationBar.tsx
 * itself renders from (the current mission's per-mission (color, shape)
 * token set for a shape mission, or the plain color palette otherwise), so
 * the sensor's hit-test always matches what's actually drawn.
 */
export function bubblePopStationItems(stage: BubblePopStageRuntime): BubblePopStationItem[] {
  const targetId = currentTargetId(stage);
  const target = stage.bubbles.find((bubble) => bubble.id === targetId) ?? null;
  const plan = getBubbleStagePlan(stage.difficulty, stage.stageNumber);
  return target?.requiresShape && target.stationTokens.length > 0
    ? target.stationTokens.map((token, index) => ({ key: `${token.color}-${token.shape}-${index}`, color: token.color, shape: token.shape, isCurrent: token.color === target.color && token.shape === target.shape }))
    : plan.stations.map((color) => ({ key: color, color, isCurrent: color === target?.color }));
}

export function bubblePopSensorTargets(items: readonly BubblePopStationItem[]): CircularContactTarget[] {
  return items.map((item, index) => ({ id: item.key, x: stationScreenX(index, items.length), y: STATION_SCREEN_Y, radius: STATION_HIT_RADIUS }));
}

/** Resolves a station contact's target id back to the (color, shape) confirmBubblePopColor needs — null for a stale/unknown key (e.g. the stage advanced between the contact firing and this lookup). */
export function resolveBubblePopStationContact(items: readonly BubblePopStationItem[], stationKey: string): { color: BubbleColor; shape?: BubbleShape } | null {
  const item = items.find((candidate) => candidate.key === stationKey);
  return item ? { color: item.color, shape: item.shape } : null;
}

/**
 * Color Chase's fixed 3x3 pad grid — mirrors ColorPadGrid.tsx's own fixed
 * layout region (`inset-x-[14%] top-[21%] bottom-[16%]`) exactly, the same
 * geometry ColorChaseSensorContactDemo already validated against the real
 * display component. Stateless (pad positions never move), so this is
 * computed once, not derived from session/stage data.
 */
const GRID_X0 = 0.14;
const GRID_X1 = 0.86;
const GRID_Y0 = 0.21;
const GRID_Y1 = 0.84;
export const COLOR_CHASE_PAD_HIT_RADIUS = 0.09;

export function colorChaseSensorTargets(): CircularContactTarget[] {
  return PAD_IDS.map((padId, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      id: padId,
      x: GRID_X0 + ((col + 0.5) / 3) * (GRID_X1 - GRID_X0),
      y: GRID_Y0 + ((row + 0.5) / 3) * (GRID_Y1 - GRID_Y0),
      radius: COLOR_CHASE_PAD_HIT_RADIUS,
    };
  });
}

export function isColorChasePadId(value: string): value is PadId {
  return (PAD_IDS as readonly string[]).includes(value);
}
