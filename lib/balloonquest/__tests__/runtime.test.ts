import { describe, expect, it } from "vitest";
import { Env } from "./harness";
import { balloonTop } from "../geometry";
import { toDisplayState, PROTOCOL_VERSION, parseMessage, type Message } from "../protocol";
import { DisplayReplica } from "../replica";

const settings = { allowNoDisplay: false };

function started(extra: Record<string, unknown> = {}) {
  const env = new Env({ inputMode: "keyboard", ...extra });
  const display = env.addDisplay();
  env.run(600);
  expect(env.rt.command({ type: "start" })).toBe(true);
  return { env, display };
}

describe("start gating", () => {
  it("refuses to start without a Display unless explicitly allowed", () => {
    const env = new Env({ inputMode: "keyboard", ...settings });
    expect(env.rt.command({ type: "start" })).toBe(false);
    expect(env.rt.view().lastRefusal).toContain("شاشة العرض");
    const free = new Env({ inputMode: "keyboard", allowNoDisplay: true });
    expect(free.rt.command({ type: "start" })).toBe(true);
  });
  it("refuses a command addressed to an older session or run", () => {
    const { env } = started();
    const s = env.rt.session;
    expect(env.rt.command({ type: "pause" }, { sessionEpoch: s.sessionEpoch - 1, runId: s.runId })).toBe(false);
    expect(env.rt.command({ type: "pause" }, { sessionEpoch: s.sessionEpoch, runId: s.runId + 1 })).toBe(false);
    expect(env.rt.command({ type: "pause" }, { sessionEpoch: s.sessionEpoch, runId: s.runId })).toBe(true);
  });
});

describe("Control <-> Display consistency", () => {
  it.each(["MEDIUM", "ADVANCED"] as const)("%s: Display positions equal authoritative positions (zero latency)", (difficulty) => {
    const env = new Env({ inputMode: "keyboard", allowNoDisplay: true });
    env.rt.command({ type: "new-session", difficulty, stage: 1 });
    const display = env.addDisplay();
    env.run(600);
    env.rt.command({ type: "start" });
    let worst = 0;
    env.run(40_000, 16, () => {
      const r = display.replica;
      if (!r.state) return;
      const st = env.rt.session.stage!;
      const t = r.simTime(env.now);
      for (const db of r.state.balloons) {
        const b = st.balloons.find((x) => x.id === db.id);
        if (!b) continue;
        worst = Math.max(worst, Math.abs(balloonTop(db, st.spec, t) - balloonTop(b, st.spec, st.simTimeMs)));
      }
    });
    expect(worst).toBeLessThan(0.3); // cqh: well under a pixel at 900px high (heartbeat quantisation only)
    expect(display.replica.state!.balloons.length).toBeGreaterThan(3);
  });

  it("with 40 ms of channel latency the extrapolated Display stays within ~0.5 cqh", () => {
    const env = new Env({ inputMode: "keyboard", allowNoDisplay: true });
    env.rt.command({ type: "new-session", difficulty: "ADVANCED", stage: 1 });
    env.latencyMs = 40;
    const display = env.addDisplay();
    env.run(800);
    env.rt.command({ type: "start" });
    let worst = 0;
    env.run(20_000, 16, () => {
      const r = display.replica;
      if (!r.state || !r.state.running) return;
      const st = env.rt.session.stage!;
      for (const db of r.state.balloons) {
        const b = st.balloons.find((x) => x.id === db.id);
        if (b) worst = Math.max(worst, Math.abs(balloonTop(db, st.spec, r.simTime(env.now)) - balloonTop(b, st.spec, st.simTimeMs)));
      }
    });
    expect(worst).toBeLessThan(0.5);
  });

  it("pause freezes the Display's clock; resume continues without a jump", () => {
    const { env, display } = started();
    env.rt.command({ type: "new-session", difficulty: "MEDIUM", stage: 1 });
    env.rt.command({ type: "start" });
    env.run(5000);
    env.rt.command({ type: "pause" });
    env.run(50);
    const frozen = display.replica.simTime(env.now);
    env.run(10_000);
    expect(display.replica.simTime(env.now)).toBe(frozen);
    expect(env.rt.getSimTimeMs()).toBeCloseTo(frozen, 0);
    env.rt.command({ type: "resume" });
    env.run(48);
    const after = display.replica.simTime(env.now);
    expect(after - frozen).toBeLessThan(300);
    expect(after).toBeGreaterThanOrEqual(frozen);
  });

  it("never sends per-frame positions: message volume is clock heartbeats + state changes only", () => {
    const env = new Env({ inputMode: "keyboard", allowNoDisplay: true });
    env.rt.command({ type: "new-session", difficulty: "ADVANCED", stage: 1 });
    env.addDisplay();
    env.run(500);
    env.rt.command({ type: "start" });
    env.sent.length = 0;
    env.run(60_000, 16); // 3750 frames
    const clocks = env.sent.filter((m) => m.type === "clock").length;
    const states = env.sent.filter((m) => m.type === "state").length;
    expect(clocks).toBeLessThan(60 * 4 + 5);
    expect(states).toBeLessThan(200);
    expect(env.sent.length).toBeLessThan(400);
    for (const m of env.sent) if (m.type === "state") expect(JSON.stringify(m)).not.toMatch(/"y":/);
  });

  it("Display recovers from a lost state message via the clock's revision", () => {
    const { env, display } = started();
    env.run(2000);
    const target = env.normOf((b) => env.isTarget(b.id));
    expect(target).toBeTruthy();
    env.drop = (m) => m.type === "state"; // the next state change is lost
    env.rt.press("KEYBOARD");
    env.rt.keyboard.x = target!.x;
    env.rt.keyboard.y = target!.y;
    env.run(100);
    env.rt.press("KEYBOARD");
    env.run(400);
    env.drop = () => false;
    env.run(2500);
    expect(display.replica.revision).toBe(env.rt.session.revision);
    expect(display.replica.state!.goalDone).toBe(env.rt.session.stage!.goalDone);
  });

  it("a probe (e.g. Display reload) is answered with the current state", () => {
    const { env } = started();
    env.run(3000);
    const fresh = env.addDisplay("reloaded");
    env.run(100);
    expect(fresh.replica.state).not.toBeNull();
    expect(fresh.replica.revision).toBe(env.rt.session.revision);
  });
});

