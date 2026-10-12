import { LIMBS, type Features, type Limb } from './engine';
/** No physical pose-recognition path: the existing normalized pointer cannot measure limb features. */
export const CAPABILITIES = Object.fromEntries(LIMBS.map(role => [role, { manual: true, simulated: true, physical: 'pending-hardware-validation', measurable: 'orientation and motion only; normalized pointer is not a joint angle' }]));
export class SimulatedLimbAdapter {
  private neutral: Features = { RIGHT_HAND: 0, LEFT_HAND: 0, RIGHT_FOOT: 0, LEFT_FOOT: 0 };
  private sequence = 0;
  private lastAt = 0;
  private armed = false;
  calibrate(values: Features) { this.neutral = { ...values }; this.armed = true; }
  disconnect() { this.armed = false; }
  sample(limb: Limb, measured: number, at: number, direction = 1) {
    if (!this.armed || !LIMBS.includes(limb) || !Number.isFinite(measured) || !Number.isFinite(at) || at < this.lastAt) return null;
    this.lastAt = at;
    const feature = Math.max(0, Math.min(1, (measured - this.neutral[limb]) * direction));
    return { measured, feature, inferredVisual: feature, limb, at, sequence: ++this.sequence, source: 'simulated' as const };
  }
}
