from __future__ import annotations

import unittest

from tools.witmotion_ble.calibration_engine import (
    BaselineProfile,
    MotionSample,
    PersonalizedMovementDetector,
    ReleaseDetector,
)


def sample(t: float, pitch: float = 0.0, gyro_y: float = 0.0, acc_x: float = 0.0) -> MotionSample:
    return MotionSample(t, (acc_x, 0.0, 1.0), (0.0, gyro_y, 0.0), (0.0, pitch, 0.0))


class PersonalizedDetectorTests(unittest.TestCase):
    def setUp(self) -> None:
        neutral = [sample(i * 0.1, pitch=(i % 3 - 1) * 0.05, gyro_y=(i % 2) * 0.1) for i in range(40)]
        self.baseline = BaselineProfile.from_samples(neutral)

    def test_slow_small_movement_and_release(self) -> None:
        detector = PersonalizedMovementDetector(self.baseline, 4.0)
        result = None
        for index in range(25):
            pitch = min(2.0, index * 0.15)
            result = detector.observe(sample(4.0 + index * 0.1, pitch=pitch, gyro_y=0.4)) or result
        for index in range(5):
            result = detector.observe(sample(6.5 + index * 0.1, pitch=2.0, gyro_y=0.0)) or result
        self.assertIsNotNone(result)
        assert result is not None
        release = ReleaseDetector(self.baseline, result)
        self.assertFalse(release.observe(sample(7.1, pitch=2.0)))
        released = False
        for index in range(15):
            released = release.observe(sample(7.2 + index * 0.1, pitch=0.02)) or released
        self.assertTrue(released)

    def test_release_allows_orthogonal_rest_pose_drift(self) -> None:
        detector = PersonalizedMovementDetector(self.baseline, 4.0)
        result = None
        for index in range(20):
            result = detector.observe(sample(4.0 + index * 0.1, pitch=min(2.0, index * 0.2), gyro_y=0.5)) or result
        for index in range(5):
            result = detector.observe(sample(6.0 + index * 0.1, pitch=2.0)) or result
        assert result is not None
        release = ReleaseDetector(self.baseline, result)
        released = False
        for index in range(15):
            # Roll/yaw drift would defeat an exact three-axis neutral match, but
            # the enrolled pitch direction has returned and the new pose is calm.
            s = MotionSample(7.0 + index * 0.1, (0.0, 0.0, 1.0), (0.0, 0.1, 0.0), (15.0, 0.02, 25.0))
            released = release.observe(s) or released
        self.assertTrue(released)

    def test_tiny_oscillation_is_not_accepted(self) -> None:
        detector = PersonalizedMovementDetector(self.baseline, 4.0)
        accepted = None
        for index in range(80):
            pitch = 0.12 if index % 2 else -0.12
            accepted = detector.observe(sample(4.0 + index * 0.1, pitch=pitch, gyro_y=4.0, acc_x=0.005)) or accepted
        self.assertIsNone(accepted)

    def test_sudden_coherent_movement_is_accepted_once(self) -> None:
        detector = PersonalizedMovementDetector(self.baseline, 4.0)
        result = None
        values = [
            (0.0, 0.0, 0.0),
            (0.3, 8.0, 0.03),
            (0.8, 12.0, 0.05),
            (1.4, 8.0, 0.04),
            (1.6, 1.0, 0.01),
            (1.6, 0.2, 0.005),
        ]
        for index, (pitch, gyro, acceleration) in enumerate(values):
            result = detector.observe(sample(4.0 + index * 0.1, pitch=pitch, gyro_y=gyro, acc_x=acceleration)) or result
        self.assertIsNotNone(result)


if __name__ == "__main__":
    unittest.main()
