import { nextObjective } from '../objectiveGuidance';
import { pointerForHeading } from "../worldFlight";
import { RightHandFlightInput } from "../sensorInput";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionAuthority } from "../sessionAuthority";
import { SessionReplica } from "../sessionReplica";
import { AcceptedScene } from "../presentation";
import { openExperimentalChannel } from "../sessionChannel";
import { EXPERIMENTAL_CHECKPOINT_KEY, recoveredSummary, saveCheckpoint } from "../sessionStorage";
import { isSessionState, type SessionAction, type SessionMessage } from "../sessionContract";
import type { NormalizedFlightInput } from "../simulation";

const center = { x: 0.5, y: 0.5 };
const at = (x: number, y: number) => ({ x: 0.5 + x / 9.6, y: 0.5 - y / 5.6 });
function setup() {
  const authority = new SessionAuthority("room-a", "owner-a", "session-a");
  let now = 1000, sequence = 0, ackSequence = 0;
  const identity = () => ({ ownerId: authority.ownerId, sessionId: authority.sessionId, runId: authority.simulation.runId, inputEpoch: authority.inputEpoch });
  const ack = (displayId = "display-a", visible = true, ready = true) => {
    const frame = authority.frame(now);
    return authority.receive({ version: 4, type: "ack", ...identity(), displayId, frameSequence: frame.sequence, sequence: ++ackSequence, visible, ready }, now);
  };
  const input = (pointer = center, displayId = "display-a", extra: Record<string, unknown> = {}) => {
    const frame = authority.frame(now);
    return authority.receive({ version: 4, type: "input", ...identity(), displayId, frameSequence: frame.sequence, sequence: ++sequence, pointer, ...extra }, now);
  };
  const command = (action: SessionAction) => authority.command(action, authority.revision, authority.simulation.runId, now);
  const step = (pointer: NormalizedFlightInput | null = center, ms = 1000 / 60) => {
    now += ms; ack();
    if (pointer) input(pointer);
    authority.tick(now, pointer, pointer ? "tracking" : "stale", pointer);
  };
  ack(); ack(); authority.tick(now, center, "tracking", center);
  return { authority, identity, ack, input, command, step, now: () => now, advance: (ms: number) => { now += ms; } };
}
function sync(authority: SessionAuthority, replica: SessionReplica, now: number, nonce = "fresh-probe") {
  replica.probe(nonce, now);
  return replica.receive({ version: 4, type: "sync", displayId: replica.displayId, nonce, state: authority.snapshot(), frame: authority.frame(now) }, now + 1);
}
function completeMission(h: ReturnType<typeof setup>) {
  for (let i = 0; i < 7200 && h.authority.lifecycle === "running"; i++) {
    const sim=h.authority.simulation,object=nextObjective(sim.ship,sim.objects,{...sim.config.flightSettings,guidance:2},sim.config.accessibility)!;
    if(!object){h.step();continue;}
    const depth=Math.max(1,sim.ship.z-object.z);
    h.step(pointerForHeading(Math.atan2(object.x-sim.ship.x,depth),Math.atan2(object.y-sim.ship.y,Math.hypot(depth,object.x-sim.ship.x)),sim.config.flightSettings.sensitivity,sim.config.flightSettings.headingLimit));
  }
}

