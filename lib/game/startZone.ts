/**
 * The Child Start Zone: a fixed physical spot near the child/front edge of
 * the projected floor where the child stands before every stage. Defined
 * once here (a domain constant, not a UI concern) specifically so
 * /display, /control, and the balloon generator's exclusion zone all agree
 * on the exact same rectangle — see the Task 8.2 report's "Start Zone
 * coordinate/size strategy" section for why spatial identity between
 * /control and /display depends on this being defined exactly once, not
 * duplicated as magic numbers in each UI.
 *
 * ORIENTATION ASSUMPTION: y=1 is the near/child/front edge of the projected
 * image — the same convention PlayArea.FRONT already uses (see
 * computeBounds in stageGenerator.ts) and the same one
 * components/control/live/BalloonMap.tsx documents independently for its
 * "جهة الطفل" caption. This is a documented assumption, not a verified
 * physical mapping — there is still no camera or floor sensor, so nothing
 * here (or anywhere else in the app) can confirm it automatically. Flag for
 * confirmation once a real projector installation exists.
 *
 * The zone is deliberately FIXED regardless of the therapist's PlayArea
 * choice (FULL/LEFT/RIGHT/FRONT) — it's where the child physically stands,
 * which doesn't move because a difficulty setting changed. Centered
 * horizontally so it reads as a natural "come stand here" spot no matter
 * which side of the floor balloons are confined to.
 */
export interface NormalizedRect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const START_ZONE: NormalizedRect = { xMin: 0.39, xMax: 0.61, yMin: 0.8, yMax: 0.96 };

/** Extra breathing room kept between a placed balloon's edge and the Start Zone's visual boundary — purely aesthetic, so balloons never render edge-to-edge against it. */
export const START_ZONE_BALLOON_MARGIN = 0.02;

/** Shortest distance from `point` to the Start Zone's boundary; 0 if `point` is inside it. */
export function distanceToStartZone(point: { x: number; y: number }): number {
  const dx = Math.max(START_ZONE.xMin - point.x, 0, point.x - START_ZONE.xMax);
  const dy = Math.max(START_ZONE.yMin - point.y, 0, point.y - START_ZONE.yMax);
  return Math.hypot(dx, dy);
}

/** Whether a balloon centered at `point` with the given radius would visually overlap the Start Zone (plus its margin). */
export function circleOverlapsStartZone(point: { x: number; y: number }, radius: number): boolean {
  return distanceToStartZone(point) < radius + START_ZONE_BALLOON_MARGIN;
}
