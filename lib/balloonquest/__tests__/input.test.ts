import { describe, expect, it } from "vitest";
import { Env } from "./harness";
import { ASPECT, IDENTITY_ORIENTATION, mapToImage, heightCqh, widthCqw } from "../geometry";
import { InputHub } from "../input/hub";
import { KeyboardCursor, keyToAction } from "../input/keyboard";
import { EXPERIMENTAL_MODES, sourcesForMode, STALE_MS, type PointerSample } from "../input/types";
import { LAYOUT_TUNING, resolveStage } from "../stages";
import { selectableBodies } from "../session";
import { DEFAULT_SETTINGS, type InputMode, type SourceId } from "../types";

function begin(mode: InputMode, extra: Record<string, unknown> = {}) {
  const env = new Env({ inputMode: mode, allowNoDisplay: true, ...extra });
  return env;
}
function startWith(env: Env, source: SourceId) {
  const p = env.pointer(source);
  p.moveTo(0.02, 0.02);
  env.run(40);
  expect(env.rt.command({ type: "start" })).toBe(true);
  env.run(80, 16, () => p.heartbeat());
  return p;
}
const goTo = (env: Env, p: ReturnType<Env["pointer"]>, n: { x: number; y: number }) => {
  p.moveTo(n.x, n.y);
  env.run(48, 16, () => p.heartbeat());
};

describe("modes and sources", () => {
  it("maps each mode to exactly its sources; hand/foot/handheld modes are labelled experimental where unverified", () => {
    expect(sourcesForMode("right-hand")).toEqual(["RIGHT_HAND"]);
    expect(sourcesForMode("left-hand")).toEqual(["LEFT_HAND"]);
    expect(sourcesForMode("both-hands")).toEqual(["RIGHT_HAND", "LEFT_HAND"]);
    expect(sourcesForMode("foot")).toEqual(["RIGHT_FOOT", "LEFT_FOOT"]);
    expect(sourcesForMode("handheld")).toEqual(["HANDHELD"]);
    expect(EXPERIMENTAL_MODES).toEqual(expect.arrayContaining(["left-hand", "both-hands", "foot", "handheld"]));
    expect(EXPERIMENTAL_MODES).not.toContain("right-hand");
  });
});

describe("keyboard (development input)", () => {
  it("arrow keys / WASD move, Space/Enter press", () => {
    expect(keyToAction("ArrowLeft")).toEqual({ kind: "move", dx: -1, dy: 0 });
    expect(keyToAction("w")).toEqual({ kind: "move", dx: 0, dy: -1 });
    expect(keyToAction(" ")).toEqual({ kind: "press" });
    expect(keyToAction("x")).toBeNull();
    const k = new KeyboardCursor();
    k.keyDown("ArrowRight");
    for (let i = 0; i < 10; i++) k.step(100);
    expect(k.x).toBeCloseTo(0.95, 1);
    k.keyUp("ArrowRight");
    k.step(500);
    expect(k.x).toBeCloseTo(0.95, 1);
    for (let i = 0; i < 50; i++) k.step(100);
    expect(k.x).toBeLessThanOrEqual(1);
  });

  it("moving the keyboard cursor onto a target balloon selects it exactly once; Space also selects", () => {
    const env = begin("keyboard");
    expect(env.rt.command({ type: "start" })).toBe(true);
    env.run(100);
    const target = env.normOf((b) => env.isTarget(b.id))!;
    env.rt.keyboard.x = target.x;
    env.rt.keyboard.y = target.y;
    env.run(200);
    // Entering by teleport counts as contact only after the first armed frame; hold does nothing further.
    env.rt.press("KEYBOARD");
    env.run(100);
    expect(env.rt.session.stage!.goalDone).toBe(1);
    env.rt.press("KEYBOARD");
    env.run(100);
    expect(env.rt.session.stage!.goalDone).toBe(1);
  });
});