describe("Control-owned experimental session", () => {
  it("creates explicit versioned identities, empty scoring and an idle lifecycle", () => {
    const { authority } = setup(); const state = authority.snapshot();
    expect(state).toMatchObject({ version: 4, sessionId: "session-a", runId: 1, missionId: "mission-1", lifecycle: "ready", eventSequence: 0 });
    expect(isSessionState(state)).toBe(true); expect(state.stats.score).toBe(0);
  });
  it("requires a live rendered Display before starting", () => {
    const a = new SessionAuthority("room", "owner", "session");
    expect(a.command({ type: "start" }, a.revision, 1, 0)).toBe(false);
    const h = setup(); expect(h.command({ type: "start" })).toBe(true); h.step(); h.step();
    expect(h.authority.simulation.elapsedSeconds).toBeGreaterThan(0);
  });
  it("accepts scoring only from the Control simulation, never incoming outcome claims", () => {
    const h = setup(); h.command({ type: "start" });
    expect(h.authority.receive({ version: 4, type: "outcome", ...h.identity(), displayId: "display-a", outcome: "collected", score: 999 }, h.now())).toBe(false);
    for (let i = 0; i < Math.ceil(h.authority.simulation.objects[0].arrivalSeconds*60)+5; i++) h.step();
    expect(h.authority.snapshot().stats).toMatchObject({ ringsCollected: 1, score: 100 });
    expect(h.authority.outcomes).toHaveLength(1); expect(h.authority.outcomes[0].sequence).toBe(1);
  });
  it("freezes pause, prevents duplicate actions and resumes without catch-up", () => {
    const h = setup(); h.command({ type: "start" }); h.step(); h.step();
    const revision = h.authority.revision;
    expect(h.authority.command({ type: "pause" }, revision, 1, h.now())).toBe(true);
    expect(h.authority.command({ type: "restart" }, revision, 1, h.now())).toBe(false);
    const before = h.authority.simulation.elapsedSeconds; h.advance(30000); h.step();
    expect(h.authority.simulation.elapsedSeconds).toBe(before);
    h.command({ type: "resume" }); h.step(); h.step();
    expect(h.authority.simulation.elapsedSeconds - before).toBeLessThan(0.04);
  });
  it("restart clears outcomes and upgrades, advances run/epoch, and rejects old-run packets", () => {
    const h = setup(); h.command({ type: "start" }); completeMission(h);
    const old = h.identity(); const oldSequence = h.authority.eventSequence;
    expect(h.authority.simulation.stats.upgradeTier).toBe(2);
    expect(h.command({ type: "restart" })).toBe(true);
    expect(h.authority.snapshot()).toMatchObject({ runId: 2, lifecycle: "paused", outcomes: [], eventSequence: oldSequence });
    expect(h.authority.simulation.stats).toMatchObject({ ringsCollected: 0, score: 0, upgradeTier: 1 });
    expect(h.input(center, "display-a", old)).toBe(false);
  });
  it("ends once, freezes scoring and provides a complete summary", () => {
    const h = setup(); h.command({ type: "start" }); for (let i = 0; i < Math.ceil(h.authority.simulation.objects[0].arrivalSeconds*60)+5; i++) h.step();
    h.command({ type: "end" }); const snapshot = h.authority.snapshot();
    for (let i = 0; i < 200; i++) h.step(at(-2.4, 1.1));
    expect(h.authority.snapshot().stats).toEqual(snapshot.stats); expect(h.authority.summary).toMatchObject({ reason: "therapist-ended", ringsCollected: 1, score: 100, completedMissions: 0 });
    expect(h.command({ type: "resume" })).toBe(false); expect(h.command({ type: "restart" })).toBe(false);
  });
  it("progresses through all missions with monotonic, exactly-once accepted outcomes", () => {
    const h = setup(); h.command({ type: "start" });
    for (let mission = 1; mission <= 3; mission++) {
      completeMission(h); expect(h.authority.simulation.stats.completedMissions).toBe(mission);
      if (mission < 3) { h.ack(); expect(h.command({ type: "next-mission" })).toBe(true); }
    }
    expect(h.authority.lifecycle).toBe("completed"); expect(h.authority.summary).toMatchObject({ ringsCollected: 13, asteroidsAvoided: 5, score: 1300, reason: "completed" });
    expect(h.authority.outcomes.map((o) => o.sequence)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(isSessionState(h.authority.snapshot())).toBe(true);
  });
  it("changes difficulty only before launch and pauses an input source change", () => {
    const h = setup(); h.command({ type: "difficulty", value: "HIGH" }); expect(h.authority.difficulty).toBe("HIGH");
    h.ack(); h.command({ type: "start" });
    expect(h.command({ type: "difficulty", value: "LOW" })).toBe(false);
    h.command({ type: "input-mode", value: "sensor" }); expect(h.authority.lifecycle).toBe("paused");
    expect(h.input()).toBe(false);
  });
  it("suspends before stepping when the hand disappears, then requires an explicit resume", () => {
    const h = setup(); h.command({ type: "input-mode", value: "sensor" }); h.step(); h.command({ type: "start" }); h.step(); h.step();
    const before = h.authority.simulation.elapsedSeconds;
    h.step(null); expect(h.authority.lifecycle).toBe("suspended"); expect(h.authority.reason).toBe("input-unavailable"); expect(h.authority.simulation.elapsedSeconds).toBe(before);
    h.step(); expect(h.authority.lifecycle).toBe("suspended"); expect(h.command({ type: "resume" })).toBe(true);
  });
  it("rejects duplicate, reordered, malformed and old-epoch keyboard input", () => {
    const h = setup(); h.command({ type: "start" }); h.ack();
    expect(h.input(center, "display-a", { sequence: 100 })).toBe(true);
    expect(h.input(at(4, 2), "display-a", { sequence: 100 })).toBe(false);
    expect(h.input(at(4, 2), "display-a", { sequence: 99 })).toBe(false);
    expect(h.input({ x: NaN, y: 1 }, "display-a", { sequence: 101 })).toBe(false);
    expect(h.input(center, "display-a", { sequence: 101, inputEpoch: h.authority.inputEpoch - 1 })).toBe(false);
  });
  it("rejects delayed acknowledgments using Control's local clock, even with fresh receive time", () => {
    const h = setup(); const frame = h.authority.frame(h.now()); h.advance(400);
    expect(h.authority.receive({ version: 4, type: "ack", ...h.identity(), displayId: "display-a", frameSequence: frame.sequence, sequence: 100, visible: true, ready: true }, h.now())).toBe(false);
  });
  it("rejects reordered visibility acknowledgments and waits for input with a bounded grace period", () => {
    const h = setup(); const frame = h.authority.frame(h.now());
    const ack = { version: 4, type: "ack", ...h.identity(), displayId: "display-a", frameSequence: frame.sequence, ready: true };
    expect(h.authority.receive({ ...ack, sequence: 200, visible: false }, h.now())).toBe(true);
    expect(h.authority.receive({ ...ack, sequence: 199, visible: true }, h.now())).toBe(false);
    expect(h.authority.canPlay(h.now())).toBe(false);
    const second = setup(); second.command({ type: "start" });
    for (let i = 0; i < 20; i++) { second.advance(20); second.ack(); second.authority.tick(second.now()); }
    expect(second.authority.lifecycle).toBe("suspended"); expect(second.authority.simulation.elapsedSeconds).toBe(0);
  });
  it("suspends on Control hiding, scheduling gaps and reverse monotonic time", () => {
    const h = setup(); h.command({ type: "start" }); h.step(); h.step();
    h.authority.suspend("control-hidden"); expect(h.authority.lifecycle).toBe("suspended"); h.ack(); h.command({ type: "resume" }); h.step();
    const before = h.authority.simulation.elapsedSeconds; h.step(center, 3000);
    expect(h.authority.reason).toBe("scheduling-gap"); expect(h.authority.simulation.elapsedSeconds).toBe(before);
    h.ack(); h.command({ type: "resume" }); h.step(); h.step(center, -10);
    expect(h.authority.reason).toBe("clock-discontinuity");
  });
  it("pauses when Display is hidden, closes, loses its renderer or stops acknowledging", () => {
    for (const kind of ["hidden", "closed", "renderer", "silent"] as const) {
      const h = setup(); h.command({ type: "start" }); h.step(); h.step(); const before = h.authority.simulation.elapsedSeconds;
      if (kind === "hidden") h.ack("display-a", false);
      else if (kind === "renderer") h.ack("display-a", true, false);
      else if (kind === "closed") h.authority.receive({ version: 4, type: "leave", ownerId: h.authority.ownerId, displayId: "display-a" }, h.now());
      else { h.advance(300); h.authority.tick(h.now()); }
      expect(h.authority.lifecycle).toBe("suspended"); expect(h.authority.simulation.elapsedSeconds).toBe(before);
    }
  });
  it("supports multiple viewers but only the selected Display can steer", () => {
    const h = setup(); h.ack("display-b"); h.command({ type: "start" }); h.ack(); h.ack("display-b");
    expect(h.input(at(4, 2), "display-b")).toBe(false); expect(h.input(center)).toBe(true);
    expect(h.authority.snapshot().displays).toEqual(["display-a", "display-b"]);
    h.command({ type: "pause" }); h.command({ type: "primary-display", value: "display-b" }); h.ack("display-b"); h.command({ type: "resume" }); h.ack("display-b");
    expect(h.input(at(4, 2), "display-b")).toBe(true); expect(h.input(center)).toBe(false);
  });
});

describe("Display snapshot reconciliation and recovery", () => {
  it("requires a matching fresh challenge before adopting an authority", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a");
    expect(replica.receive({ version: 4, type: "state", state: h.authority.snapshot() }, h.now())).toBe(false);
    expect(sync(h.authority, replica, h.now())).toBe(true);
    expect(replica.connected(h.now() + 2)).toBe(true);
  });
  it("rejects stale revisions, out-of-order frames, foreign owners and duplicate outcomes", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"); sync(h.authority, replica, h.now());
    const old = h.authority.snapshot(), oldFrame = h.authority.frame(h.now()); h.command({ type: "start" });
    for (let i = 0; i < Math.ceil(h.authority.simulation.objects[0].arrivalSeconds*60)+5; i++) h.step();
    sync(h.authority, replica, h.now(), "recover");
    expect(replica.receive({ version: 4, type: "state", state: old }, h.now() + 2)).toBe(false);
    expect(replica.receive({ version: 4, type: "frame", frame: oldFrame }, h.now() + 2)).toBe(false);
    expect(replica.receive({ version: 4, type: "state", state: { ...h.authority.snapshot(), ownerId: "foreign", revision: 999 } }, h.now() + 2)).toBe(false);
    expect(replica.receive({ version: 4, type: "state", state: { ...h.authority.snapshot(), revision: h.authority.revision + 1, outcomes: [...h.authority.outcomes, ...h.authority.outcomes] } }, h.now() + 2)).toBe(false);
    expect(replica.state?.stats.score).toBe(100);
  });
  it("delivers accepted visual effects once and never replays them on Display reload", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"); h.command({ type: "start" });
    for (let i = 0; i < 90; i++) h.step();
    sync(h.authority, replica, h.now());
    let before = h.authority.eventSequence;
    while (h.authority.eventSequence === before) { h.step(); sync(h.authority, replica, h.now(), `n-${h.now()}`); }
    expect(replica.takeEffects()).toHaveLength(1);
    expect(replica.takeEffects()).toHaveLength(0);
    const reload = new SessionReplica("room-a", "display-reloaded"); sync(h.authority, reload, h.now());
    expect(reload.state?.stats.score).toBe(100); expect(reload.takeEffects()).toEqual([]);
    before = h.authority.eventSequence; h.command({ type: "restart" }); sync(h.authority, replica, h.now(), "restart");
    expect(replica.state?.runId).toBe(2); expect(replica.state?.eventSequence).toBe(before); expect(replica.state?.stats.score).toBe(0);
  });
  it("freezes on message loss and rejects queued replies after a long scheduling gap", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"); sync(h.authority, replica, 1000);
    replica.probe("delayed", 1010);
    const message = { version: 4, type: "sync", displayId: "display-a", nonce: "delayed", state: h.authority.snapshot(), frame: h.authority.frame(1010) };
    expect(replica.connected(2000)).toBe(false); expect(replica.receive(message, 2000)).toBe(false);
    expect(replica.receive({ version: 4, type: "frame", frame: h.authority.frame(2000) }, 2000)).toBe(false);
    expect(sync(h.authority, replica, 2001, "fresh")).toBe(true);
  });
  it("uses each window's own monotonic clock regardless of their different origins", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a");
    replica.probe("clock", 500000);
    expect(replica.receive({ version: 4, type: "sync", displayId: "display-a", nonce: "clock", state: h.authority.snapshot(), frame: h.authority.frame(12) }, 500010)).toBe(true);
    expect(replica.connected(499000)).toBe(false);
  });
  it("Control reload establishes a new owner/session and never resumes the orphan", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"); h.command({ type: "start" }); h.step(); sync(h.authority, replica, h.now());
    const stale = h.authority.snapshot();
    const next = new SessionAuthority("room-a", "new-owner", "new-session");
    expect(sync(next, replica, h.now() + 10, "reload-control")).toBe(true);
    expect(replica.state).toMatchObject({ ownerId: "new-owner", sessionId: "new-session", lifecycle: "ready" });
    expect(replica.receive({ version: 4, type: "state", state: { ...stale, revision: 99999 } }, h.now() + 12)).toBe(false);
  });
  it("rejects a delayed old-owner handshake after adopting the replacement Control", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"); sync(h.authority, replica, h.now());
    replica.probe("old-outstanding", h.now() + 5);
    const old = { version: 4, type: "sync", displayId: "display-a", nonce: "old-outstanding", state: h.authority.snapshot(), frame: h.authority.frame(h.now()) };
    const next = new SessionAuthority("room-a", "new-owner", "new-session"); sync(next, replica, h.now() + 10, "new-owner");
    expect(replica.receive(old, h.now() + 20)).toBe(false); expect(replica.state?.ownerId).toBe("new-owner");
  });
  it("presentation copies accepted poses without advancing time or awarding outcomes", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"), scene = new AcceptedScene();
    sync(h.authority, replica, h.now()); scene.update(replica, h.now() + 2); const initial = JSON.stringify(scene.state);
    scene.update(replica, h.now() + 20); expect(JSON.stringify(scene.state)).toBe(initial);
    scene.update(replica, h.now() + 500); expect(scene.state.status).toBe("paused"); expect(scene.state.stats.score).toBe(0);
  });
});

