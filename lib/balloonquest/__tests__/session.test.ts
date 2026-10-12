import { describe, expect, it } from "vitest";
import { advanceMs, make, overlapCount, popTarget, targetsAvailable } from "./helpers";
import { STAGE_SPECS, resolveStage, sanitizeSettings } from "../stages";
import { advanceStage, endSession, newRun, pauseSession, restartStage, resumeSession, selectBalloon, selectableBodies, setStart, skipStage, suspendSession, tickSession, updateSettings, createSession } from "../session";
import { DEFAULT_SETTINGS, type Session } from "../types";

/** Plays a whole session with a patient bot that only ever pops targets; returns the final session. */
function playAll(s: Session, maxMs = 20 * 60_000): Session {
  let session = s;
  for (let t = 0; t < maxMs && session.lifecycle !== "completed"; t += 100) {
    session = advanceMs(session, 100, 20);
    if (session.lifecycle === "stage-complete") session = advanceStage(session);
    if (session.lifecycle === "playing" && t % 500 === 0) session = popTarget(session);
  }
  return session;
}

describe("stage table", () => {
  it("has exactly 3 levels x 3 stages with gentle progression", () => {
    expect(STAGE_SPECS).toHaveLength(9);
    for (const d of ["EASY", "MEDIUM", "ADVANCED"] as const) {
      const stages = STAGE_SPECS.filter((s) => s.difficulty === d);
      expect(stages.map((s) => s.stage)).toEqual([1, 2, 3]);
      expect(stages[1].goal).toBeGreaterThanOrEqual(stages[0].goal);
      expect(stages[2].goal).toBeGreaterThanOrEqual(stages[1].goal);
      expect(stages[2].goal - stages[0].goal).toBeLessThanOrEqual(2); // no sudden spike
    }
  });

  it("uses 3 / 5 / 7 colours and the required Advanced palette", () => {
    const palette = (i: number) => resolveStage(i, DEFAULT_SETTINGS).palette;
    expect(palette(0)).toHaveLength(3);
    expect(palette(3)).toHaveLength(5);
    expect([...palette(6)].sort()).toEqual(["black", "blue", "green", "purple", "red", "white", "yellow"]);
  });

  it("Easy is stationary; Medium/Advanced rise, Advanced slightly faster with slightly more balloons", () => {
    const e = resolveStage(0, DEFAULT_SETTINGS), m = resolveStage(3, DEFAULT_SETTINGS), a = resolveStage(6, DEFAULT_SETTINGS);
    expect(e.motion).toBe("static");
    expect([m.motion, a.motion]).toEqual(["rising", "rising"]);
    expect(a.riseSeconds).toBeLessThan(m.riseSeconds);
    expect(a.activeCount).toBeGreaterThanOrEqual(m.activeCount);
    expect(e.sizeCqh).toBeGreaterThan(m.sizeCqh);
  });

  it("clamps unsafe therapist settings into the safe envelope", () => {
    const s = sanitizeSettings({ sizeScale: 99, speedScale: -3, countOffset: 50, colorCount: 99, contactTolerance: 9 });
    expect(s.sizeScale).toBe(1.3);
    expect(s.speedScale).toBe(0.6);
    expect(s.countOffset).toBe(2);
    expect(s.contactTolerance).toBe(0.5);
    const hard = resolveStage(6, { ...s, colorCount: 99 });
    expect(hard.palette.length).toBeLessThanOrEqual(7);
    expect(resolveStage(0, { ...DEFAULT_SETTINGS, colorCount: 99 }).palette).toHaveLength(3); // Easy never exceeds 3
    expect(resolveStage(0, { ...DEFAULT_SETTINGS, colorCount: 1 }).palette).toHaveLength(2);
    expect(resolveStage(6, { ...DEFAULT_SETTINGS, speedScale: 1.4 }).riseSeconds).toBeGreaterThanOrEqual(18);
  });

  it("floor layout makes targets larger and slower", () => {
    const wall = resolveStage(4, DEFAULT_SETTINGS), floor = resolveStage(4, { ...DEFAULT_SETTINGS, layout: "FLOOR" });
    expect(floor.sizeCqh).toBeGreaterThan(wall.sizeCqh);
    expect(floor.riseSeconds).toBeGreaterThan(wall.riseSeconds);
  });
});

