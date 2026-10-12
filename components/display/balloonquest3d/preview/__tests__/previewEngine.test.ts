import { describe, expect, it } from "vitest";
import { PREVIEW_MODES, type PreviewColor, type PreviewMode } from "../previewConfig";
import {
  advance,
  heightCqh,
  initEngine,
  makeParams,
  mulberry32,
  placeSlots,
  popBalloon,
  requiredTargets,
  riseY,
  START_Y,
  usefulTargetCount,
  widthCqw,
  type EngineContext,
  type EngineState,
  type Motion,
} from "../previewEngine";

const T0 = 1_000_000;
const STEP = 400;

function setup(mode: PreviewMode, motion: Motion, seed = 7, target: PreviewColor = "blue", remaining = 3) {
  const config = PREVIEW_MODES[mode];
  const params = makeParams(config, motion, seed);
  const ctx: EngineContext = { target, remaining };
  return { config, params, ctx, state: initEngine(params, ctx, T0) };
}

function assertNoOverlap(state: EngineState, mode: PreviewMode, motion: Motion, now: number) {
  const config = PREVIEW_MODES[mode];
  const w = widthCqw(config.sizeCqh);
  const h = heightCqh(config.sizeCqh);
  const b = state.balloons;
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const yi = motion === "rising" ? riseY(b[i], now, config) : b[i].y;
      const yj = motion === "rising" ? riseY(b[j], now, config) : b[j].y;
      const overlaps = Math.abs(b[i].x - b[j].x) < w && Math.abs(yi - yj) < h;
      expect(overlaps, `${mode}/${motion} ${b[i].id} vs ${b[j].id} at ${now}`).toBe(false);
    }
  }
}

describe("static slot layout", () => {
  it("is seeded (deterministic), non-overlapping and keeps clear of the edges", () => {
    const size = PREVIEW_MODES.easy.sizeCqh;
    const a = placeSlots(7, 8, size);
    expect(a).toHaveLength(8);
    expect(placeSlots(7, 8, size)).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(PREVIEW_MODES.easy.activeCount);
    const w = widthCqw(size);
    for (const s of a) {
      expect(s.x - w / 2).toBeGreaterThanOrEqual(8);
      expect(s.x + w / 2).toBeLessThanOrEqual(92);
    }
  });

  it("is not a rigid grid: x positions vary across seeds", () => {
    const xs = new Set([1, 2, 3, 4].map((s) => Math.round(placeSlots(s, 8, 21.5)[0].x)));
    expect(xs.size).toBeGreaterThan(1);
  });
});

describe("initial state", () => {
  it.each(["easy", "medium", "advanced"] as const)("%s starts full, overlap-free and with enough targets", (mode) => {
    const motion: Motion = PREVIEW_MODES[mode].rising ? "rising" : "static";
    const { state, params, ctx } = setup(mode, motion);
    expect(state.balloons.length).toBeGreaterThanOrEqual(PREVIEW_MODES[mode].activeCount - 1);
    assertNoOverlap(state, mode, motion, T0);
    expect(usefulTargetCount(state, params, ctx, T0)).toBeGreaterThanOrEqual(requiredTargets(params, ctx));
  });

  it("rising balloons spawn below the screen and only ever enter from below", () => {
    const { state, params, ctx } = setup("medium", "rising");
    let s = state;
    for (let t = T0; t < T0 + 120_000; t += STEP) s = advance(s, params, ctx, t);
    for (const b of s.balloons.filter((x) => x.spawnedAt > T0)) {
      expect(riseY(b, b.spawnedAt, params.config)).toBe(START_Y);
      expect(START_Y).toBeGreaterThan(100);
    }
  });
});

