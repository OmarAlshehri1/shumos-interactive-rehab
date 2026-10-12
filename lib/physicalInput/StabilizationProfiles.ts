import { DEFAULT_INTENT_GATE_CONFIG, type MotionIntentGateConfig } from "./MotionFilters";

/**
 * Pediatric jitter/tremor assistance, as three named levels a therapist can
 * pick without seeing coherence-threshold numbers — see
 * `ContinuousMotionController`'s `stabilizationLevel` config field, which
 * selects one of these to build its `MotionIntentGate`.
 *
 * MEDIUM is not a new number: it is `DEFAULT_INTENT_GATE_CONFIG` verbatim —
 * the same constants already validated offline against real still-phase
 * data (`tools/witmotion_ble/real_dataset/tune_intent_gate.py`,
 * `analyze_still_noise.py`) and shipped today. Picking MEDIUM must be a
 * pure no-op for every existing caller.
 *
 * HIGH/LOW are principled offsets from that same validated MEDIUM center,
 * not independently-fit thresholds — there is no real TREMOR dataset yet
 * (the one adult RIGHT_HAND session this evening, `wt901-right-hand-
 * final-session-1788527323549.json`, has no tremor; its held-position
 * jitter — pointer RMS 0.0048-0.0073, p95 0.009-0.012 of the full [0,1]
 * range, gyro MAD 0.37-0.79 deg/s per axis, see
 * `tools/witmotion_ble/real_dataset/final_session_cross_coupling_report.json`
 * — is exactly what MEDIUM's coherence thresholds were already shown to
 * comfortably clear). Widening/narrowing the coherence band by a fixed
 * ratio around that same measured-quiet center is an honest "more/less
 * assist" lever until a real tremor-bearing capture exists to refit HIGH
 * against; that is a known limitation, not hidden.
 */
export type StabilizationLevel = "LOW" | "MEDIUM" | "HIGH";

export const STABILIZATION_LEVELS: Readonly<Record<StabilizationLevel, MotionIntentGateConfig>> = {
  MEDIUM: DEFAULT_INTENT_GATE_CONFIG,
  /**
   * Stronger rejection of oscillatory tremor while preserving accumulated
   * intentional directional movement (brief's own wording): a wobblier
   * path must look straighter (higher coherenceLow/High) before intent
   * gain ramps up, and the floor gain while judged incoherent is lower
   * (holds position tighter against tremor) — fastBypass is left
   * unchanged so a genuinely fast deliberate movement is never slowed
   * down at any level, only how a SLOW/small motion's shape is judged.
   */
  HIGH: {
    windowMs: DEFAULT_INTENT_GATE_CONFIG.windowMs,
    coherenceLow: 0.5,
    coherenceHigh: 0.85,
    fastBypassUnitsPerSec: DEFAULT_INTENT_GATE_CONFIG.fastBypassUnitsPerSec,
    minGain: 0.06,
  },
  /** Minimal assistance: a less-straight path still reaches full gain sooner, and the incoherent floor is higher (less holding-back). */
  LOW: {
    windowMs: DEFAULT_INTENT_GATE_CONFIG.windowMs,
    coherenceLow: 0.2,
    coherenceHigh: 0.55,
    fastBypassUnitsPerSec: DEFAULT_INTENT_GATE_CONFIG.fastBypassUnitsPerSec,
    minGain: 0.25,
  },
};
