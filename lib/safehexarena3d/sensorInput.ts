/**
 * Prepared foot-sensor support for Safe Hex Arena.
 *
 * HONEST CAPABILITIES. A WT901 on a foot gives orientation and motion. It does NOT give an absolute 2D position
 * on the projected floor, and one IMU cannot say which hexagon the child stands on. So a foot sensor can only
 * ever contribute a MOVEMENT HINT ("the foot started moving", "came back to rest", "link lost"). The therapist
 * still confirms the tile; a movement hint never moves the child's tile and never counts as a safe transition.
 *
 * Nothing here talks to Bluetooth. Samples arrive from whichever shared source supplies a role
 * (`lib/physicalInput`, or the simulator below) as a normalised movement magnitude in 0..1.
 */
export const FOOT_ROLES = ['RIGHT_FOOT', 'LEFT_FOOT'] as const;
export type FootRole = (typeof FOOT_ROLES)[number];
export const INPUT_MODES = ['MANUAL', 'RIGHT_FOOT', 'LEFT_FOOT', 'DUAL_FOOT'] as const;
export type InputMode = (typeof INPUT_MODES)[number];
export type InputSource = 'manual' | 'simulated';

export function rolesForMode(mode: InputMode): readonly FootRole[] {
  return mode === 'MANUAL' ? [] : mode === 'DUAL_FOOT' ? FOOT_ROLES : [mode];
}

/** Capability matrix (also documented in docs/safehexarena3d/FINAL_REPORT.md). */
export const CAPABILITY_MATRIX: Record<InputMode, {
  manualTileConfirmation: true;
  movementOnset: 'simulated-only' | 'n/a';
  returnToRest: 'simulated-only' | 'n/a';
  freshness: 'simulated-only' | 'n/a';
  absoluteTile: false;
  physical: 'pending-hardware-validation' | 'n/a';
}> = {
  MANUAL: { manualTileConfirmation: true, movementOnset: 'n/a', returnToRest: 'n/a', freshness: 'n/a', absoluteTile: false, physical: 'n/a' },
  RIGHT_FOOT: { manualTileConfirmation: true, movementOnset: 'simulated-only', returnToRest: 'simulated-only', freshness: 'simulated-only', absoluteTile: false, physical: 'pending-hardware-validation' },
  LEFT_FOOT: { manualTileConfirmation: true, movementOnset: 'simulated-only', returnToRest: 'simulated-only', freshness: 'simulated-only', absoluteTile: false, physical: 'pending-hardware-validation' },
  DUAL_FOOT: { manualTileConfirmation: true, movementOnset: 'simulated-only', returnToRest: 'simulated-only', freshness: 'simulated-only', absoluteTile: false, physical: 'pending-hardware-validation' },
};

/** Conservative thresholds: a deliberate movement must be clear and sustained; a rest must be clearly still. */
export const FOOT_THRESHOLDS = {
  onsetLevel: 0.35,
  onsetHoldMs: 150,
  restLevel: 0.12,
  restHoldMs: 700,
  staleMs: 1500,
} as const;

export interface FootSample {
  role: string;
  /** Normalised movement magnitude 0..1 (not an angle, not a position). */
  magnitude: number;
  at: number;
  seq: number;
}

export type FootEventKind = 'onset' | 'rest' | 'lost' | 'resumed';
export interface FootEvent {
  role: FootRole;
  event: FootEventKind;
  at: number;
  seq: number;
}

interface RoleTrack {
  lastSeq: number;
  lastAt: number;
  moving: boolean;
  aboveSince: number | null;
  belowSince: number | null;
  lost: boolean;
  emitted: number;
}

/**
 * Turns magnitude samples into onset / rest / lost / resumed events for the roles the input mode allows.
 * Samples of any other role (hands, an unassigned device) are ignored. Stale or duplicate samples
 * (non-increasing sequence or time) are dropped. `poll` reports a role whose samples stopped arriving.
 */
export class FootMovementDetector {
  private tracks = new Map<FootRole, RoleTrack>();
  private allowed: readonly FootRole[];

  constructor(mode: InputMode) {
    this.allowed = rolesForMode(mode);
  }

  setMode(mode: InputMode): void {
    this.allowed = rolesForMode(mode);
    this.tracks.clear();
  }

  private track(role: FootRole): RoleTrack {
    let t = this.tracks.get(role);
    if (!t) {
      t = { lastSeq: 0, lastAt: 0, moving: false, aboveSince: null, belowSince: null, lost: false, emitted: 0 };
      this.tracks.set(role, t);
    }
    return t;
  }

  private emit(role: FootRole, t: RoleTrack, event: FootEventKind, at: number): FootEvent {
    return { role, event, at, seq: ++t.emitted };
  }

  push(sample: FootSample): FootEvent[] {
    const role = sample.role as FootRole;
    if (!this.allowed.includes(role)) return [];
    if (!Number.isFinite(sample.magnitude) || !Number.isFinite(sample.at) || !Number.isInteger(sample.seq)) return [];
    const t = this.track(role);
    if (sample.seq <= t.lastSeq || sample.at < t.lastAt) return [];
    t.lastSeq = sample.seq;
    t.lastAt = sample.at;
    const out: FootEvent[] = [];
    if (t.lost) {
      t.lost = false;
      out.push(this.emit(role, t, 'resumed', sample.at));
    }
    const m = Math.max(0, Math.min(1, sample.magnitude));
    if (!t.moving) {
      if (m >= FOOT_THRESHOLDS.onsetLevel) {
        t.aboveSince ??= sample.at;
        if (sample.at - t.aboveSince >= FOOT_THRESHOLDS.onsetHoldMs) {
          t.moving = true;
          t.aboveSince = null;
          t.belowSince = null;
          out.push(this.emit(role, t, 'onset', sample.at));
        }
      } else t.aboveSince = null;
    } else if (m <= FOOT_THRESHOLDS.restLevel) {
      t.belowSince ??= sample.at;
      if (sample.at - t.belowSince >= FOOT_THRESHOLDS.restHoldMs) {
        t.moving = false;
        t.belowSince = null;
        out.push(this.emit(role, t, 'rest', sample.at));
      }
    } else t.belowSince = null;
    return out;
  }

  /** Call regularly with the current time; emits `lost` once per role whose samples went stale. */
  poll(now: number): FootEvent[] {
    const out: FootEvent[] = [];
    for (const role of this.allowed) {
      const t = this.tracks.get(role);
      if (t && !t.lost && t.lastAt > 0 && now - t.lastAt > FOOT_THRESHOLDS.staleMs) {
        t.lost = true;
        t.moving = false;
        t.aboveSince = t.belowSince = null;
        out.push(this.emit(role, t, 'lost', now));
      }
    }
    return out;
  }
}

/**
 * Development/demo stand-in for the validated foot sources: produces the samples a real foot would, so the whole
 * path (detector, reducer, Control banner, manual fallback) can be exercised without hardware.
 */
export class SimulatedFootSource {
  private seq = new Map<FootRole, number>();
  private disconnected = new Set<FootRole>();

  sample(role: FootRole, magnitude: number, at: number): FootSample | null {
    if (this.disconnected.has(role)) return null;
    const seq = (this.seq.get(role) ?? 0) + 1;
    this.seq.set(role, seq);
    return { role, magnitude, at, seq };
  }
  setConnected(role: FootRole, connected: boolean): void {
    if (connected) this.disconnected.delete(role);
    else this.disconnected.add(role);
  }
  isConnected(role: FootRole): boolean {
    return !this.disconnected.has(role);
  }
}
