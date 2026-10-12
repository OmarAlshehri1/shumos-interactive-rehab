import { isPointer, isRecord, isSequence } from './sessionContract';
import { roomValid } from './cloudState';
import { SENSOR_STALE_MS } from './sensorInput';
import type { LocalPointerMessage } from '@/lib/display/LocalPointerChannel';
export interface RelaySample {
  version: 1; role: 'RIGHT_HAND'; ownerId: string; epoch: number; runId: number; inputEpoch: number;
  sourceToken: string; sequence: number; x: number; y: number; visible: boolean; updatedAt: number; sampleAgeMs: number;
}
/** Translate server age, never compare wall clocks from different devices. */
export function relayPointer(raw: unknown, identity: { ownerId: string; epoch: number; runId: number; inputEpoch: number }, serverNow: number, localNow: number): (LocalPointerMessage & { sourceToken: string }) | null {
  if (!isRecord(raw) || raw.version !== 1 || raw.role !== 'RIGHT_HAND' || !roomValid(raw.sourceToken) ||
    !isSequence(raw.sequence) || !isPointer(raw) || typeof raw.visible !== 'boolean' || typeof raw.updatedAt !== 'number' ||
    !Number.isFinite(raw.updatedAt) || typeof raw.sampleAgeMs !== 'number' || !Number.isFinite(raw.sampleAgeMs) || raw.sampleAgeMs < 0 || raw.sampleAgeMs > SENSOR_STALE_MS || !Object.entries(identity).every(([key, value]) => raw[key] === value)) return null;
  const age = serverNow - raw.updatedAt;
  if (age < -1000 || age + raw.sampleAgeMs > SENSOR_STALE_MS) return null;
  return { role: 'RIGHT_HAND', x: raw.x, y: raw.y, visible: raw.visible, seq: raw.sequence,
    sentAtMs: localNow - Math.max(0, age) - raw.sampleAgeMs, sourceToken: raw.sourceToken };
}