describe("local persistence and channel boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("checkpoints outcomes locally and recovers an interrupted summary without restoring running simulation", () => {
    const h = setup(); h.command({ type: "start" }); for (let i = 0; i < Math.ceil(h.authority.simulation.objects[0].arrivalSeconds*60)+5; i++) h.step();
    const values = new Map<string, string>();
    expect(saveCheckpoint({ setItem: (key, value) => { values.set(key, value); } }, h.authority.snapshot())).toBe(true);
    expect(recoveredSummary(values.get(EXPERIMENTAL_CHECKPOINT_KEY)!)).toMatchObject({ reason: "control-reloaded", ringsCollected: 1, score: 100 });
    h.command({ type: "end" }); expect(recoveredSummary(JSON.stringify(h.authority.snapshot()))?.reason).toBe("therapist-ended");
    expect(recoveredSummary("invalid")).toBeNull(); expect(recoveredSummary(JSON.stringify({ version: 4 }))).toBeNull();
    expect(saveCheckpoint({ setItem: () => { throw new Error("unavailable"); } }, h.authority.snapshot())).toBe(false);
  });
  it("uses an isolated room channel and closes listeners idempotently", () => {
    const channels: FakeChannel[] = [];
    class FakeChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage = vi.fn(); close = vi.fn();
      constructor(readonly name: string) { channels.push(this); }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const receive = vi.fn(), channel = openExperimentalChannel("room-a", receive);
    expect(channels[0].name).toBe("shumos-experimental-space-pilot-3d-v4:room-a");
    const message: SessionMessage = { version: 4, type: "probe", displayId: "display-a", nonce: "nonce" };
    channel.send(message); channels[0].onmessage!({ data: message }); expect(receive).toHaveBeenCalledWith(message);
    channel.close(); channel.close(); channel.send(message);
    expect(channels[0].onmessage).toBeNull(); expect(channels[0].close).toHaveBeenCalledOnce(); expect(channels[0].postMessage).toHaveBeenCalledOnce();
  });
});