describe("protocol rejection", () => {
  const base = () => {
    const { env, display } = started();
    env.run(500);
    return { env, display, id: display.replica.identity!, rev: display.replica.revision, state: display.replica.state! };
  };
  const stateMsg = (id: ReturnType<typeof base>["id"], revision: number, state: ReturnType<typeof base>["state"], over: Record<string, unknown> = {}) =>
    ({ v: PROTOCOL_VERSION, type: "state", revision, sentAtMs: 0, state, ...id, ...over }) as Message;

  it("rejects out-of-order revisions, duplicates, old runs, old sessions and older owners", () => {
    const { display, id, rev, state, env } = base();
    const r = display.replica;
    expect(r.accept(stateMsg(id, rev - 1, state), env.now)).toBe("stale");
    expect(r.accept(stateMsg(id, rev, state), env.now)).toBe("duplicate");
    expect(r.accept(stateMsg({ ...id, runId: id.runId - 1 }, rev + 5, state), env.now)).toBe("stale");
    expect(r.accept(stateMsg({ ...id, sessionEpoch: id.sessionEpoch - 1 }, rev + 5, state), env.now)).toBe("stale");
    expect(r.accept(stateMsg({ ...id, ownerStartedAt: id.ownerStartedAt - 1 }, rev + 5, state), env.now)).toBe("stale");
    expect(r.revision).toBe(rev);
    expect(r.accept(stateMsg(id, rev + 1, state), env.now)).toBe("accepted");
  });

  it("accepts a restarted Control (newer owner) and ignores the old one afterwards", () => {
    const { display, id, rev, state, env } = base();
    const r = display.replica;
    expect(r.accept(stateMsg({ ...id, ownerId: "owner-2", ownerStartedAt: id.ownerStartedAt + 10_000, sessionEpoch: id.sessionEpoch + 10_000, runId: 1 }, 1, state), env.now)).toBe("accepted");
    expect(r.identity!.ownerId).toBe("owner-2");
    expect(r.accept(stateMsg(id, rev + 50, state), env.now)).toBe("stale");
  });

  it("rejects out-of-order and duplicate clock heartbeats, foreign owners", () => {
    const { display, id, rev, env } = base();
    const r = display.replica;
    const clock = (seq: number, over: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, type: "clock", revision: rev, seq, simTimeMs: 1000, running: true, ...id, ...over }) as Message;
    expect(r.accept(clock(900), env.now)).toBe("accepted");
    expect(r.accept(clock(900), env.now)).toBe("duplicate");
    expect(r.accept(clock(899), env.now)).toBe("duplicate");
    expect(r.accept(clock(901, { ownerId: "intruder" }), env.now)).toBe("foreign");
    expect(r.accept(clock(902, { revision: rev - 1 }), env.now)).toBe("stale");
    expect(r.accept(clock(903, { revision: rev + 3 }), env.now)).toBe("needs-sync");
    expect(r.needsSync).toBe(true);
  });

  it("parseMessage rejects malformed, wrong-version and out-of-range messages", () => {
    const { state, id, rev } = base();
    for (const bad of [null, 5, {}, { v: 2, type: "state" }, { v: 1, type: "nope" }, stateMsg(id, rev, { ...state, balloons: Array(40).fill(state.balloons[0]) }), stateMsg(id, rev, { ...state, target: "pink" as never }), stateMsg(id, -1, state), { v: 1, type: "clock", ...id, revision: 1, seq: 1, simTimeMs: NaN, running: true }]) {
      expect(parseMessage(bad)).toBeNull();
    }
    expect(parseMessage(stateMsg(id, rev, state))).not.toBeNull();
  });

  it("Control ignores acks addressed to another owner and stale/duplicate acks", () => {
    const { env, display } = started();
    const before = env.rt.view().displays;
    env.rt.receive({ v: 1, type: "ack", displayId: "x", ownerId: "someone-else", sessionEpoch: 1, runId: 1, revision: 1, seq: 1, visible: true });
    expect(env.rt.view().displays).toBe(before);
    void display;
  });
});

