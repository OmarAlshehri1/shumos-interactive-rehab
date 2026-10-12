/**
 * The nine-stage curriculum and its deterministic target-pattern generators.
 *
 * Difficulty rises through pattern complexity and planning, not speed: speed is a therapist setting and never part of a
 * stage. Every generator is a pure function of (stage, seed, config), so Control and tests produce identical streams.
 * Two-foot patterns only ever use neighbouring lanes (or, when the therapist allows it, one lane apart), with the left
 * foot always on the left of the right foot: the game cannot ask for a crossed or wide stance.
 */
import { Difficulty } from '@/lib/game';
import { activeLanes, type Config } from './config';

/** One beat of game time. Music and every arrival lie on this grid (at speed 1 that is 80 BPM). */
export const BEAT_MS = 750;

export type Foot = 'L' | 'R' | 'ANY' | 'BOTH';
export type TargetRole = 'move' | 'stay' | 'hold' | 'jump';
export type StepKind = 'single' | 'both' | 'dual' | 'split' | 'hold' | 'jump';

export interface Target {
  /** Lane id 0..3 (colour identity). */
  lane: number;
  foot: Foot;
  role: TargetRole;
}

export interface Item {
  kind: StepKind;
  targets: Target[];
  /** Beats between the previous arrival and this one (already scaled by the spacing setting). */
  gapB: number;
  holdMs: number;
  /** [group, position, length] for steps that belong to a short sequence, else null. */
  seq: [number, number, number] | null;
}

export interface StageDef {
  index: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  nameAr: string;
  nameEn: string;
  goalAr: string;
  /** Number of exercises (targets groups) in the stage, before any therapist repeat. */
  count: number;
  /** How long a target takes to travel from the far end to the line, in beats. Longer = more preview. */
  travelBeats: number;
}

const def = (index: number, name: [string, string], goalAr: string, count: number, travelBeats: number): StageDef => ({
  index, level: (Math.floor(index / 3) + 1) as 1 | 2 | 3, stage: ((index % 3) + 1) as 1 | 2 | 3, nameAr: name[0], nameEn: name[1], goalAr, count, travelBeats,
});

export const STAGES: readonly StageDef[] = [
  def(0, ['أول ضوء', 'First Light'], 'أهداف كبيرة بلون واحد في كل مرة', 8, 5),
  def(1, ['تبديل الألوان', 'Color Switch'], 'الانتقال بين الألوان', 10, 5),
  def(2, ['مسار النيون', 'Neon Path'], 'تتابعات قصيرة بين مسارين متجاورين', 12, 5),
  def(3, ['ضوءان معًا', 'Twin Lights'], 'القدمان معًا على مسارين متجاورين', 8, 6),
  def(4, ['إيقاع منقسم', 'Split Rhythm'], 'قدم تثبت وقدم تتحرك', 10, 6),
  def(5, ['أنماط الألوان', 'Color Patterns'], 'تتابعات تتكرر: خطوة وخطوتان', 12, 6),
  def(6, ['طاقة الثبات', 'Energy Hold'], 'ثبات قصير بتأكيد المعالج', 6, 6),
  def(7, ['تدفق مزدوج', 'Dual Flow'], 'تناوب الخطوة الواحدة والخطوتين', 12, 6),
  def(8, ['بطولة النيون', 'Neon Championship'], 'كل أنواع الحركة معًا', 16, 6),
];

export const LEVELS = [
  { level: 1, nameAr: 'مبتدئ الألوان', nameEn: 'Color Beginner', difficulty: Difficulty.EASY },
  { level: 2, nameAr: 'تحدي القدمين', nameEn: 'Dual Foot Challenge', difficulty: Difficulty.MEDIUM },
  { level: 3, nameAr: 'سيد الإيقاع', nameEn: 'Rhythm Master', difficulty: Difficulty.ADVANCED },
] as const;

export const difficultyOf = (stage: number): Difficulty => LEVELS[Math.floor(stage / 3)].difficulty;

/** Seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ctx {
  rnd: () => number;
  lanes: readonly number[];
  n: number;
  cfg: Config;
  /** Stance width in lane positions. */
  w: number;
  canDual: boolean;
  canBoth: boolean;
  canSplit: boolean;
  canHold: boolean;
  sideStart: number;
}

const scale = (base: number, cfg: Config, min = 2) => Math.max(min, Math.round(base * cfg.spacing));

function makeCtx(seed: number, stage: number, cfg: Config): Ctx {
  const lanes = activeLanes(cfg);
  const n = lanes.length;
  const w = cfg.stanceWidth === 2 && n >= 3 ? 2 : 1;
  const bothFeet = cfg.limbs === 'both';
  const rnd = rng(seed * 2654435761 + stage * 7919 + 17);
  return {
    rnd, lanes, n, cfg, w,
    canDual: bothFeet && cfg.allow.dual && n > w,
    canBoth: bothFeet && cfg.allow.both,
    canSplit: bothFeet && cfg.allow.split && n > w,
    canHold: cfg.allow.hold,
    sideStart: rnd() < 0.5 ? 0 : 1,
  };
}

const T = (ctx: Ctx, pos: number, foot: Foot, role: TargetRole = 'move'): Target => ({ lane: ctx.lanes[Math.max(0, Math.min(ctx.n - 1, pos))], foot, role });

/** Foot for a single-foot target: the permitted limb, alternating sides, or "either foot". */
function singleFoot(ctx: Ctx, j: number, sided: boolean): Foot {
  if (ctx.cfg.limbs === 'left') return 'L';
  if (ctx.cfg.limbs === 'right') return 'R';
  return sided ? ((j + ctx.sideStart) % 2 === 0 ? 'L' : 'R') : 'ANY';
}

const single = (ctx: Ctx, pos: number, j: number, sided: boolean, gapB: number, seq: Item['seq'] = null): Item => ({
  kind: 'single', targets: [T(ctx, pos, singleFoot(ctx, j, sided))], gapB, holdMs: 0, seq,
});

function dual(ctx: Ctx, p: number, gapB: number, seq: Item['seq'] = null): Item {
  const left = Math.max(0, Math.min(ctx.n - 1 - ctx.w, p));
  return { kind: 'dual', targets: [T(ctx, left, 'L'), T(ctx, left + ctx.w, 'R')], gapB, holdMs: 0, seq };
}

function both(ctx: Ctx, pos: number, gapB: number, seq: Item['seq'] = null): Item {
  return { kind: 'both', targets: [T(ctx, pos, 'BOTH')], gapB, holdMs: 0, seq };
}

function jump(ctx: Ctx, pos: number, gapB: number): Item {
  return { kind: 'jump', targets: [T(ctx, pos, 'BOTH', 'jump')], gapB, holdMs: 0, seq: null };
}

function hold(ctx: Ctx, pos: number, j: number, gapB: number): Item {
  return { kind: 'hold', targets: [T(ctx, pos, singleFoot(ctx, j, ctx.cfg.sided), 'hold')], gapB, holdMs: ctx.cfg.holdMs, seq: null };
}

/** Split: one foot stays where it is (hollow marker), the other moves to the neighbouring lane. Alternates sides. */
function split(ctx: Ctx, j: number, gapB: number): Item {
  let a = Math.max(0, Math.min(ctx.n - 1, ctx.cfg.anchor));
  let rightOpen = a + ctx.w <= ctx.n - 1;
  const leftOpen = a - ctx.w >= 0;
  if (!rightOpen && !leftOpen) {
    a = 0;
    rightOpen = true;
  }
  const rightMoves = j % 2 === 0 ? rightOpen : !(a - ctx.w >= 0) && rightOpen;
  if (rightMoves) return { kind: 'split', targets: [T(ctx, a, 'L', 'stay'), T(ctx, a + ctx.w, 'R', 'move')], gapB, holdMs: 0, seq: null };
  return { kind: 'split', targets: [T(ctx, a - ctx.w, 'L', 'move'), T(ctx, a, 'R', 'stay')], gapB, holdMs: 0, seq: null };
}