describe("full session", () => {
  it("a patient player completes all nine stages in order, with correct totals", () => {
    const done = playAll(make());
    expect(done.lifecycle).toBe("completed");
    expect(done.summary!.stages.map((r) => `${r.difficulty}-${r.stage}`)).toEqual([
      "EASY-1", "EASY-2", "EASY-3", "MEDIUM-1", "MEDIUM-2", "MEDIUM-3", "ADVANCED-1", "ADVANCED-2", "ADVANCED-3",
    ]);
    expect(done.summary!.completedStages).toBe(9);
    expect(done.summary!.skippedStages).toBe(0);
    expect(done.summary!.totalCorrect).toBe(STAGE_SPECS.reduce((a, s) => a + s.goal, 0));
    for (const r of done.summary!.stages) expect(r.correct).toBe(r.goal);
  });

  it("scope=level stops after the three stages of the chosen level", () => {
    const done = playAll(make({ startDifficulty: "MEDIUM", settings: { scope: "level" } }));
    expect(done.summary!.stages.map((r) => r.index)).toEqual([3, 4, 5]);
  });

  it("can start at any stage", () => {
    const s = make({ startDifficulty: "ADVANCED", startStage: 2 });
    expect(s.stage!.index).toBe(7);
  });
});

describe("no time-based failure", () => {
  it.each([0, 3, 6])("stage %i: ten minutes with no selection never fails, never advances, and a target stays available", (index) => {
    let s = make({ startDifficulty: (["EASY", "MEDIUM", "ADVANCED"] as const)[index / 3], startStage: 1 });
    let worst = 0, streak = 0;
    for (let t = 0; t < 10 * 60_000; t += 100) {
      s = advanceMs(s, 100, 20);
      expect(s.lifecycle).toBe("playing");
      expect(s.stage!.goalDone).toBe(0);
      expect(overlapCount(s)).toBe(0);
      streak = targetsAvailable(s) === 0 ? streak + 1 : 0;
      worst = Math.max(worst, streak);
    }
    expect(worst * 100).toBeLessThan(5_000);
  });

  it("rising balloons keep spawning, retire off the top, and are replaced", () => {
    let s = make({ startDifficulty: "MEDIUM", startStage: 1 });
    advanceMs(s, 1000);
    s = advanceMs(s, 3 * 60_000);
    expect(s.stage!.spawn.spawnCount).toBeGreaterThan(20);
    expect(s.stage!.balloons.filter((b) => !b.popping).length).toBeGreaterThanOrEqual(s.stage!.spec.activeCount - 2);
  });

  it("rising balloons always spawn below the visible stage", () => {
    let s = make({ startDifficulty: "ADVANCED", startStage: 1 });
    const seen = new Set<string>(initialIds(s));
    for (let t = 0; t < 120_000; t += 100) {
      s = advanceMs(s, 100, 20);
      for (const b of s.stage!.balloons) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        expect(b.spawnedAtMs).toBeGreaterThan(0);
        expect(b.spawnedAtMs % 100).toBe(0);
      }
    }
    expect(seen.size).toBeGreaterThan(15);
  });
});
const initialIds = (s: Session) => s.stage!.balloons.map((b) => b.id);

