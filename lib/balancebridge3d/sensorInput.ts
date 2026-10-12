import type { MotionSample, PhysicalRole } from "@/lib/physicalInput/types";
import type { PhysicalInputManager } from "@/lib/physicalInput/PhysicalInputManager";
import type { Mode } from "./engine";
export type FootHint = "unavailable" | "movement" | "rest";
/** Shared normalized IMU samples are advisory. This adapter has no reducer/action callback by design. */
export class FootHints {
  private last = new Map<string, { at: number; moving: boolean }>();
  observe(
    role: PhysicalRole,
    sample: MotionSample,
    mode: Mode,
    now: number,
  ): FootHint {
    if (
      !Number.isFinite(sample.timestampMs) ||
      !Number.isFinite(now) ||
      sample.timestampMs < 0 ||
      now < 0 ||
      !["RIGHT_FOOT", "LEFT_FOOT"].includes(role) ||
      (mode !== role && mode !== "DUAL_FOOT") ||
      now - sample.timestampMs < 0 ||
      now - sample.timestampMs > 500 ||
      !sample.gyroscopeDps.every(Number.isFinite)
    ) {
      this.last.delete(role);
      return "unavailable";
    }
    const moving = Math.hypot(...sample.gyroscopeDps) > 12;
    this.last.set(role, { at: sample.timestampMs, moving });
    return moving ? "movement" : "rest";
  }
  current(role: PhysicalRole, now: number): FootHint {
    const s = this.last.get(role);
    if (!s || !Number.isFinite(now) || now - s.at < 0 || now - s.at > 500)
      return "unavailable";
    return s.moving ? "movement" : "rest";
  }
  clear(role: PhysicalRole) {
    this.last.delete(role);
  }
}
/** Prepared connection point for an assigned shared FOOT role; never creates a Bluetooth source. */
export function subscribeFootHints(
  manager: PhysicalInputManager,
  mode: () => Mode,
  onHint: (role: PhysicalRole, hint: FootHint) => void,
  now = () => performance.now(),
) {
  const hints = new FootHints();
  return manager.onSampleObserved((role, sample) => {
    if (role === "RIGHT_FOOT" || role === "LEFT_FOOT")
      onHint(role, hints.observe(role, sample, mode(), now()));
  });
}