describe.each([
  ["right-hand", "RIGHT_HAND"],
  ["left-hand", "LEFT_HAND"],
  ["handheld", "HANDHELD"],
  ["foot", "RIGHT_FOOT"],
] as const)("%s mode with a simulated %s pointer", (mode, source) => {
  it("entering a target selects once; holding does nothing; leaving re-arms", () => {
    const env = begin(mode);
    const p = startWith(env, source);
    const target = env.normOf((b) => env.isTarget(b.id))!;
    goTo(env, p, target);
    expect(env.rt.session.stage!.goalDone).toBe(1);
    // hold on the (now popped) spot for a while: nothing more
    env.run(500, 16, () => p.heartbeat());
    expect(env.rt.session.stage!.goalDone).toBe(1);
    expect(env.rt.session.selections.every((s) => s.source === source)).toBe(true);
  });

  it("a wrong-colour contact cues gently, keeps the balloon and costs nothing", () => {
    const env = begin(mode);
    const p = startWith(env, source);
    const wrong = env.normOf((b) => !env.isTarget(b.id))!;
    goTo(env, p, wrong);
    const st = env.rt.session.stage!;
    expect(st.goalDone).toBe(0);
    expect(st.wrongCount).toBe(1);
    expect(st.balloons.find((b) => b.id === wrong.id)!.popping).toBe(false);
    expect(env.rt.session.lifecycle).toBe("playing");
  });

  it("ignores pointers from sources that are not enabled for this mode", () => {
    const env = begin(mode);
    startWith(env, source);
    const other: SourceId = source === "HANDHELD" ? "RIGHT_HAND" : "HANDHELD";
    const p = env.pointer(other);
    const target = env.normOf((b) => env.isTarget(b.id))!;
    p.moveTo(target.x, target.y);
    expect(env.rt.hub.rejections().disabled).toBeGreaterThan(0);
    env.run(200);
    expect(env.rt.session.stage!.goalDone).toBe(0);
  });
});

describe("both hands (experimental, simulated only)", () => {
  it("either hand can select; a simultaneous contact on the same balloon scores once", () => {
    const env = begin("both-hands");
    const right = startWith(env, "RIGHT_HAND");
    const left = env.pointer("LEFT_HAND");
    left.moveTo(0.98, 0.02);
    env.run(80, 16, () => { right.heartbeat(); left.heartbeat(); });
    const t1 = env.normOf((b) => env.isTarget(b.id))!;
    right.moveTo(t1.x, t1.y);
    left.moveTo(t1.x, t1.y);
    env.run(80, 16, () => { right.heartbeat(); left.heartbeat(); });
    expect(env.rt.session.stage!.goalDone).toBe(1);
    expect(env.rt.session.selections).toHaveLength(1);
    const t2 = env.normOf((b) => env.isTarget(b.id))!;
    left.moveTo(t2.x, t2.y);
    env.run(80, 16, () => { right.heartbeat(); left.heartbeat(); });
    expect(env.rt.session.stage!.goalDone).toBe(2);
    expect(env.rt.session.selections[1].source).toBe("LEFT_HAND");
  });

  it("losing one hand does not pause play while the other is live", () => {
    const env = begin("both-hands");
    const right = startWith(env, "RIGHT_HAND");
    const left = env.pointer("LEFT_HAND");
    left.moveTo(0.9, 0.9);
    env.run(100, 16, () => { right.heartbeat(); left.heartbeat(); });
    env.run(2000, 16, () => right.heartbeat()); // left goes silent
    expect(env.rt.session.lifecycle).toBe("playing");
  });
});