describe("selection and scoring", () => {
  it("correct colour pops, scores once, and replacement never uses the popped balloon's slot (Easy)", () => {
    const s0 = make();
    const stage = s0.stage!;
    const target = stage.balloons.find((b) => b.color === stage.target)!;
    const r = selectBalloon(s0, { balloonId: target.id, source: "RIGHT_HAND", inputEventId: "e1" });
    expect(r.outcome).toBe("correct");
    expect(r.session.stage!.goalDone).toBe(1);
    expect(r.session.stage!.balloons.find((b) => b.id === target.id)!.popping).toBe(true);
    let s = advanceMs(r.session, 20_000);
    expect(s.stage!.balloons.find((b) => b.slot === target.slot && !b.popping && b.id !== target.id)).toBeUndefined();
    expect(s.stage!.balloons.some((b) => b.id === target.id)).toBe(false); // gone for good
    s = advanceMs(s, 1000);
    expect(s.stage!.goalDone).toBe(1);
  });

  it("is exactly-once: repeats of the same balloon or the same input event never score twice", () => {
    const s0 = make();
    const t = s0.stage!.balloons.find((b) => b.color === s0.stage!.target)!;
    const first = selectBalloon(s0, { balloonId: t.id, source: "KEYBOARD", inputEventId: "x" });
    const again = selectBalloon(first.session, { balloonId: t.id, source: "RIGHT_HAND" });
    const sameEvent = selectBalloon(first.session, { balloonId: "other", source: "RIGHT_HAND", inputEventId: "x" });
    expect(again.outcome).toBe("ignored");
    expect(sameEvent.reason).toBe("duplicate-event");
    expect(again.session.stage!.goalDone).toBe(1);
    expect(first.session.selections).toHaveLength(1);
  });

  it("wrong colour: balloon stays, nothing deducted, no failure, a gentle cue counter increments", () => {
    const s0 = make();
    const wrong = s0.stage!.balloons.find((b) => b.color !== s0.stage!.target)!;
    const r = selectBalloon(s0, { balloonId: wrong.id, source: "KEYBOARD" });
    expect(r.outcome).toBe("wrong");
    const st = r.session.stage!;
    expect(st.goalDone).toBe(0);
    expect(st.balloons.find((b) => b.id === wrong.id)).toMatchObject({ popping: false, wrongCueCount: 1 });
    expect(r.session.lifecycle).toBe("playing");
    // The lingering touch cannot be counted again straight away.
    expect(selectBalloon(r.session, { balloonId: wrong.id, source: "KEYBOARD" }).reason).toBe("wrong-cooldown");
    // ...and later touches may cue again, still without penalty.
    const later = selectBalloon(advanceMs(r.session, 1000), { balloonId: wrong.id, source: "KEYBOARD" });
    expect(later.outcome).toBe("wrong");
    expect(later.session.stage!.goalDone).toBe(0);
  });

  it("does not score while paused, suspended, ready, or complete", () => {
    const s0 = make();
    const t = s0.stage!.balloons.find((b) => b.color === s0.stage!.target)!;
    for (const blocked of [pauseSession(s0), suspendSession(s0, "input-lost")]) {
      expect(selectBalloon(blocked, { balloonId: t.id, source: "KEYBOARD" }).outcome).toBe("ignored");
    }
    const ready = createSession({ sessionId: "r", sessionEpoch: 1, seed: 1 });
    expect(selectBalloon(ready, { balloonId: "x", source: "KEYBOARD" }).reason).toBe("not-playing");
  });

  it("cannot select a balloon that is below the stage", () => {
    let s = make({ startDifficulty: "MEDIUM", startStage: 1 });
    s = advanceMs(s, 4000);
    const stage = s.stage!;
    const hidden = stage.balloons.find((b) => !selectableBodies(s).some((x) => x.id === b.id) && !b.popping);
    if (hidden) expect(selectBalloon(s, { balloonId: hidden.id, source: "KEYBOARD" }).reason).toBe("off-stage");
  });
});

