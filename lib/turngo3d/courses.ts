/**
 * Turn & Go course geometry. Pure functions, no DOM, no Three.js: the engine, the Control map editor, the Display
 * scene and the unit tests all derive the SAME route from (stage, config).
 *
 * COORDINATES. "Course units" (cu): x to the right, y UP the screen, the projected area is 16 x 9 cu, origin in the
 * middle. One cu is NOT a real distance until the therapist measures the projection; nothing here claims centimetres.
 * Courses are authored in a BASE frame (start on the left, walking right). Rotation, mirror and a uniform fit-scale are
 * applied last, so the therapist's manual cone/checkpoint adjustments (stored in the base frame) survive a rotation.
 */
export type Pt = [number, number];

export const AREA_W = 16;
export const AREA_H = 9;
/** Visual radius of a physical cone's base footprint. */
export const CONE_R = 0.3;
/** No star / start / finish is ever placed closer than this to a cone centre: the child never has to reach a cone. */
export const CONE_SAFE = 0.95;
/** The drawn corridor never touches a cone: its half width stays this far inside the nearest cone centre. */
export const CORRIDOR_GAP = CONE_R + 0.2;

export type CpKind = 'go' | 'stop' | 'finish';
export type EventKind = 'light' | 'character' | 'gate' | 'switch' | 'block' | 'altStar';
export const EVENT_KINDS: readonly EventKind[] = ['light', 'character', 'gate', 'switch', 'block', 'altStar'];
/** Events that move the NEXT checkpoint (only ever while the child stands still at a confirmed star). */
export const ROUTE_EVENTS: readonly EventKind[] = ['switch', 'block', 'altStar'];

export type CourseId = 'straight' | 'one' | 'two' | 'three' | 'four' | 'slalom' | 'sShape' | 'curve' | 'stopgo' | 'turns' | 'town' | 'festival';
export const COURSE_IDS: readonly CourseId[] = ['straight', 'one', 'two', 'three', 'four', 'slalom', 'sShape', 'curve', 'stopgo', 'turns', 'town', 'festival'];
/** What the therapist can pick as a layout override (the other courses belong to a stage). */
export const SELECTABLE_COURSES: readonly CourseId[] = ['straight', 'one', 'two', 'three', 'four', 'slalom', 'sShape', 'curve'];

interface RawCp {
  /** Absolute point, or an offset from `cone` when `cone` is set (the star then travels with its cone). */
  p: Pt;
  cone?: number;
  /** Optional stars are dropped when the therapist chooses fewer checkpoints. */
  opt?: boolean;
}

export interface CourseDef {
  id: CourseId;
  nameAr: string;
  start: Pt;
  cones: Pt[];
  cps: RawCp[];
}

const P = (x: number, y: number): Pt => [x, y];

/** Alternating slalom: cones on the centre line, the route passes them on alternating sides. */
function weave(n: number, x0: number, x1: number, amp: number, opts: { mids?: boolean; rejoin?: boolean; finish?: Pt; start?: Pt }): Pick<CourseDef, 'cones' | 'cps' | 'start'> {
  const cones: Pt[] = [];
  const cps: RawCp[] = [];
  for (let i = 0; i < n; i++) cones.push(P(x0 + ((x1 - x0) * i) / (n - 1), 0));
  for (let i = 0; i < n; i++) {
    cps.push({ cone: i, p: P(0, i % 2 === 0 ? -amp : amp) });
    if (opts.mids && i < n - 1) cps.push({ p: P((cones[i][0] + cones[i + 1][0]) / 2, 0), opt: true });
  }
  if (opts.rejoin) cps.push({ p: P(x1 + 2.6, 0), opt: true });
  cps.push({ p: opts.finish ?? P(7.1, 0) });
  return { cones, cps, start: opts.start ?? P(-7.1, 0) };
}