describe("holds", () => {
  it("a Display that stops acking suspends play and resumes automatically when it returns", () => {
    const { env, display } = started();
    env.run(1000);
    display.connected = false;
    env.run(3000);
    expect(env.rt.session.lifecycle).toBe("suspended");
    expect(env.rt.session.suspendReason).toBe("display-unavailable");
    const t = env.rt.getSimTimeMs();
    env.run(5000);
    expect(env.rt.getSimTimeMs()).toBe(t); // nothing advanced while held
    display.connected = true;
    display.probe();
    env.run(1500);
    expect(env.rt.session.lifecycle).toBe("playing");
  });

  it("a hidden Display tab holds play", () => {
    const { env, display } = started();
    display.visible = false;
    env.run(3000);
    expect(env.rt.session.suspendReason).toBe("display-unavailable");
  });

  it("a scheduling gap (frozen tab) holds instead of advancing, and needs the therapist to resume", () => {
    const { env } = started();
    env.run(1000);
    const t = env.rt.getSimTimeMs();
    env.now += 5000; // the browser throttled us for 5 s
    env.rt.tick();
    expect(env.rt.session.lifecycle).toBe("suspended");
    expect(env.rt.session.suspendReason).toBe("scheduling-gap");
    expect(env.rt.getSimTimeMs()).toBe(t);
    env.run(2000);
    expect(env.rt.session.lifecycle).toBe("suspended");
    env.rt.command({ type: "resume" });
    expect(env.rt.session.lifecycle).toBe("playing");
  });

  it("stage completion auto-advances after the celebration; the therapist can also advance sooner", () => {
    const { env } = started({ autoAdvance: true });
    const complete = () => {
      for (let i = 0; i < 40 && env.rt.session.lifecycle === "playing"; i++) {
        const b = env.rt.session.stage!.balloons.find((x) => !x.popping && x.color === env.rt.session.stage!.target);
        if (b) env.rt.therapistSelect(b.id);
        env.run(200);
      }
    };
    complete();
    expect(env.rt.session.lifecycle).toBe("stage-complete");
    env.run(3000);
    expect(env.rt.session.lifecycle).toBe("stage-complete");
    env.run(900);
    expect(env.rt.session.lifecycle).toBe("playing");
    expect(env.rt.session.stageIndex).toBe(1);
    complete();
    expect(env.rt.command({ type: "advance" })).toBe(true);
    expect(env.rt.session.stageIndex).toBe(2);
  });
});