describe("contact boundaries and tolerance", () => {
  const setup = (tolerance: number) => {
    const env = begin("right-hand", { contactTolerance: tolerance });
    const p = startWith(env, "RIGHT_HAND");
    const t = selectableBodies(env.rt.session).find((b) => env.isTarget(b.id))!;
    return { env, p, t };
  };
  const place = (env: Env, p: ReturnType<Env["pointer"]>, t: { cx: number; cy: number; r: number }, offsetFactor: number, tol: number) => {
    // distance from centre = r_base*(1+tol)*offsetFactor, where r_base = body radius without tolerance
    const rBase = t.r / (1 + tol);
    const d = rBase * (1 + tol) * offsetFactor;
    p.moveTo((t.cx + d) / (100 * ASPECT), t.cy / 100);
    env.run(48, 16, () => p.heartbeat());
  };
  it("just outside the contact radius does nothing; just inside selects", () => {
    for (const tol of [0, 0.15, 0.5]) {
      const a = setup(tol);
      place(a.env, a.p, a.t, 1.04, tol);
      expect(a.env.rt.session.stage!.goalDone).toBe(0);
      const b = setup(tol);
      place(b.env, b.p, b.t, 0.96, tol);
      expect(b.env.rt.session.stage!.goalDone).toBe(1);
    }
  });
  it("a larger tolerance makes the same offset a hit", () => {
    const tight = setup(0), loose = setup(0.5);
    const rBase = tight.t.r;
    for (const s of [tight, loose]) {
      s.p.moveTo((s.t.cx + rBase * 1.3) / (100 * ASPECT), s.t.cy / 100);
      s.env.run(48, 16, () => s.p.heartbeat());
    }
    expect(tight.env.rt.session.stage!.goalDone).toBe(0);
    expect(loose.env.rt.session.stage!.goalDone).toBe(1);
  });
});

describe("input loss and recovery", () => {
  it("losing the pointer holds play after a short grace; nothing scores; recovery auto-resumes without a phantom contact", () => {
    const env = begin("right-hand");
    const p = startWith(env, "RIGHT_HAND");
    env.run(200, 16, () => p.heartbeat());
    p.hide();
    env.run(300);
    expect(env.rt.session.lifecycle).toBe("playing"); // grace
    env.run(600);
    expect(env.rt.session.lifecycle).toBe("suspended");
    expect(env.rt.session.suspendReason).toBe("input-lost");
    const t = env.rt.getSimTimeMs();
    env.run(3000);
    expect(env.rt.getSimTimeMs()).toBe(t);
    // Sensor comes back sitting exactly on a target balloon.
    const target = selectableBodies({ ...env.rt.session, lifecycle: "playing" }).find((b) => env.rt.session.stage!.balloons.find((x) => x.id === b.id)!.color === env.rt.session.stage!.target)!;
    p.moveTo(target.cx / (100 * ASPECT), target.cy / 100);
    env.run(600, 16, () => p.heartbeat());
    expect(env.rt.session.lifecycle).toBe("playing");
    expect(env.rt.session.stage!.goalDone).toBe(0); // resting on a balloon is not a fresh contact
    // Leaving and re-entering selects normally.
    p.moveTo(0.02, 0.02);
    env.run(80, 16, () => p.heartbeat());
    p.moveTo(target.cx / (100 * ASPECT), target.cy / 100);
    env.run(80, 16, () => p.heartbeat());
    expect(env.rt.session.stage!.goalDone).toBe(1);
  });

  it("therapist taps work in sensor mode and carry on by hand after the sensor drops out", () => {
    const env = begin("right-hand");
    const p = startWith(env, "RIGHT_HAND");
    env.run(200, 16, () => p.heartbeat());
    p.hide();
    env.run(1000);
    expect(env.rt.session.suspendReason).toBe("input-lost");
    const st = () => env.rt.session.stage!;
    const target = st().balloons.find((b) => b.color === st().target)!;
    expect(env.rt.therapistSelect(target.id)).toBe(true);
    expect(env.rt.session.lifecycle).toBe("playing");
    expect(st().goalDone).toBe(1);
    env.run(5000); // sensor still gone, therapist still tapping: no re-hold
    expect(env.rt.session.lifecycle).toBe("playing");
  });

  it("a pointer that stops streaming (stale) is treated as lost", () => {
    const env = begin("handheld");
    const p = startWith(env, "HANDHELD");
    void p;
    env.run(STALE_MS + 900); // no heartbeats at all
    expect(env.rt.session.lifecycle).toBe("suspended");
    expect(env.rt.session.suspendReason).toBe("input-lost");
  });

  it("cannot start while a sensor mode has no live input; the keyboard needs none", () => {
    const env = begin("right-hand");
    expect(env.rt.command({ type: "start" })).toBe(false);
    expect(env.rt.view().lastRefusal).toContain("إدخال");
    expect(begin("keyboard").rt.command({ type: "start" })).toBe(true);
  });

  it("switching input mode mid-session re-arms cleanly and ignores the old source", () => {
    const env = begin("right-hand");
    const right = startWith(env, "RIGHT_HAND");
    env.rt.command({ type: "settings", patch: { inputMode: "keyboard" } });
    env.run(100);
    expect(env.rt.session.lifecycle).toBe("playing");
    const target = env.normOf((b) => env.isTarget(b.id))!;
    right.moveTo(target.x, target.y); // old source: disabled now
    env.run(200);
    expect(env.rt.session.stage!.goalDone).toBe(0);
  });

  it("pause with the pointer on a balloon: resuming never fires a phantom selection", () => {
    const env = begin("right-hand");
    const p = startWith(env, "RIGHT_HAND");
    const wrongFirst = env.normOf((b) => !env.isTarget(b.id))!;
    p.moveTo(wrongFirst.x, wrongFirst.y);
    env.run(48, 16, () => p.heartbeat());
    const wrongs = env.rt.session.stage!.wrongCount;
    env.rt.command({ type: "pause" });
    env.run(1000, 16, () => p.heartbeat());
    env.rt.command({ type: "resume" });
    env.run(500, 16, () => p.heartbeat());
    expect(env.rt.session.stage!.wrongCount).toBe(wrongs);
  });

  it("a pending recenter primes instead of firing", () => {
    const env = begin("right-hand");
    const p = startWith(env, "RIGHT_HAND");
    const target = env.normOf((b) => env.isTarget(b.id))!;
    env.rt.notePendingRecenter("RIGHT_HAND");
    goTo(env, p, target);
    expect(env.rt.session.stage!.goalDone).toBe(0);
  });
});