export const COURSES: Record<CourseId, CourseDef> = {
  straight: { id: 'straight', nameAr: 'مسار مستقيم', start: P(-6.9, 0), cones: [], cps: [{ p: P(-0.3, 0), opt: true }, { p: P(6.4, 0) }] },
  one: {
    id: 'one',
    nameAr: 'مخروط واحد',
    start: P(-6.9, -2.7),
    cones: [P(2.6, -0.7)],
    cps: [{ p: P(-1.8, -2.7), opt: true }, { cone: 0, p: P(2.0, -2.0) }, { p: P(4.6, 3.0) }],
  },
  two: { id: 'two', nameAr: 'مخروطان', ...weave(2, -2.2, 2.2, 1.8, { rejoin: true }) },
  three: { id: 'three', nameAr: 'ثلاثة أقماع', ...weave(3, -3.9, 3.9, 1.8, {}) },
  four: { id: 'four', nameAr: 'أربعة أقماع', ...weave(4, -4.8, 4.8, 1.95, {}) },
  slalom: { id: 'slalom', nameAr: 'سلالوم بسيط', ...weave(5, -5.2, 5.2, 1.9, { start: P(-7.3, 0), finish: P(7.3, 0) }) },
  sShape: {
    id: 'sShape',
    nameAr: 'مسار على شكل S',
    start: P(-7.1, 0),
    cones: [P(-4.4, 0), P(0, 0), P(4.4, 0)],
    cps: [
      { cone: 0, p: P(0, 2.5) },
      { p: P(-2.2, 0), opt: true },
      { cone: 1, p: P(0, -2.5) },
      { p: P(2.2, 0), opt: true },
      { cone: 2, p: P(0, 2.5) },
      { p: P(7.0, -0.4) },
    ],
  },
  curve: {
    id: 'curve',
    nameAr: 'مسار منحنٍ',
    start: P(-7.0, -3.0),
    cones: [P(-2.4, 2.1), P(4.1, -0.8)],
    cps: [
      { p: P(-4.0, -1.8), opt: true },
      { cone: 0, p: P(1.4, -1.5) },
      { p: P(2.0, 2.4) },
      { cone: 1, p: P(1.0, 1.9) },
      { p: P(6.8, -2.0) },
    ],
  },
  stopgo: { id: 'stopgo', nameAr: 'توقّف وانطلاق', ...weave(3, -3.9, 3.9, 1.8, { mids: true }) },
  turns: {
    id: 'turns',
    nameAr: 'نقاط دوران متعددة',
    start: P(-7.0, -3.0),
    cones: [P(-1.4, -1.1), P(2.7, -0.6)],
    cps: [{ p: P(-3.4, -3.0) }, { p: P(-3.4, 0.9) }, { p: P(0.6, 0.9) }, { p: P(0.6, -2.7) }, { p: P(4.9, -2.7) }, { p: P(4.9, 3.1) }],
  },
  town: {
    id: 'town',
    nameAr: 'شوارع المدينة',
    start: P(-7.2, -2.8),
    cones: [P(-1.5, -0.6), P(2.5, 0.5), P(-5.3, 1.2)],
    cps: [{ p: P(-3.7, -2.8) }, { p: P(-3.7, 1.7) }, { p: P(0.5, 1.7) }, { p: P(0.5, -1.7) }, { p: P(4.6, -1.7) }, { p: P(4.6, 3.1) }],
  },
  festival: {
    id: 'festival',
    nameAr: 'درب الاحتفال',
    start: P(-7.3, -1.2),
    cones: [P(-5.4, 0.1), P(-1.6, 0), P(2.0, -0.2), P(5.4, 0.3)],
    cps: [
      { cone: 0, p: P(0.2, 2.7) },
      { p: P(-3.5, 0.1), opt: true },
      { cone: 1, p: P(0.0, -2.7) },
      { p: P(0.2, 0.1), opt: true },
      { cone: 2, p: P(0.0, 2.7) },
      { p: P(3.7, 0.0), opt: true },
      { cone: 3, p: P(0.0, -2.7) },
      { p: P(7.2, 0.2) },
    ],
  },
};

export interface Frame {
  rot: 0 | 90 | 180 | 270;
  mirror: boolean;
  /** Fit scale along the base x (walking) and base y (sideways) axes; only ever < 1, and only on the axis that would not fit. */
  sx: number;
  sy: number;
  /** Centre of the base layout (rotation pivot). */
  c0: Pt;
  toFinal(p: Pt): Pt;
  toBase(p: Pt): Pt;
}

