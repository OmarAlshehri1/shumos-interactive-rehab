import type { CrossAxisCalibrationEvidence } from "./RightHandSessionProfile";

/**
 * ONE SPECIFIC ADULT'S OWN cross-axis calibration evidence — Omar's
 * RIGHT_HAND, derived by `deriveCrossAxisCalibration` from his
 * 2026-09-04 real 11,402-sample session's own `up`/`down`/`left`/`right`
 * phases (`tools/witmotion_ble/real_dataset/raw/
 * wt901-right-hand-final-session-1788527323549.json`; numbers verified
 * against `final_session_cross_coupling_report.json`'s
 * `calibration_matrix` section).
 *
 * NOT `ContinuousMotionConfig.crossAxisCalibration`'s default (that stays
 * `null` — see that field's own doc comment) and NOT exported from
 * `lib/physicalInput/index.ts` as a general-purpose value. This exists so
 * screens that already know they are testing/replaying THIS SAME adult's
 * own RIGHT_HAND evidence (`RightHandTwistInvarianceScreen.tsx`,
 * offline replay scripts) can reuse it explicitly, instead of
 * re-deriving it or — worse — some other screen accidentally treating one
 * adult's mounting/biomechanics as a universal pediatric default. A real
 * future patient's own session should call `deriveCrossAxisCalibration`
 * on THEIR OWN captured phases, never import this constant.
 */
export const RIGHT_HAND_ADULT_2026_09_04_SESSION_CALIBRATION: CrossAxisCalibrationEvidence = {
  matrix: [
    [0.9968752603593519, 0.11005764226383348],
    [-0.18590835990159593, 0.9855511407612992],
  ],
  angleBetweenAxesDeg: 85.61768636908381,
  sampleCounts: { up: 276, down: 264, left: 254, right: 290 },
};