describe("R1 migration and sensor pickup", () => {
  it("holds the last accepted steering input after a recenter discontinuity, not world X/Y", () => {
    const h = setup(), sensor = new RightHandFlightInput(h.now, h.now); let seq = 0;
    sensor.activate(center); h.command({ type: "input-mode", value: "sensor" });
    const packet = (x: number) => { sensor.notePosition({ x: h.authority.simulation.ship.controlX, y: h.authority.simulation.ship.controlY }); sensor.accept({ role: "RIGHT_HAND", visible: true, x, y: .5, seq: ++seq, sentAtMs: h.now() }); h.step(sensor.sample()); };
    packet(.5); expect(h.command({ type: "start" })).toBe(true);
    for (let i = 0; i < 90; i++) packet(.5 + Math.min(.25, i * .005));
    expect(h.authority.simulation.ship.x).toBeGreaterThan(1);
    const held = { ...h.authority.simulation.ship }; packet(0);
    expect(sensor.status).toBe("discontinuity"); expect(h.authority.lifecycle).toBe("suspended"); expect(h.authority.simulation.ship).toEqual(held);
    packet(held.controlX); expect(h.authority.lifecycle).toBe("suspended"); expect(h.command({ type: "resume" })).toBe(true);
    sensor.dispose();
  });
  it("guards flight settings with the same lifecycle, revision and run checks", () => {
    const h = setup(), settings = { ...h.authority.snapshot().flightSettings, sensitivity: .5, maxTurnRate: 15, encounterSpacing: 8 };
    expect(h.command({ type: "flight-settings", value: settings })).toBe(true); expect(h.authority.snapshot().flightSettings).toEqual(settings);
    h.ack(); h.command({ type: "start" }); expect(h.command({ type: "flight-settings", value: settings })).toBe(false);
    expect(h.authority.simulation.config.flightSettings).toEqual(settings);
  });
  it("rejects legacy protocol state and malformed world poses without changing presentation", () => {
    const h = setup(), replica = new SessionReplica("room-a", "display-a"); sync(h.authority, replica, h.now());
    for (const version of [1,2]) expect(isSessionState({ ...h.authority.snapshot(), version })).toBe(false);
    const frame = h.authority.frame(h.now()), saved = replica.frame;
    expect(replica.receive({ version: 4, type: "frame", frame: { ...frame, ship: { x: 0, y: 0, bank: 0 } } }, h.now()+2)).toBe(false);
    expect(replica.receive({ version: 4, type: "frame", frame: { ...frame, ship: { ...frame.ship, yaw: NaN } } }, h.now()+2)).toBe(false);
    expect(replica.frame).toBe(saved);
  });
});

it("keyboard and existing sensor channel samples drive identical world trajectories", () => {
  const keyboard = setup(), sensor = setup(); sensor.command({ type: "input-mode", value: "sensor" });
  keyboard.step(); sensor.step(); keyboard.command({ type: "start" }); sensor.command({ type: "start" });
  for (let i = 0; i < 300; i++) { const pointer = i < 100 ? { x: .72, y: .4 } : i < 200 ? center : { x: .3, y: .65 }; keyboard.step(pointer); sensor.step(pointer); }
  expect(sensor.authority.simulation.ship).toEqual(keyboard.authority.simulation.ship);
  expect(sensor.authority.simulation.stats).toEqual(keyboard.authority.simulation.stats);
});
