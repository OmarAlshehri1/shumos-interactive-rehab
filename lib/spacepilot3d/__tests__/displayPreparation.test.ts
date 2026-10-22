import { expect, it } from 'vitest';
import { GAME_REGISTRY } from '@/lib/games/registry';
import { displayMayRenderGame } from '@/lib/display/sessionPresentation';
import { SessionAuthority } from '../sessionAuthority';
import { NINE_STAGE_CURRICULUM } from '../curriculum';
import { decodeCheckpoint, spacePilotLiveSession } from '../cloudState';
import { spacePilotNeedsPreparation } from '../displayPreparation';

function fixture() {
  const id = crypto.randomUUID();
  const authority = new SessionAuthority(id, crypto.randomUUID(), id, 'LOW', 3000, NINE_STAGE_CURRICULUM);
  const live = spacePilotLiveSession(authority, 100, 'اختبار', 'staff', { createdAt: 1, startedAt: 0, endedAt: 0, epoch: 1 }, {});
  return { authority, live };
}

it('prepares a validated Space Pilot setup while the shared visible-game gate stays closed', () => {
  const { live } = fixture(), before = JSON.stringify(live);
  expect(spacePilotNeedsPreparation(live, 'space-pilot')).toBe(true);
  expect(displayMayRenderGame(live, 'space-pilot')).toBe(false);
  expect(decodeCheckpoint(live)?.state).toMatchObject({ lifecycle: 'ready', elapsedSeconds: 0, eventSequence: 0 });
  expect(JSON.stringify(live)).toBe(before);
});

it('never applies the preparation exception to another canonical game or a legacy/malformed session', () => {
  const { live } = fixture();
  for (const game of GAME_REGISTRY.filter(game => game.id !== 'space-pilot')) expect(spacePilotNeedsPreparation(live, game.id)).toBe(false);
  for (const session of [null, {}, { ...live, engine: 'legacy' }, { ...live, sp3: { ...live.sp3, payload: '{}' } }]) expect(spacePilotNeedsPreparation(session, 'space-pilot')).toBe(false);
  expect(spacePilotNeedsPreparation(live, null)).toBe(false);
});

it('cannot start simulation merely by preparing it; real rendered readiness and explicit Start remain required', () => {
  const { authority, live } = fixture();
  expect(spacePilotNeedsPreparation(live, 'space-pilot')).toBe(true);
  authority.tick(100); authority.tick(200);
  expect(authority.lifecycle).toBe('ready');
  expect(authority.canPlay(200)).toBe(false);
  expect(authority.command({ type: 'start' }, authority.revision, authority.simulation.runId, 200)).toBe(false);
  expect(authority.snapshot().elapsedSeconds).toBe(0);
});

it('does not prepare running, paused or ended presentation', () => {
  const { authority } = fixture();
  for (let sequence = 1; sequence <= 2; sequence++) {
    const frame = authority.frame(100);
    expect(authority.receive({ version: 4, type: 'ack', displayId: 'display', ownerId: authority.ownerId,
      sessionId: authority.sessionId, runId: frame.runId, inputEpoch: frame.inputEpoch,
      frameSequence: frame.sequence, sequence, visible: true, ready: true }, 100)).toBe(true);
  }
  expect(authority.canPlay(100)).toBe(true);
  expect(authority.lifecycle).toBe('ready'); // Readiness alone never starts the game.
  for (const type of ['start', 'pause', 'end'] as const) {
    expect(authority.command({ type }, authority.revision, authority.simulation.runId, 100)).toBe(true);
    const live = spacePilotLiveSession(authority, 100, 'اختبار', 'staff', { createdAt: 1, startedAt: 100, endedAt: type === 'end' ? 100 : 0, epoch: 1 }, {});
    expect(decodeCheckpoint(live)).not.toBeNull();
    expect(spacePilotNeedsPreparation(live, 'space-pilot')).toBe(false);
  }
});
