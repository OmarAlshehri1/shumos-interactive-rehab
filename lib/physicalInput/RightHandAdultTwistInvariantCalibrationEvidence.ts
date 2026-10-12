import type { CrossAxisCalibrationEvidence } from "./RightHandSessionProfile";

/**
 * ONE SPECIFIC ADULT'S OWN personalized screen-axis-alignment matrix FOR
 * THE ROLL_INVARIANT_TRANSVERSE_FRAME geometry — Omar's RIGHT_HAND,
 * derived by the same PCA + external-sign-reference method as
 * `deriveCrossAxisCalibration` (RightHandSessionProfile.ts), but fit
 * against the (aim_h, aim_v) -> pointer output of the NEW gravity-
 * projected transverse-basis model (see ContinuousMotionController.ts's
 * `twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME"`), not the old
 * scalar-de-roll frame `RightHandAdultCalibrationEvidence.ts`'s matrix is
 * for. The two are NOT interchangeable — this frame's raw (aim_h, aim_v)
 * axes don't even correspond to (x, y) in the same handedness as the old
 * frame's (aim_yaw, aim_pitch); the calibration matrix is what resolves
 * that, per-frame.
 *
 * Source: the 2026-09-04 TWIST_INVARIANCE capture (4,960 real samples,
 * `tools/witmotion_ble/real_dataset/raw/
 * wt901-right-hand-twist-invariance-1788531321165.json`), using its
 * `neutral_up`/`neutral_down`/`neutral_left`/`neutral_right` phases only
 * (the roll-invariant model's error at ~45°/~90° roll is what this same
 * matrix, fit ONLY on neutral-roll data, achieves — that's the point of
 * roll invariance). See `tools/witmotion_ble/real_dataset/
 * analyze_twist_invariance_capture.py` and its
 * `twist_invariance_replay_report.json` output for the full validation
 * (mean directional error ~2° at 0° roll, ~2° at ~45°, ~4° at ~90°, vs.
 * ~9°/~53°/~81° for the shipped FROZEN_AT_RECENTER default).
 *
 * NOT a default anywhere in `ContinuousMotionConfig` (stays `null` there —
 * see that field's own doc comment) and NOT exported from
 * `lib/physicalInput/index.ts`. A real future patient's own enrollment
 * should call `deriveCrossAxisCalibration` on THEIR OWN captured phases
 * (replayed through this same roll-invariant model) rather than import
 * this constant.
 */
export const RIGHT_HAND_ADULT_2026_09_04_TWIST_INVARIANT_CALIBRATION: CrossAxisCalibrationEvidence = {
  matrix: [
    [0.06844522504384973, -0.99776377346668],
    [-0.9986642259056224, -0.05373137230794926],
  ],
  angleBetweenAxesDeg: 89.15546526222502,
  sampleCounts: { up: 794, down: 332, left: 268, right: 226 },
};