describe("hub rejection rules", () => {
  const sample = (over: Partial<PointerSample> = {}): PointerSample => ({ sourceId: "RIGHT_HAND", x: 0.5, y: 0.5, visible: true, seq: 1, atMs: 1000, ...over });
  const hub = () => {
    const h = new InputHub();
    h.setMode("right-hand");
    return h;
  };
  it("rejects invalid, stale, future and out-of-order samples; accepts a restarted sequence only after silence", () => {
    const h = hub();
    expect(h.ingest(sample({ x: NaN }), 1000)).toBe("invalid");
    expect(h.ingest(sample({ seq: -1 }), 1000)).toBe("invalid");
    expect(h.ingest(sample({ atMs: 1000 - STALE_MS - 1 }), 1000)).toBe("stale");
    expect(h.ingest(sample({ atMs: 1200 }), 1000)).toBe("future");
    expect(h.ingest(sample({ seq: 5 }), 1000)).toBe("accepted");
    expect(h.ingest(sample({ seq: 5 }), 1010)).toBe("out-of-order");
    expect(h.ingest(sample({ seq: 4, atMs: 1010 }), 1010)).toBe("out-of-order");
    expect(h.ingest(sample({ seq: 1, atMs: 2000 }), 2000)).toBe("accepted"); // reconnect after >250ms silence
  });
  it("clamps coordinates and expires freshness", () => {
    const h = hub();
    h.ingest(sample({ x: 3, y: -2 }), 1000);
    expect(h.fresh(1000)[0]).toMatchObject({ x: 1, y: 0 });
    expect(h.fresh(1000 + STALE_MS + 1)).toHaveLength(0);
    expect(h.hasLiveInput(1000 + STALE_MS + 1)).toBe(false);
  });
  it("hidden pointers are not fresh", () => {
    const h = hub();
    h.ingest(sample({ visible: false }), 1000);
    expect(h.fresh(1000)).toHaveLength(0);
  });
});

