import unittest

from tools.witmotion_ble.protocol import WitmotionFrameStream, parse_realtime_frame


class ProtocolTest(unittest.TestCase):
    def test_realtime_scaling(self) -> None:
        frame = bytes.fromhex(
            "55 61 00 40 00 c0 00 20 00 10 00 f0 ff 7f 00 40 00 c0 00 20"
        )
        data = parse_realtime_frame(frame)
        self.assertEqual(data.acceleration_g, (8.0, -8.0, 4.0))
        self.assertEqual(data.gyroscope_dps, (250.0, -250.0, 1999.93896484375))
        self.assertEqual(data.angles_deg, (90.0, -90.0, 45.0))

    def test_stream_handles_noise_fragmentation_and_multiple_frames(self) -> None:
        frame = bytes.fromhex(
            "55 61 00 40 00 c0 00 20 00 10 00 f0 ff 7f 00 40 00 c0 00 20"
        )
        stream = WitmotionFrameStream()
        self.assertEqual(stream.feed(b"noise" + frame[:7]), [])
        self.assertEqual(stream.feed(frame[7:] + frame), [frame, frame])
        self.assertEqual(stream.discarded_bytes, 5)


if __name__ == "__main__":
    unittest.main()
