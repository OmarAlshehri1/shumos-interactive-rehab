import { describe, expect, it } from 'vitest';
import { decodeCheckpoint, isSpacePilotLive, recoverAuthority, reviveSpacePilotLive, spacePilotLiveSession, type SpacePilotLiveSession } from '../cloudState';
import { SessionAuthority } from '../sessionAuthority';
import { ringCounts, type FlightMode } from '../rings';
import { pointerForHeading } from '../worldFlight';
import { buildStoredRingSession, isRingHistory } from '../history';
import { reviveAnyStoredSession } from '@/lib/sessions/sessionHistoryRepository';
import type { FlightDifficulty } from '../missions';

const id = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222';
/** What Realtime Database does to a value: drops nulls and empty arrays/objects on read-back. */
function rtdb<T>(value: T): T {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) { const items = v.map(strip); return items.length ? items : undefined; }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) { const r = strip(x); if (r !== null && r !== undefined) out[k] = r; }
      return Object.keys(out).length ? out : undefined;
    }
    return v;
  };
  return strip(JSON.parse(JSON.stringify(value))) as T;
}
function room(a: SessionAuthority): SpacePilotLiveSession {
  return spacePilotLiveSession(a, 1000, 'ليلى', 'staff', { createdAt: 100, startedAt: 200, endedAt: ['completed', 'ended'].includes(a.lifecycle) ? 1000 : 0, epoch: 1 }, { controlTabId: 'tab-1', heartbeatAt: 1000 });
}
function ack(a: SessionAuthority, now: number, sequence: number) {
  const f = a.frame(now); a.receive({ version: 4, type: 'ack', displayId: 'display', ownerId: a.ownerId,
    sessionId: a.sessionId, runId: f.runId, inputEpoch: f.inputEpoch, frameSequence: f.sequence, sequence, visible: true, ready: true }, now);
}
function create(difficulty: FlightDifficulty = 'MEDIUM', mode: FlightMode = 'ADVANCED') {
  const a = new SessionAuthority(id, owner, id, difficulty, 3000);
  a.command({ type: 'accessibility', value: { ...a.simulation.config.accessibility, mode } }, a.revision, a.simulation.runId, 0);
  a.manual({ x: .5, y: .5 }, true); ack(a, 0, 1); ack(a, 0, 2);
  expect(a.command({ type: 'start' }, a.revision, a.simulation.runId, 0)).toBe(true);
  return a;
}
const cases = (['EASY', 'MEDIUM', 'ADVANCED'] as FlightMode[]).flatMap(mode => (['LOW', 'MEDIUM', 'HIGH'] as FlightDifficulty[]).map(difficulty => ({ mode, difficulty })));
describe('Firebase checkpoint and manual flight authority', () => {
  it.each(cases)('completes all three $mode/$difficulty missions manually with unique ring events', ({ mode, difficulty }) => {
    const a = create(difficulty, mode); let now = 0, sequence = 2;
    for (let mission = 0; mission < 3; mission++) {
      for (let i = 0; i < 15000 && a.lifecycle === 'running'; i++) {
        now += 1000 / 60; if (i % 20 === 0) ack(a, now, ++sequence);
        const sim = a.simulation, o = sim.objects.find(o => o.outcome === 'pending')!;
        const depth = Math.max(1, sim.ship.z - o.z);
        const targetX = o.kind === 'ring' ? o.x : o.x + (o.x > 0 ? -10 : 10);
        const p = pointerForHeading(Math.atan2(targetX - sim.ship.x, depth), Math.atan2(o.y - sim.ship.y, Math.hypot(depth, targetX - sim.ship.x)), sim.config.flightSettings.sensitivity, sim.config.flightSettings.headingLimit);
        a.manual(p, true); a.tick(now);
      }
      expect(['mission-complete', 'completed']).toContain(a.lifecycle);
      if (mission < 2) { ack(a, now, ++sequence); expect(a.command({ type: 'next-mission' }, a.revision, a.simulation.runId, now)).toBe(true); }
    }
    expect(a.simulation.stats).toMatchObject({ ringsCollected: ringCounts(difficulty).rings, completedMissions: 3, resolved: 18, upgradeTier: 3 });
    expect(new Set(a.outcomes.map(e => `${e.sessionId}/${e.runId}/${e.objectId}`)).size).toBe(18);
    const r = room(a); expect(r.sp3.payload.length).toBeLessThan(32768); expect(decodeCheckpoint(r)).not.toBeNull();
    const history = buildStoredRingSession(r, 'patient', 'staff'); expect(isRingHistory(reviveAnyStoredSession(history))).toBe(true);
    expect(history).not.toHaveProperty('totalStarsCollected');
  });
  it('recovers geometry, accepted outcomes and counters without replaying or resuming', () => {
    const a = create(); for (let i = 0; i < 60; i++) { ack(a, i * 16, i + 3); a.tick(i * 16); }
    const r = room(a), recovered = recoverAuthority(r, owner);
    expect(recovered.lifecycle).toBe('suspended'); expect(recovered.simulation.ship).toEqual(a.simulation.ship);
    expect(recovered.snapshot().stats).toEqual(a.snapshot().stats); expect(recovered.simulation.missionSeconds).toBe(a.simulation.missionSeconds);
    expect(recovered.inputEpoch).toBeGreaterThan(a.inputEpoch);
    recovered.tick(1001); expect(recovered.simulation.ship).toEqual(a.simulation.ship);
    // Platform record: valid, revivable after Realtime Database's null/empty-array stripping, and fail-closed when tampered or inconsistent.
    expect(isSpacePilotLive(r)).toBe(true);
    expect(reviveSpacePilotLive(rtdb(r))?.sp3.payload).toBe(r.sp3.payload);
    expect(reviveSpacePilotLive(rtdb(r))?.currentStage.stageNumber).toBeGreaterThanOrEqual(1);
    expect(decodeCheckpoint({ ...r, sp3: { ...r.sp3, run: 99 } })).toBeNull();
    expect(decodeCheckpoint({ ...r, sp3: { ...r.sp3, status: 'ended' } })).toBeNull();
    expect(decodeCheckpoint({ ...r, sp3: { ...r.sp3, ownerToken: '33333333-3333-4333-8333-333333333333' } })).toBeNull();
    expect(decodeCheckpoint({ ...r, sp3: { ...r.sp3, payload: 'x'.repeat(32769) } })).toBeNull();
    expect(reviveSpacePilotLive({ engine: 'sp3' })).toBeNull();
    expect(r.config.childFirstName).toBe('ليلى');
    expect(r.sp3.payload).not.toMatch(/ليلى|patient/); // no identity inside the checkpoint
  });
  it('rejects stale actions; neutral releases manual steering and sensor override needs pickup', () => {
    const a = create(); expect(a.command({ type: 'restart' }, a.revision - 1, a.simulation.runId, 0)).toBe(false);
    a.manual({ x: 1, y: 0 }, true); a.tick(0); a.tick(100);
    expect(a.simulation.ship.controlX).toBe(1); a.manual({ x: .5, y: .5 }, false); a.tick(200);
    expect(a.simulation.ship.controlX).toBe(.5);
    a.command({ type: 'input-mode', value: 'sensor' }, a.revision, a.simulation.runId, 200);
    ack(a, 200, 100); a.manual({ x: .5, y: .5 }, true);
    expect(a.command({ type: 'resume' }, a.revision, a.simulation.runId, 200)).toBe(true);
    a.tick(220); a.manual(null, false); a.tick(240, null, 'stale');
    expect(a.lifecycle).toBe('suspended'); expect(a.reason).toBe('input-unavailable');
  });
  it('stops safely on lost Display and preserves ring/star history version boundaries', () => {
    const a = create(); a.tick(0); a.tick(3100); expect(a.lifecycle).toBe('suspended');
    const legacy = { gameId: 'space-pilot', sessionId: 'old', patientId: 'p', createdByUid: 'staff', totalStarsPresented: 2, totalStarsCollected: 1 };
    const revived = reviveAnyStoredSession(legacy); expect(isRingHistory(revived)).toBe(false); expect(revived).toMatchObject({ totalStarsCollected: 1 });
    expect(reviveAnyStoredSession({ ...legacy, resultVersion: 999 })).toBeNull();
  });
});

