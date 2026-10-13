/**
 * Therapist-held controller as a CONFIRMATION button. It follows the platform's Gamepad conventions (see
 * lib/pearlvoyage3d/input.ts and lib/games/library/capabilities.ts `drivingDeviceReady`): standard Gamepad API, nothing
 * product-specific, a therapist-configurable button index, freshness gating, and sampling inside the game's single
 * session loop (no second polling engine). A press here means "the therapist says the child did the exercise". It is
 * never proof of anything physical. Physical Joy-Con / Bluetooth compatibility is NOT claimed until real hardware is tested.
 */
export interface PadLike {
  connected: boolean;
  timestamp: number;
  buttons: readonly { pressed?: boolean; value?: number }[];
}
export interface PadMapping {
  version: 1;
  deviceIndex: number;
  /** Index of the confirmation button in `buttons`. */
  button: number;
  /** A press is accepted only when the pad's own timestamp is this recent (ms). */
  freshMs: number;
}
export const DEFAULT_PAD_MAPPING: PadMapping = { version: 1, deviceIndex: 0, button: 0, freshMs: 500 };
export const PAD_MAPPING_KEY = 'shumos.achievementCity.pad.v1';
/** Two accepted presses of the same button closer than this are one (contact bounce / double tap). */
export const PAD_DEBOUNCE_MS = 300;

export function sanitizePadMapping(raw: unknown): PadMapping | null {
  try {
    const r = raw as PadMapping;
    if (!r || r.version !== 1 || !Number.isInteger(r.deviceIndex) || r.deviceIndex < 0 || r.deviceIndex > 15) return null;
    if (!Number.isInteger(r.button) || r.button < 0 || r.button > 63) return null;
    if (!Number.isFinite(r.freshMs) || r.freshMs < 100 || r.freshMs > 2000) return null;
    return { version: 1, deviceIndex: r.deviceIndex, button: r.button, freshMs: r.freshMs };
  } catch {
    return null;
  }
}

export type PadStatus = 'none' | 'connected' | 'lost';

const isDown = (b: PadLike['buttons'][number] | undefined) => !!b && (b.pressed === true || (b.value ?? 0) > 0.5);

/**
 * Edge detector. Fires exactly once per physical press:
 *  - it must first SEE the button released (a button already held when the pad appears or reconnects never fires);
 *  - holding does not repeat;
 *  - a press is rejected when the pad's own state is stale (>freshMs old);
 *  - presses closer than PAD_DEBOUNCE_MS are one.
 */
export class ButtonEdgeDetector {
  private armed = false;
  private down = false;
  private lastFire = -Infinity;
  private seen = false;
  status: PadStatus = 'none';
  /** Presses rejected for staleness / debounce (diagnostics only). */
  rejected = 0;

  reset() {
    this.armed = false;
    this.down = false;
  }

  /** `now` and `pad.timestamp` must be on the same clock (performance.now()). Returns true on a fresh press edge. */
  push(pad: PadLike | null | undefined, mapping: PadMapping, now: number): boolean {
    if (!pad || !pad.connected) {
      this.status = this.seen ? 'lost' : 'none';
      this.reset();
      return false;
    }
    this.seen = true;
    this.status = 'connected';
    const pressed = isDown(pad.buttons[mapping.button]);
    if (!pressed) {
      this.armed = true;
      this.down = false;
      return false;
    }
    if (this.down || !this.armed) {
      this.down = true;
      return false;
    }
    this.down = true;
    const fresh = Number.isFinite(pad.timestamp) && pad.timestamp > 0 && now - pad.timestamp >= -50 && now - pad.timestamp <= mapping.freshMs;
    if (!fresh || now - this.lastFire < PAD_DEBOUNCE_MS) {
      this.rejected++;
      return false;
    }
    this.lastFire = now;
    return true;
  }
}

/** Index of the first pressed button of `pad` that is not in `previouslyDown` (used to assign the confirmation button). */
export function newlyPressedButton(pad: PadLike | null | undefined, previouslyDown: ReadonlySet<number>): number {
  if (!pad?.connected) return -1;
  for (let i = 0; i < pad.buttons.length; i++) if (isDown(pad.buttons[i]) && !previouslyDown.has(i)) return i;
  return -1;
}
export const downSet = (pad: PadLike | null | undefined): Set<number> => {
  const out = new Set<number>();
  if (pad?.connected) pad.buttons.forEach((b, i) => { if (isDown(b)) out.add(i); });
  return out;
};