describe("display projection", () => {
  it("contains no patient data and respects the wire limits", () => {
    const { env } = started();
    const json = JSON.stringify(toDisplayState(env.rt.session));
    expect(json).not.toMatch(/patient|name|email/i);
    expect(json.length).toBeLessThan(4000);
    expect(new DisplayReplica().simTime(0)).toBe(0);
  });
});

describe("liveness while not playing", () => {
  it("a long pause is not mistaken for a vanished Control (idle heartbeat), and the clock stays frozen", () => {
    const { env, display } = started();
    env.run(1500);
    env.rt.command({ type: "pause" });
    const frozen = display.replica.simTime(env.now);
    env.run(20_000);
    expect(display.replica.isSilent(env.now)).toBe(false);
    expect(display.replica.simTime(env.now)).toBe(frozen);
    const clocks = env.sent.filter((m) => m.type === "clock" && !m.running).length;
    expect(clocks).toBeGreaterThan(15);
    expect(clocks).toBeLessThan(25); // ~1 per second, not 4
  });
});

describe("therapist-tap mode and production display presence", () => {
  it("therapist mode needs no sensor: starts, never holds for lost input, and only therapist taps score", () => {
    const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
    expect(env.rt.command({ type: "start" })).toBe(true);
    env.run(4000); // no pointer of any kind for 4 s
    expect(env.rt.session.lifecycle).toBe("playing");
    expect(env.rt.getSimTimeMs()).toBeGreaterThan(3500);
    const st = env.rt.session.stage!;
    const wrong = st.balloons.find((b) => b.color !== st.target)!;
    expect(env.rt.therapistSelect(wrong.id)).toBe(true);
    expect(env.rt.session.stage!.goalDone).toBe(0);
    expect(env.rt.session.stage!.wrongCount).toBe(1);
    const target = st.balloons.find((b) => b.color === st.target)!;
    expect(env.rt.therapistSelect(target.id)).toBe(true);
    expect(env.rt.session.stage!.goalDone).toBe(1);
    expect(env.rt.therapistSelect(target.id)).toBe(false); // exactly once
    // Sensor pointers are ignored entirely in this mode.
    const p = env.pointer("RIGHT_HAND");
    p.moveTo(0.5, 0.5);
    expect(env.rt.hub.rejections().disabled).toBeGreaterThan(0);
  });

  it("an external display-presence source replaces acknowledgement bookkeeping (networked Display)", () => {
    let present = false;
    const env = new Env({ inputMode: "therapist" }, { externalDisplayReady: () => present });
    expect(env.rt.command({ type: "start" })).toBe(false);
    present = true;
    expect(env.rt.command({ type: "start" })).toBe(true);
    env.run(1000);
    expect(env.rt.session.lifecycle).toBe("playing");
    present = false; // Display (or Control's connection) drops
    env.run(300);
    expect(env.rt.session.lifecycle).toBe("suspended");
    expect(env.rt.session.suspendReason).toBe("display-unavailable");
    present = true;
    env.run(300);
    expect(env.rt.session.lifecycle).toBe("playing");
  });

  it("re-applying an unchanged setting is not reported as a refusal", () => {
    const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
    expect(env.rt.command({ type: "settings", patch: { sizeScale: 1 } })).toBe(true);
    expect(env.rt.command({ type: "start-at", difficulty: "EASY", stage: 1 })).toBe(true);
    expect(env.rt.view().lastRefusal).toBeNull();
  });
});

it("native right-hand input and therapist taps coexist with exactly-once balloon scoring",()=>{
 const env=new Env({inputMode:"right-hand",allowNoDisplay:true});const hand=env.pointer("RIGHT_HAND");hand.moveTo(.02,.02);env.run(40);expect(env.rt.command({type:"start"})).toBe(true);
 const target=env.normOf(b=>env.isTarget(b.id))!;expect(target).not.toBeNull();expect(env.rt.therapistSelect(target.id)).toBe(true);const done=env.rt.session.stage!.goalDone;
 hand.moveTo(target.x,target.y);env.run(500,16,()=>hand.heartbeat());expect(env.rt.therapistSelect(target.id)).toBe(false);expect(env.rt.session.stage!.goalDone).toBe(done);expect(env.rt.session.settings.inputMode).toBe("right-hand");
});