it.each(cases)('touch-direction pulses can collect every ring in $mode/$difficulty without a sensor', ({ mode, difficulty }) => {
  const a = create(difficulty, mode); let now = 0, sequence = 2;
  let p = { x: .5, y: .5 };
  for (let mission = 0; mission < 3; mission++) {
    for (let i = 0; i < 15000 && a.lifecycle === 'running'; i++) {
      now += 1000 / 60; if (i % 20 === 0) ack(a, now, ++sequence);
      if (i % 6 === 0) {
        const sim = a.simulation, o = sim.objects.find(o => o.outcome === 'pending')!;
        const depth = Math.max(10, sim.ship.z - o.z);
        const targetX = o.kind === 'ring' ? o.x : o.x + (o.x > 0 ? -10 : 10);
        const yaw = Math.atan2((targetX - sim.ship.x) * 2, depth);
        const pitch = Math.atan2((o.y - sim.ship.y) * 2, depth);
        const direction = (target: number, current: number) => Math.abs(target) > .005 && (Math.sign(target) !== Math.sign(current) || Math.abs(current) < Math.abs(target)) ? Math.sign(target) : 0;
        p = { x: .5 + direction(yaw, sim.ship.yaw) * .5, y: mode === 'ADVANCED' ? .5 - direction(pitch, sim.ship.pitch) * .5 : .5 };
      }
      a.manual(p, true); a.tick(now);
    }
    expect(['mission-complete', 'completed']).toContain(a.lifecycle);
    if (mission < 2) { ack(a, now, ++sequence); a.command({ type: 'next-mission' }, a.revision, a.simulation.runId, now); }
  }
  expect(a.simulation.stats.ringsCollected).toBe(ringCounts(difficulty).rings);
  expect(a.simulation.stats.asteroidCollisions).toBe(0);
});
