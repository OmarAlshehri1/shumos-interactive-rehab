import type { Foot } from '@/lib/bodysequence3d/sequence';

/**
 * Footprint glyph shared by the 3D floor textures and the DOM instruction pill (viewBox 100 x 190). The big toe is on
 * the INNER side, so a right foot and a left foot are different shapes and never merely recoloured: the left foot is the
 * exact horizontal mirror of the right one. Drawn from the child's point of view (toes up = the way the child faces).
 */
export const SOLE_PATH =
  'M40 184 C26 184 21 171 24 156 C28 140 33 130 32 116 C31 102 20 92 19 72 C18 52 25 40 40 36 L68 36 C84 42 90 60 87 80 C84 98 77 106 76 122 C75 140 82 156 76 172 C71 183 58 184 40 184 Z';
/** Toes: [cx, cy, r], big toe first (inner side). */
export const TOES: readonly (readonly [number, number, number])[] = [[35, 24, 13], [55, 17, 8.5], [70, 21, 7.5], [82, 31, 6.5], [90, 45, 5.5]];
/** Tread lines across the sole. */
export const TREAD: readonly string[] = ['M30 92 C46 99 62 99 80 92', 'M29 112 C46 119 62 119 80 112', 'M31 134 C46 141 62 141 78 134', 'M35 156 C48 161 60 161 74 156'];

/** SVG `transform` that maps the right-foot shape to the requested foot. */
export const footTransform = (foot: Foot) => (foot === 'R' ? '' : 'translate(100 0) scale(-1 1)');

export function drawFoot(ctx: CanvasRenderingContext2D, foot: Foot, cx: number, cy: number, height: number, o: { stroke: string; fill?: string; glow?: string; lineWidth?: number }): void {
  const k = height / 190;
  ctx.save();
  ctx.translate(cx - 50 * k * (foot === 'R' ? 1 : -1), cy - 95 * k);
  ctx.scale(foot === 'R' ? k : -k, k);
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 26; }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = (o.lineWidth ?? 5) ;
  ctx.strokeStyle = o.stroke;
  const sole = new Path2D(SOLE_PATH);
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(sole); }
  ctx.stroke(sole);
  for (const [x, y, r] of TOES) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (o.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = (o.lineWidth ?? 5) * 0.55;
  for (const t of TREAD) ctx.stroke(new Path2D(t));
  ctx.restore();
}
