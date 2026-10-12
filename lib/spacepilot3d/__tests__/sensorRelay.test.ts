import { expect, it } from 'vitest';
import { relayPointer } from '../sensorRelay';
const identity = { ownerId: 'owner', epoch: 2, runId: 3, inputEpoch: 4 };
const sample = { ...identity, version: 1, role: 'RIGHT_HAND', sourceToken: '11111111-1111-4111-8111-111111111111', sequence: 10, x: .7, y: .4, visible: true, updatedAt: 1000, sampleAgeMs: 10 };
it('preserves the protected pointer shape across device clock offsets using server age', () => {
  expect(relayPointer(sample, identity, 1100, 999999)).toEqual({ role: 'RIGHT_HAND', sourceToken: sample.sourceToken, x: .7, y: .4, visible: true, seq: 10, sentAtMs: 999889 });
});
it('rejects stale, wrong-role, old-run/epoch, nonfinite and out-of-bounds remote input', () => {
  expect(relayPointer(sample, identity, 1300, 1000)).toBeNull();
  for (const bad of [{ ...sample, role: 'LEFT_HAND' }, { ...sample, runId: 2 }, { ...sample, inputEpoch: 3 }, { ...sample, epoch: 1 }, { ...sample, ownerId: 'old' }, { ...sample, x: 2 }, { ...sample, y: NaN }, { ...sample, sequence: -1 }, { ...sample, sampleAgeMs: NaN }, { ...sample, sampleAgeMs: -1 }, { ...sample, sampleAgeMs: 200 }]) expect(relayPointer(bad, identity, 1100, 1000)).toBeNull();
});