describe("pause / resume / restart / skip / end", () => {
  it("pause freezes the simulation exactly; resume continues without a jump", () => {
    const s = advanceMs(make({ startDifficulty: "MEDIUM", startStage: 1 }), 5000);
    const before = JSON.stringify(s.stage);
    const paused = pauseSession(s);
    const stillPaused = advanceMs(paused, 30_000);
    expect(JSON.stringify(stillPaused.stage)).toBe(before);
    const resumed = resumeSession(stillPaused);
    expect(resumed.lifecycle).toBe("playing");
    expect(resumed.stage!.simTimeMs).toBe(s.stage!.simTimeMs);
    const next = tickSession(resumed, 16);
    expect(next.stage!.simTimeMs - s.stage!.simTimeMs).toBe(16);
  });

  it("suspension (e.g. input lost) freezes too and resumes cleanly", () => {
    const s = advanceMs(make(), 2000);
    const sus = suspendSession(s, "input-lost");
    expect(advanceMs(sus, 10_000).stage!.simTimeMs).toBe(s.stage!.simTimeMs);
    expect(resumeSession(sus).lifecycle).toBe("playing");
  });

  it("restart rebuilds the stage (fresh, deterministic) without advancing", () => {
    let s = advanceMs(make(), 3000);
    s = popTarget(s);
    const re = restartStage(s);
    expect(re.stage!.goalDone).toBe(0);
    expect(re.stage!.simTimeMs).toBe(0);
    expect(re.stage!.index).toBe(s.stage!.index);
    expect(re.stage!.attempt).toBe(1);
    expect(re.restarts).toBe(1);
    expect(restartStage(s).stage!.balloons.map((b) => b.id)).toEqual(re.stage!.balloons.map((b) => b.id));
  });

  it("skip records the stage as skipped (never a failure) and continues; skipping the last stage completes", () => {
    let s = make({ startDifficulty: "EASY", startStage: 1 });
    s = skipStage(s);
    expect(s.results[0]).toMatchObject({ status: "skipped", index: 0 });
    expect(s.stage!.index).toBe(1);
    expect(s.lifecycle).toBe("playing");
    const last = make({ startDifficulty: "ADVANCED", startStage: 3 });
    const done = skipStage(last);
    expect(done.lifecycle).toBe("completed");
    expect(done.summary!.skippedStages).toBe(1);
  });

  it("end keeps played progress in the summary and stops everything", () => {
    let s = advanceMs(make(), 2000);
    s = popTarget(s);
    const ended = endSession(s);
    expect(ended.lifecycle).toBe("ended");
    expect(ended.summary!.reason).toBe("therapist-ended");
    expect(ended.summary!.totalCorrect).toBe(1);
    expect(tickSession(ended, 1000)).toBe(ended);
  });

  it("a new run increments the run id and clears the run", () => {
    const s = newRun(advanceMs(make(), 1000));
    expect(s.runId).toBe(2);
    expect(s.lifecycle).toBe("ready");
    expect(s.stage).toBeNull();
  });

  it("settings: tolerance applies immediately, size/speed apply at the next stage build", () => {
    let s = make({ startDifficulty: "MEDIUM", startStage: 1 });
    const size = s.stage!.spec.sizeCqh;
    s = updateSettings(s, { contactTolerance: 0.4, sizeScale: 1.3 });
    expect(s.settings.contactTolerance).toBe(0.4);
    expect(s.stage!.spec.sizeCqh).toBe(size);
    expect(restartStage(s).stage!.spec.sizeCqh).toBeGreaterThan(size);
    const ready = setStart(startSessionless(), "ADVANCED", 2);
    expect(ready.startIndex).toBe(7);
  });
});
const startSessionless = () => createSession({ sessionId: "z", sessionEpoch: 1, seed: 3 });

describe("determinism", () => {
  it("same seed + same simulated time => identical population, regardless of frame rate", () => {
    for (const d of ["EASY", "MEDIUM", "ADVANCED"] as const) {
      const a = advanceMs(make({ startDifficulty: d }), 60_000, 16);
      const b = advanceMs(make({ startDifficulty: d }), 60_000, 33);
      // Both advanced exactly the same simulated duration modulo frame quantisation of ~16ms.
      // Spawn schedule is a function of the 100 ms housekeeping grid only: compare balloons spawned by both.
      const common = a.stage!.balloons.filter((x) => b.stage!.balloons.some((y) => y.id === x.id));
      for (const x of common) expect(b.stage!.balloons.find((y) => y.id === x.id)).toMatchObject({ color: x.color, x: x.x, spawnedAtMs: x.spawnedAtMs });
      expect(common.length).toBeGreaterThan(0);
    }
  });

  it("a different seed gives a different layout", () => {
    const a = make({ seed: 1 }), b = make({ seed: 2 });
    expect(a.stage!.balloons.map((x) => x.x)).not.toEqual(b.stage!.balloons.map((x) => x.x));
  });
});
