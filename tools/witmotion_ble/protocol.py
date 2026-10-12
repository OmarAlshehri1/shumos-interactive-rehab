"""WITMOTION BLE 5.0 packet parsing.

The WT901BLE/BWT901BLE BLE 5.0 real-time packet is a 20-byte frame:
0x55, 0x61, then nine signed little-endian int16 values.  The scales below
match WITMOTION's official Python BLE 5.0 SDK.
"""

from __future__ import annotations

from dataclasses import dataclass
import struct


FRAME_HEADER = 0x55
REALTIME_FRAME = 0x61
REGISTER_FRAME = 0x71
FRAME_SIZE = 20


@dataclass(frozen=True, slots=True)
class Telemetry:
    acceleration_g: tuple[float, float, float]
    gyroscope_dps: tuple[float, float, float]
    angles_deg: tuple[float, float, float]

    @property
    def roll(self) -> float:
        return self.angles_deg[0]

    @property
    def pitch(self) -> float:
        return self.angles_deg[1]

    @property
    def yaw(self) -> float:
        return self.angles_deg[2]


def parse_realtime_frame(frame: bytes) -> Telemetry:
    """Parse one official 0x55/0x61 20-byte real-time frame."""
    if len(frame) != FRAME_SIZE:
        raise ValueError(f"expected {FRAME_SIZE} bytes, received {len(frame)}")
    if frame[0] != FRAME_HEADER or frame[1] != REALTIME_FRAME:
        raise ValueError("not a WITMOTION BLE 5.0 real-time frame")

    values = struct.unpack_from("<9h", frame, 2)
    acceleration = tuple(value / 32768.0 * 16.0 for value in values[0:3])
    gyroscope = tuple(value / 32768.0 * 2000.0 for value in values[3:6])
    angles = tuple(value / 32768.0 * 180.0 for value in values[6:9])
    return Telemetry(acceleration, gyroscope, angles)


class WitmotionFrameStream:
    """Reassemble 20-byte frames across arbitrary BLE notification chunks."""

    def __init__(self) -> None:
        self._buffer = bytearray()
        self.discarded_bytes = 0

    def feed(self, data: bytes | bytearray) -> list[bytes]:
        self._buffer.extend(data)
        frames: list[bytes] = []

        while True:
            header_index = self._buffer.find(bytes((FRAME_HEADER,)))
            if header_index < 0:
                self.discarded_bytes += len(self._buffer)
                self._buffer.clear()
                break
            if header_index:
                self.discarded_bytes += header_index
                del self._buffer[:header_index]
            if len(self._buffer) < 2:
                break
            if self._buffer[1] not in (REALTIME_FRAME, REGISTER_FRAME):
                self.discarded_bytes += 1
                del self._buffer[0]
                continue
            if len(self._buffer) < FRAME_SIZE:
                break

            frames.append(bytes(self._buffer[:FRAME_SIZE]))
            del self._buffer[:FRAME_SIZE]

        return frames
