import type { Lane } from './sequence';

/**
 * Lane geometry in CHILD space: x grows to the child's right, y grows forward (away from the child). Units are layout
 * units (the picture is 16 units wide); they are never centimetres. The therapist's spacing multiplier scales both the
 * lane size and the gap, so a safe stance width can be set without assuming what a pixel is on the real floor.
 */
export interface Box { x: number; y: number; w: number; h: number }
export interface Layout { lanes: 2 | 3; boxes: Partial<Record<'L' | 'C' | 'R', Box>>; home: Box; width: number; centerY: number }

export const LANE_Y = 0.2;
export const LANE_H = 3.7;
export const HOME_Y = -3.3;
export const HOME_H = 1.25;

export function layoutOf(lanes: 2 | 3, spacing: number, mirror: boolean): Layout {
  const sp = spacing;
  const lw = (lanes === 2 ? 3.5 : 2.6) * sp;
  const gap = (lanes === 2 ? 0.8 : 0.55) * sp;
  const pitch = lw + gap;
  const sx = mirror ? -1 : 1;
  const boxes: Layout['boxes'] = lanes === 2
    ? { L: { x: -sx * pitch / 2, y: LANE_Y, w: lw, h: LANE_H }, R: { x: sx * pitch / 2, y: LANE_Y, w: lw, h: LANE_H } }
    : { L: { x: -sx * pitch, y: LANE_Y, w: lw, h: LANE_H }, C: { x: 0, y: LANE_Y, w: lw, h: LANE_H }, R: { x: sx * pitch, y: LANE_Y, w: lw, h: LANE_H } };
  const width = lanes * lw + (lanes - 1) * gap;
  return { lanes, boxes, home: { x: 0, y: HOME_Y, w: Math.min(width, lanes === 2 ? 5.2 * sp : 6.2 * sp), h: HOME_H }, width, centerY: (HOME_Y - HOME_H / 2 + LANE_Y + LANE_H / 2) / 2 };
}

export const boxOf = (l: Layout, lane: Lane): Box | undefined => (lane === 'H' ? l.home : l.boxes[lane as 'L' | 'C' | 'R']);