export function makeFrame(rot: 0 | 90 | 180 | 270, mirror: boolean, sx: number, sy: number, c0: Pt): Frame {
  const th = (rot * Math.PI) / 180;
  const cs = Math.round(Math.cos(th));
  const sn = Math.round(Math.sin(th));
  return {
    rot, mirror, sx, sy, c0,
    toFinal(p) {
      const x = sx * (p[0] - c0[0]);
      const y = sy * (mirror ? -1 : 1) * (p[1] - c0[1]);
      return [x * cs - y * sn, x * sn + y * cs];
    },
    toBase(p) {
      const bx = p[0] * cs + p[1] * sn;
      const by = -p[0] * sn + p[1] * cs;
      return [bx / sx + c0[0], ((mirror ? -1 : 1) * by) / sy + c0[1]];
    },
  };
}

export interface PlanConfig {
  rot: 0 | 90 | 180 | 270;
  mirror: boolean;
  width: number;
  spacing: number;
  density: 0 | 1 | 2;
  /** Safe inset (percent of the display) from the shared projection profile; 6 when no profile is chosen. */
  inset: number;
  cones: Record<string, Pt>;
  cpPos: Record<string, Pt>;
  start: Pt | null;
  finish: Pt | null;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = { rot: 0, mirror: false, width: 3.2, spacing: 1, density: 1, inset: 6, cones: {}, cpPos: {}, start: null, finish: null };

export interface Plan {
  course: CourseId;
  frame: Frame;
  /** Final-frame points. */
  start: Pt;
  cones: Pt[];
  cps: Pt[];
  kinds: CpKind[];
  /** Alternate position of each checkpoint, used only by route events; null when no safe alternate exists. */
  alts: (Pt | null)[];
  /** base checkpoint index -> final index (-1 = dropped by the "fewer checkpoints" setting). */
  baseToFinal: number[];
  /** Drawn corridor width after the cone safety margin was applied. */
  width: number;
  warnings: string[];
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Centripetal Catmull-Rom through the points, sampled densely. Corners round off instead of looping. */
export function sampleSpline(pts: Pt[], perSeg = 14): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [];
  const ext: Pt[] = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts, [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.max(1e-6, dist(p0, p1)));
    const t2 = t1 + Math.sqrt(Math.max(1e-6, dist(p1, p2)));
    const t3 = t2 + Math.sqrt(Math.max(1e-6, dist(p2, p3)));
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / perSeg;
      const m = (a: Pt, b: Pt, ta: number, tb: number): Pt => lerp(a, b, (t - ta) / (tb - ta));
      const a1 = m(p0, p1, t0, t1), a2 = m(p1, p2, t1, t2), a3 = m(p2, p3, t2, t3);
      const b1 = m(a1, a2, t0, t2), b2 = m(a2, a3, t1, t3);
      out.push(m(b1, b2, t1, t2));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function minDistToPoints(poly: Pt[], pts: Pt[]): number {
  let best = Infinity;
  for (const p of poly) for (const q of pts) best = Math.min(best, dist(p, q));
  return best;
}

const inArea = (p: Pt, inset: number) => {
  const mx = (AREA_W * inset) / 100, my = (AREA_H * inset) / 100;
  return Math.abs(p[0]) <= AREA_W / 2 - mx + 1e-6 && Math.abs(p[1]) <= AREA_H / 2 - my + 1e-6;
};

/** Pushes a point away from any cone that is closer than the safe margin. Returns the (possibly moved) point. */
function keepAwayFromCones(p: Pt, cones: Pt[]): { p: Pt; moved: boolean } {
  let q = p;
  let moved = false;
  for (let pass = 0; pass < 3; pass++) {
    for (const c of cones) {
      const d = dist(q, c);
      if (d < CONE_SAFE) {
        const ux = d > 1e-6 ? (q[0] - c[0]) / d : 0;
        const uy = d > 1e-6 ? (q[1] - c[1]) / d : 1;
        q = [c[0] + ux * (CONE_SAFE + 0.05), c[1] + uy * (CONE_SAFE + 0.05)];
        moved = true;
      }
    }
  }
  return { p: q, moved };
}

/** A safe alternate for checkpoint `cur` between `prev` and `next`: the mirror image across the chord, else a sideways shift. */
function alternate(prev: Pt, cur: Pt, next: Pt, cones: Pt[], others: Pt[], inset: number): Pt | null {
  const dx = next[0] - prev[0], dy = next[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const side = (cur[0] - prev[0]) * nx + (cur[1] - prev[1]) * ny;
  const base = lerp(prev, next, clamp(((cur[0] - prev[0]) * dx + (cur[1] - prev[1]) * dy) / (len * len), 0.2, 0.8));
  const mirrored: Pt = [base[0] - nx * side, base[1] - ny * side];
  const shifted = (s: number): Pt => [cur[0] + nx * s, cur[1] + ny * s];
  const candidates: Pt[] = [mirrored, shifted(2.3), shifted(-2.3), shifted(1.6), shifted(-1.6)];
  for (const c of candidates) {
    if (dist(c, cur) < 1.4) continue;
    if (!inArea(c, inset)) continue;
    if (cones.some((k) => dist(c, k) < CONE_SAFE + 0.15)) continue;
    if (others.some((o) => dist(c, o) < 1.4)) continue;
    // the turn into / out of the alternate must stay gentle (never a hairpin)
    const h1 = Math.atan2(c[1] - prev[1], c[0] - prev[0]);
    const h2 = Math.atan2(next[1] - c[1], next[0] - c[0]);
    let dh = Math.abs(h2 - h1);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    if (dh > (140 * Math.PI) / 180) continue;
    return c;
  }
  return null;
}

/** Everything geometric about a stage's course, derived deterministically from the stage's course and the therapist's settings. */
export function buildPlan(courseId: CourseId, cfg: PlanConfig): Plan {
  const def = COURSES[courseId];
  const warnings: string[] = [];
  const sx = clamp(cfg.spacing, 0.7, 1.3);

  // ---- base frame ----
  const baseCones: Pt[] = def.cones.map((c, i) => cfg.cones[String(i)] ?? [c[0] * sx, c[1]]);
  const resolveCp = (cp: RawCp, i: number): Pt => {
    const o = cfg.cpPos[String(i)];
    if (o) return o;
    if (cp.cone !== undefined) {
      const c = baseCones[cp.cone];
      return [c[0] + cp.p[0], c[1] + cp.p[1]];
    }
    return [cp.p[0] * sx, cp.p[1]];
  };
  const baseStart: Pt = cfg.start ?? [def.start[0], def.start[1]];
  const rawCps = def.cps.map(resolveCp);
  const lastIdx = rawCps.length - 1;
  if (cfg.finish) rawCps[lastIdx] = cfg.finish;

  // ---- fit transform (stable while the therapist drags: it only depends on the un-edited layout) ----
  const ref: Pt[] = [def.start, ...def.cones.map((c) => [c[0] * sx, c[1]] as Pt), ...def.cps.map((cp) => (cp.cone !== undefined ? ([def.cones[cp.cone][0] * sx + cp.p[0], def.cones[cp.cone][1] + cp.p[1]] as Pt) : ([cp.p[0] * sx, cp.p[1]] as Pt)))];
  const xs = ref.map((p) => p[0]), ys = ref.map((p) => p[1]);
  const c0: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const w0 = Math.max(...xs) - Math.min(...xs), h0 = Math.max(...ys) - Math.min(...ys);
  const swap = cfg.rot === 90 || cfg.rot === 270;
  const inset = clamp(cfg.inset, 3, 20);
  const usableW = AREA_W * (1 - (2 * inset) / 100), usableH = AREA_H * (1 - (2 * inset) / 100);
  // fit each base axis on its own: a long course turned sideways is squeezed ALONG the walking axis only, so the sideways
  // distance between a cone and its star (the thing the child needs for a comfortable turn) is not shrunk with it
  const alongLimit = swap ? usableH : usableW;
  const sideLimit = swap ? usableW : usableH;
  const frame = makeFrame(cfg.rot, cfg.mirror, Math.min(1, alongLimit / Math.max(1, w0)), Math.min(1, sideLimit / Math.max(1, h0)), c0);
  const cones = baseCones.map((c) => frame.toFinal(c));

  // ---- checkpoint density ----
  // optional stars are dropped on request ("fewer checkpoints") and also when the orientation squeezes them against a cone
  const keep = def.cps.map((cp, i) => {
    if (i === lastIdx || !cp.opt) return true;
    if (cfg.density === 0) return false;
    return !cones.some((c) => dist(frame.toFinal(rawCps[i]), c) < CONE_SAFE + 0.1);
  });
  const baseToFinal: number[] = [];
  const basePts: Pt[] = [];
  let prevPoint: Pt = baseStart;
  def.cps.forEach((_, i) => {
    if (!keep[i]) {
      baseToFinal.push(-1);
      return;
    }
    if (cfg.density === 2 && dist(frame.toFinal(prevPoint), frame.toFinal(rawCps[i])) > 3.8) {
      const mid = lerp(prevPoint, rawCps[i], 0.5);
      if (!cones.some((c) => dist(frame.toFinal(mid), c) < CONE_SAFE + 0.1)) basePts.push(mid);
    }
    baseToFinal.push(basePts.length);
    basePts.push(rawCps[i]);
    prevPoint = rawCps[i];
  });

  // ---- final frame ----
  const start = frame.toFinal(baseStart);
  let cps = basePts.map((p) => frame.toFinal(p));
  const kinds: CpKind[] = cps.map((_, i) => (i === cps.length - 1 ? 'finish' : 'go'));

  // safe margins: no star on or beside a physical cone, and everything inside the safe area
  cps = cps.map((p, i) => {
    const r = keepAwayFromCones(p, cones);
    if (r.moved) warnings.push(`نجمة ${i + 1} قريبة من مخروط فأُبعدت قليلًا`);
    if (!inArea(r.p, inset)) warnings.push(`نجمة ${i + 1} خارج حدود الأمان`);
    return r.p;
  });
  const s2 = keepAwayFromCones(start, cones);
  if (s2.moved) warnings.push('علامة البداية قريبة من مخروط');
  cones.forEach((c, i) => {
    if (!inArea(c, 0)) warnings.push(`المخروط ${i + 1} خارج منطقة العرض`);
  });

  // alternates for route events
  const alts: (Pt | null)[] = cps.map((cp, i) => {
    if (i >= cps.length - 1) return null; // the finish never moves
    const prev = i === 0 ? s2.p : cps[i - 1];
    const next = cps[i + 1];
    return alternate(prev, cp, next, cones, [s2.p, ...cps.filter((_, j) => j !== i)], inset);
  });

  // corridor width: never draw the corridor over a cone
  const path = sampleSpline([s2.p, ...cps]);
  const gap = cones.length ? minDistToPoints(path, cones) : Infinity;
  if (cones.length && gap < CONE_SAFE) warnings.push('مخروط قريب من المسار: حرّكه بعيدًا عن الممر');
  const width = clamp(Math.min(cfg.width, 2 * (gap - CORRIDOR_GAP)), 1.0, 5);

  return { course: courseId, frame, start: s2.p, cones, cps, kinds, alts, baseToFinal, width, warnings };
}

/** The route the child walks, given which checkpoints were swapped for their alternates. */
export function routePoints(plan: Plan, variant: Record<number, 0 | 1>): Pt[] {
  return [plan.start, ...plan.cps.map((cp, i) => (variant[i] === 1 && plan.alts[i] ? (plan.alts[i] as Pt) : cp))];
}

export type TurnDir = 'straight' | 'left' | 'right';
/** Turn needed to go from heading a->b to heading b->c, as the walking child sees it (left/right of travel). */
export function turnAt(a: Pt, b: Pt, c: Pt, thresholdDeg = 28): TurnDir {
  const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = h2 - h1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) < (thresholdDeg * Math.PI) / 180) return 'straight';
  return d > 0 ? 'left' : 'right';
}

export const polylineLength = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