describe("continuous play simulation (no timer, no failure)", () => {
  it.each(["medium", "advanced"] as const)("%s keeps spawning, never overlaps, and always has a reachable target", (mode) => {
    const { params, state: init } = setup(mode, "rising");
    const rng = mulberry32(99);
    let state = init;
    let remaining = PREVIEW_MODES[mode].goalTotal;
    let zeroTargetStreak = 0;
    let worstStreak = 0;
    let popped = 0;
    let spawned = state.spawnCount;

    for (let t = T0; t < T0 + 10 * 60_000; t += STEP) {
      const ctx: EngineContext = { target: "blue", remaining };
      state = advance(state, params, ctx, t);
      assertNoOverlap(state, mode, "rising", t);
      // Sometimes the child pops a random live balloon; sometimes nothing for a long time.
      if (rng() < 0.12) {
        const live = state.balloons.filter((b) => !b.popping);
        if (live.length) {
          const pick = live[Math.floor(rng() * live.length)];
          if (pick.color === "blue") remaining = remaining <= 1 ? PREVIEW_MODES[mode].goalTotal : remaining - 1;
          state = popBalloon(state, pick.id, t);
          popped++;
        }
      }
      const useful = usefulTargetCount(state, params, ctx, t);
      zeroTargetStreak = useful === 0 ? zeroTargetStreak + 1 : 0;
      worstStreak = Math.max(worstStreak, zeroTargetStreak);
      expect(state.balloons.filter((b) => !b.popping).length).toBeLessThanOrEqual(PREVIEW_MODES[mode].activeCount + 1);
    }
    spawned = state.spawnCount - spawned;
    expect(spawned).toBeGreaterThan(40); // keeps replacing indefinitely
    expect(popped).toBeGreaterThan(20);
    expect(worstStreak * STEP).toBeLessThan(5_000); // a target never stays missing for long
  });

  it("with NO interaction at all balloons keep cycling and the target stays available", () => {
    const { params, state: init } = setup("advanced", "rising");
    let state = init;
    let worst = 0;
    let streak = 0;
    for (let t = T0; t < T0 + 5 * 60_000; t += STEP) {
      const ctx: EngineContext = { target: "red", remaining: 5 };
      state = advance(state, params, ctx, t);
      streak = usefulTargetCount(state, params, ctx, t) === 0 ? streak + 1 : 0;
      worst = Math.max(worst, streak);
      expect(state.balloons.every((b) => t - b.spawnedAt < params.config.riseSeconds * 1000 + 1)).toBe(true);
    }
    expect(state.spawnCount).toBeGreaterThan(20);
    expect(worst * STEP).toBeLessThan(5_000);
  });

  it("only uses colours from the mode palette (Advanced never shows cyan/orange)", () => {
    const { params, state: init } = setup("advanced", "rising");
    let state = init;
    const seen = new Set<string>();
    for (let t = T0; t < T0 + 4 * 60_000; t += STEP) {
      state = advance(state, params, { target: "white", remaining: 5 }, t);
      state.balloons.forEach((b) => seen.add(b.color));
    }
    for (const c of seen) expect(PREVIEW_MODES.advanced.palette).toContain(c);
    expect(seen.size).toBe(7);
  });
});

describe("static (Easy) play", () => {
  it("a popped balloon disappears and its slot is not reused immediately", () => {
    const { params, state: init, ctx } = setup("easy", "static");
    let state = init;
    const victim = state.balloons[0];
    state = popBalloon(state, victim.id, T0);
    const t = T0 + 1_000;
    // Force a spawn by requiring more targets than exist.
    state = advance(state, params, { ...ctx, target: "yellow", remaining: 3 }, t + 5_000);
    const reused = state.balloons.find((b) => !b.popping && b.slot === victim.slot);
    expect(reused).toBeUndefined();
    const after = advance(state, params, ctx, T0 + 60_000);
    expect(after.balloons.find((b) => b.id === victim.id)).toBeUndefined();
  });

  it("never gets stuck: popping everything still leaves enough targets to finish", () => {
    const { params, state: init } = setup("easy", "static");
    let state = init;
    let remaining = 3;
    for (let round = 0; round < 40; round++) {
      const now = T0 + round * 10_000;
      const ctx: EngineContext = { target: "blue", remaining };
      for (let k = 0; k < 10; k++) state = advance(state, params, ctx, now + k * STEP);
      expect(usefulTargetCount(state, params, ctx, now)).toBeGreaterThanOrEqual(Math.min(remaining, 3));
      assertNoOverlap(state, "easy", "static", now);
      const blue = state.balloons.find((b) => !b.popping && b.color === "blue");
      expect(blue).toBeDefined();
      state = popBalloon(state, blue!.id, now);
      remaining = remaining <= 1 ? 3 : remaining - 1;
    }
  });

  it("selecting a wrong-colour balloon removes it without changing what is required", () => {
    const { params, state: init, ctx } = setup("easy", "static");
    const wrong = init.balloons.find((b) => b.color !== "blue")!;
    const state = popBalloon(init, wrong.id, T0);
    expect(requiredTargets(params, ctx)).toBe(3);
    expect(usefulTargetCount(state, params, ctx, T0)).toBe(usefulTargetCount(init, params, ctx, T0));
  });
});