/** The adjacent pair used for short paths: centred where possible. */
function pathPair(ctx: Ctx): [number, number] {
  const a = ctx.n >= 4 ? 1 : 0;
  return [a, Math.min(ctx.n - 1, a + 1)];
}

function pickDifferent(ctx: Ctx, prev: number, max = ctx.n): number {
  if (max <= 1) return 0;
  let p = Math.floor(ctx.rnd() * max);
  if (p === prev) p = (p + 1 + Math.floor(ctx.rnd() * (max - 1))) % max;
  return p;
}

/** Same exercise, but a kind the therapist has switched off becomes a simple single-foot step. */
function ensureAllowed(ctx: Ctx, it: Item, j: number): Item {
  const { cfg } = ctx;
  const off =
    (it.kind === 'dual' && !ctx.canDual) || (it.kind === 'both' && !ctx.canBoth) || (it.kind === 'split' && !ctx.canSplit) || (it.kind === 'hold' && !ctx.canHold) || (it.kind === 'jump' && (!cfg.jumping || !ctx.canBoth));
  if (!off) return it;
  const pos = Math.max(0, ctx.lanes.indexOf(it.targets[it.targets.length - 1].lane));
  return { ...single(ctx, pos, j, true, it.gapB, it.seq) };
}

export function genItems(stage: number, seed: number, cfg: Config): Item[] {
  const ctx = makeCtx(seed, stage, cfg);
  const { n, rnd } = ctx;
  const sd = STAGES[stage];
  const items: Item[] = [];
  const g = (b: number, min = 2) => scale(b, cfg, min);
  const sidedSingles = cfg.sided;

  if (stage === 0) {
    // First Light: runs of the same colour, then a switch to a neighbour. Either foot (or the permitted limb).
    const [a, b] = pathPair(ctx);
    let pos = a;
    for (let j = 0; j < sd.count; j++) {
      if (j > 0 && j % 3 === 0) pos = pos === a ? b : a;
      items.push(single(ctx, pos, j, false, g(4, 3)));
    }
  } else if (stage === 1) {
    let prev = -1;
    for (let j = 0; j < sd.count; j++) {
      const pos = pickDifferent(ctx, prev);
      prev = pos;
      items.push(single(ctx, pos, j, sidedSingles, g(3, 3)));
    }
  } else if (stage === 2) {
    // Neon Path: short 3-step sequences along two adjacent lanes.
    const [a, b] = pathPair(ctx);
    const shapes = [[a, b, a], [a, a, b], [b, a, b], [b, b, a]];
    const groups = sd.count / 3;
    for (let q = 0; q < groups; q++) {
      const shape = shapes[(q + Math.floor(rnd() * 2)) % shapes.length];
      shape.forEach((pos, k) => {
        const it = k === 1 && q % 2 === 1 && ctx.canBoth ? both(ctx, pos, g(2), [q, k, 3]) : single(ctx, pos, q * 3 + k, sidedSingles, k === 0 ? g(4, 3) : g(2), [q, k, 3]);
        items.push(it);
      });
    }
  } else if (stage === 3) {
    let prev = -1;
    const slots = Math.max(1, n - ctx.w);
    for (let j = 0; j < sd.count; j++) {
      const p = pickDifferent(ctx, prev, slots);
      prev = p;
      items.push(ctx.canDual ? dual(ctx, p, g(5, 4)) : single(ctx, Math.min(n - 1, p + (j % 2)), j, true, g(5, 4)));
    }
  } else if (stage === 4) {
    for (let j = 0; j < sd.count; j++) items.push(ctx.canSplit ? split(ctx, j, g(4, 3)) : single(ctx, Math.min(n - 1, j % 2), j, true, g(4, 3)));
  } else if (stage === 5) {
    // Color Patterns: a short mixed pattern is shown twice, then a new pattern (sequence recognition).
    const slots = Math.max(1, n - ctx.w);
    for (let q = 0; q < sd.count / 6; q++) {
      const base: Item[] = [];
      for (let k = 0; k < 3; k++) {
        const pos = Math.floor(rnd() * n);
        const mode = k === 1 ? 'dual' : k === 2 && ctx.canBoth ? 'both' : 'single';
        base.push(mode === 'dual' && ctx.canDual ? dual(ctx, Math.floor(rnd() * slots), 2) : mode === 'both' ? both(ctx, pos, 2) : single(ctx, pos, k, true, 2));
      }
      for (let rep = 0; rep < 2; rep++) {
        base.forEach((it, k) => items.push({ ...it, targets: it.targets.map((t) => ({ ...t })), gapB: k === 0 ? g(4, 3) : g(2), seq: [q * 2 + rep, k, 3] }));
      }
    }
  } else if (stage === 6) {
    // Energy Hold: holds with single steps between them, so transitions stay controlled.
    const order: StepKind[] = ['hold', 'single', 'hold', 'hold', 'single', 'hold'];
    let prev = -1;
    order.forEach((kind, j) => {
      const pos = pickDifferent(ctx, prev);
      prev = pos;
      items.push(kind === 'hold' ? hold(ctx, pos, j, g(4, 3)) : single(ctx, pos, j, true, g(3, 3)));
    });
  } else if (stage === 7) {
    let prev = -1;
    const slots = Math.max(1, n - ctx.w);
    for (let j = 0; j < sd.count; j++) {
      if (j % 2 === 0) {
        const p = pickDifferent(ctx, prev, slots);
        prev = p;
        items.push(ctx.canDual ? (cfg.jumping && j % 6 === 4 ? { ...jump(ctx, p, g(4, 3)) } : dual(ctx, p, g(4, 3))) : single(ctx, Math.min(n - 1, p), j, true, g(4, 3)));
      } else items.push(single(ctx, pickDifferent(ctx, -1), j, true, g(3, 3)));
    }
  } else {
    const plan: StepKind[] = ['single', 'dual', 'split', 'single', 'dual', 'hold', 'both', 'dual', 'split', 'single', 'dual', 'hold', 'split', 'dual', 'both', 'single'];
    const slots = Math.max(1, n - ctx.w);
    let prev = -1;
    plan.slice(0, sd.count).forEach((kind, j) => {
      const base = cfg.fast ? 3 : 4;
      const pos = pickDifferent(ctx, prev);
      prev = pos;
      let it: Item;
      if (kind === 'dual') it = cfg.jumping && j % 7 === 4 ? jump(ctx, pos, g(base, 3)) : dual(ctx, Math.floor(rnd() * slots), g(base, 3));
      else if (kind === 'split') it = split(ctx, j, g(base, 3));
      else if (kind === 'hold') it = hold(ctx, pos, j, g(base, 3));
      else if (kind === 'both') it = both(ctx, pos, g(base, 3));
      else it = single(ctx, pos, j, true, g(cfg.fast ? 2 : 3, cfg.fast ? 2 : 3));
      items.push(it);
    });
  }

  const holdBeats = Math.ceil((cfg.holdMs + cfg.graceMs) / BEAT_MS) + 2;
  return items.map((raw, j) => {
    let it = ensureAllowed(ctx, raw, j);
    if (it.kind === 'single' && !cfg.allow.single && ctx.canBoth) it = both(ctx, Math.max(0, ctx.lanes.indexOf(it.targets[0].lane)), it.gapB, it.seq);
    // After a hold the next target waits long enough for the hold (and its start window) to finish.
    if (j > 0 && items[j - 1].kind === 'hold' && it.gapB < holdBeats && ctx.canHold) it = { ...it, gapB: holdBeats };
    return it;
  });
}

export const KIND_LABEL_AR: Record<StepKind, string> = {
  single: 'قدم واحدة',
  both: 'القدمان معًا',
  dual: 'قدم على كل مسار',
  split: 'قدم تثبت وقدم تتحرك',
  hold: 'ثبات',
  jump: 'قفزة (اختيارية)',
};