describe("wall / floor mapping and layout", () => {
  it("identity for wall; rotations and mirror are explicit for floor installations", () => {
    expect(mapToImage({ x: 0.2, y: 0.8 })).toEqual({ x: 0.2, y: 0.8 });
    expect(mapToImage({ x: 0.2, y: 0.8 }, { rotateQuarterTurns: 2, mirrorX: false })).toEqual({ x: 1 - 0.2, y: 1 - 0.8 });
    const r1 = mapToImage({ x: 1, y: 0 }, { rotateQuarterTurns: 1, mirrorX: false });
    expect(r1.x).toBeCloseTo(1);
    expect(r1.y).toBeCloseTo(1);
    expect(mapToImage({ x: 0.2, y: 0.4 }, { rotateQuarterTurns: 0, mirrorX: true })).toEqual({ x: 0.8, y: 0.4 });
    expect(IDENTITY_ORIENTATION).toEqual({ rotateQuarterTurns: 0, mirrorX: false });
  });
  it("hub applies a per-source floor orientation to incoming foot samples", () => {
    const h = new InputHub();
    h.setMode("foot");
    h.setOrientation("RIGHT_FOOT", { rotateQuarterTurns: 0, mirrorX: true });
    h.ingest({ sourceId: "RIGHT_FOOT", x: 0.1, y: 0.7, visible: true, seq: 1, atMs: 100 }, 100);
    expect(h.fresh(100)[0]).toMatchObject({ x: 0.9, y: 0.7 });
  });
  it("FLOOR keeps every target inside the safe area (clear of the near edge and the far HUD band) and leaves spare slots for replacements", () => {
    for (let idx = 0; idx < 9; idx++) {
      const env = begin("keyboard", { layout: "FLOOR" });
      env.rt.command({ type: "new-session", difficulty: (["EASY", "MEDIUM", "ADVANCED"] as const)[Math.floor(idx / 3)], stage: ((idx % 3) + 1) as 1 | 2 | 3 });
      env.rt.command({ type: "start" });
      const st = env.rt.session.stage!;
      const t = LAYOUT_TUNING.FLOOR;
      const h = heightCqh(st.spec.sizeCqh);
      const w = widthCqw(st.spec.sizeCqh);
      if (st.spec.motion === "static") {
        expect(st.slots.length).toBeGreaterThanOrEqual(st.spec.activeCount + 2);
        for (const s of st.slots) {
          expect(s.y + h / 2).toBeLessThanOrEqual(t.yBottom + 0.01);
          expect(s.y - h / 2).toBeGreaterThanOrEqual(t.yTop - 0.01);
        }
      }
      for (const b of st.balloons) {
        expect(b.x - w / 2).toBeGreaterThanOrEqual(t.xMargin - 0.01);
        expect(b.x + w / 2).toBeLessThanOrEqual(100 - t.xMargin + 0.01);
      }
      // Rising floor stages are larger and slower than the wall version.
      if (st.spec.motion === "rising") {
        const wall = resolveStage(idx, DEFAULT_SETTINGS);
        expect(st.spec.sizeCqh).toBeGreaterThan(wall.sizeCqh);
        expect(st.spec.riseSeconds).toBeGreaterThan(wall.riseSeconds);
      }
    }
  });
  it("static stages always hold activeCount+2 slots, even with the largest therapist size", () => {
    for (const layout of ["WALL", "FLOOR"] as const) {
      for (const idx of [0, 1, 2]) {
        const env = begin("keyboard", { layout, sizeScale: 1.3, countOffset: 2 });
        env.rt.command({ type: "new-session", difficulty: "EASY", stage: ((idx % 3) + 1) as 1 | 2 | 3 });
        env.rt.command({ type: "start" });
        const st = env.rt.session.stage!;
        expect(st.slots.length).toBeGreaterThanOrEqual(st.spec.activeCount + 2);
        expect(st.spec.sizeCqh).toBeGreaterThanOrEqual(13);
      }
    }
  });
  it("a floor session plays end to end with simulated foot input", () => {
    const env = begin("foot", { layout: "FLOOR" });
    const foot = startWith(env, "LEFT_FOOT");
    for (let i = 0; i < 3; i++) {
      env.run(2500, 16, () => foot.heartbeat()); // lets a replacement target appear when one is needed
      const t = env.normOf((b) => env.isTarget(b.id));
      expect(t).toBeTruthy();
      goTo(env, foot, t!);
      foot.moveTo(0.02, 0.5);
      env.run(48, 16, () => foot.heartbeat());
    }
    expect(env.rt.session.lifecycle).toBe("stage-complete");
    expect(env.rt.session.results[0]).toMatchObject({ status: "completed", correct: 3 });
  });
});
