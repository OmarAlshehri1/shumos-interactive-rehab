/**
 * Read-only visual projection of the authoritative simulation. Between two authoritative samples
 * (a Firebase clock arrives about once a second) the Display re-runs the SAME deterministic
 * kinematics Control uses (`tickSession`: acceleration, braking, hold lines, pause-before-obstacle)
 * on a private shadow copy, so the runner keeps moving smoothly AND stops where Control stops.
 *
 * The shadow is for motion only. It is never used for stars, outcomes or lifecycle: those come
 * exclusively from the authoritative state. Every new authoritative sample replaces the shadow.
 */
import { createSession, tickSession } from "./session";
import type { DisplayState } from "./protocol";
import type { Session } from "./types";

const STEP_MS = 50;

export class ShadowSim {
  private s: Session | null = null;

  reset(state: DisplayState, distance: number, speed: number): void {
    const s = createSession({
      sessionId: "shadow", sessionEpoch: 0, seed: state.seed, startIndex: state.stageIndex, endIndex: state.stageIndex,
      settings: { speed: state.targetSpeed, spacing: state.spacingUsed, footLiftRequired: state.footLiftRequired, pauseBeforeObstacle: state.pauseBeforeObstacle },
    });
    const st = s.stage!;
    if (st.obstacles.length !== state.armed.length) { this.s = null; return; } // plan mismatch: fall back to no projection
    st.distance = Math.min(distance, st.length);
    st.speed = speed;
    st.lane = state.lane;
    st.obstacles.forEach((o, i) => { o.armed = state.armed[i]; o.resolved = state.resolved[i]; });
    s.lifecycle = "playing";
    this.s = s;
  }

  /** Advances the shadow by `ms` of authoritative time (only meaningful while Control is playing). */
  advance(ms: number): void {
    if (!this.s) return;
    let left = ms;
    while (left > 0 && this.s.lifecycle === "playing") {
      const d = Math.min(STEP_MS, left);
      tickSession(this.s, d);
      left -= d;
    }
  }

  get distance(): number | null { return this.s?.stage?.distance ?? null; }
  get speed(): number { return this.s?.lifecycle === "playing" ? (this.s.stage?.speed ?? 0) : 0; }
  get active(): boolean { return this.s !== null; }
}
