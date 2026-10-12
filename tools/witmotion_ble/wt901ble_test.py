#!/usr/bin/env python3
"""Standalone macOS hardware test for WITMOTION WT901BLECL5.0."""

from __future__ import annotations

import argparse
import asyncio
from collections import deque
from dataclasses import dataclass, field
import signal
import sys
import time
from typing import Any

try:
    from bleak import BleakClient, BleakScanner
    from bleak.backends.device import BLEDevice
    from bleak.backends.scanner import AdvertisementData
    from bleak.exc import BleakBluetoothNotAvailableError
except ImportError as exc:  # pragma: no cover - actionable CLI error
    raise SystemExit(
        "Bleak is not installed. Run: ./tools/witmotion_ble/setup.sh"
    ) from exc

from protocol import REALTIME_FRAME, WitmotionFrameStream, parse_realtime_frame


SERVICE_UUID = "0000ffe5-0000-1000-8000-00805f9a34fb"
NOTIFY_UUID = "0000ffe4-0000-1000-8000-00805f9a34fb"
WRITE_UUID = "0000ffe9-0000-1000-8000-00805f9a34fb"


@dataclass(slots=True)
class RunStats:
    packet_times: list[float] = field(default_factory=list)
    session_packet_times: dict[int, list[float]] = field(default_factory=dict)
    minimums: list[float] = field(default_factory=lambda: [float("inf")] * 9)
    maximums: list[float] = field(default_factory=lambda: [float("-inf")] * 9)
    maximum_abs: list[float] = field(default_factory=lambda: [0.0] * 9)
    sessions_connected: int = 0
    reconnects: int = 0
    intentional_disconnects: int = 0
    sessions_with_packets: set[int] = field(default_factory=set)

    def observe(self, session: int, timestamp: float, values: tuple[float, ...]) -> None:
        self.packet_times.append(timestamp)
        self.sessions_with_packets.add(session)
        self.session_packet_times.setdefault(session, []).append(timestamp)
        for index, value in enumerate(values):
            self.minimums[index] = min(self.minimums[index], value)
            self.maximums[index] = max(self.maximums[index], value)
            self.maximum_abs[index] = max(self.maximum_abs[index], abs(value))

    @property
    def rate_hz(self) -> float:
        packet_intervals = 0
        active_seconds = 0.0
        for timestamps in self.session_packet_times.values():
            if len(timestamps) < 2:
                continue
            packet_intervals += len(timestamps) - 1
            active_seconds += timestamps[-1] - timestamps[0]
        return packet_intervals / active_seconds if active_seconds > 0 else 0.0

    @property
    def telemetry_changed(self) -> bool:
        if len(self.packet_times) < 2:
            return False
        ranges = [hi - lo for lo, hi in zip(self.minimums, self.maximums)]
        # Require evidence of physical motion, not merely slow Euler-angle
        # convergence while the sensor is stationary.
        return any(value > 0.10 for value in ranges[0:3]) or any(
            value > 5.0 for value in self.maximum_abs[3:6]
        )


def candidate_name(device: BLEDevice, advertisement: AdvertisementData) -> str:
    return advertisement.local_name or device.name or "(unnamed)"


async def discover_device(
    scan_seconds: float, name_prefix: str, selector: str | None
) -> tuple[BLEDevice, AdvertisementData] | None:
    print(f"STATE scanning ({scan_seconds:.1f}s)", flush=True)
    discovered = await BleakScanner.discover(timeout=scan_seconds, return_adv=True)
    candidates: list[tuple[BLEDevice, AdvertisementData]] = []

    for device, advertisement in discovered.values():
        name = candidate_name(device, advertisement)
        service_uuids = {uuid.lower() for uuid in advertisement.service_uuids}
        matches_family = name.upper().startswith(name_prefix.upper()) or SERVICE_UUID in service_uuids
        if not matches_family:
            continue
        if selector:
            wanted = selector.casefold()
            if wanted not in name.casefold() and wanted not in device.address.casefold():
                continue
        candidates.append((device, advertisement))

    if not candidates:
        suffix = f" matching {selector!r}" if selector else ""
        print(f"STATE sensor_not_found{suffix}", flush=True)
        return None

    candidates.sort(key=lambda item: item[1].rssi or -999, reverse=True)
    print("DISCOVERED WITMOTION candidates:", flush=True)
    for index, (device, advertisement) in enumerate(candidates, start=1):
        services = ",".join(advertisement.service_uuids) or "not advertised"
        print(
            f"  {index}. name={candidate_name(device, advertisement)!r} "
            f"id={device.address} rssi={advertisement.rssi} services={services}",
            flush=True,
        )
    if len(candidates) > 1 and selector is None:
        print("STATE multiple_matches; selecting strongest RSSI (use --device to override)", flush=True)
    return candidates[0]


async def connected_session(
    device: BLEDevice,
    display_hz: float,
    stats: RunStats,
    stop_event: asyncio.Event,
    disconnect_test_after: float | None,
    deadline: float | None,
) -> str:
    disconnected = asyncio.Event()
    stream = WitmotionFrameStream()
    recent_packet_times: deque[float] = deque()
    last_print = 0.0
    session_started = time.monotonic()
    disconnect_scheduled = False

    def on_disconnect(_: BleakClient) -> None:
        print("STATE disconnected", flush=True)
        disconnected.set()

    print(f"STATE connecting name={device.name!r} id={device.address}", flush=True)
    async with BleakClient(device, disconnected_callback=on_disconnect, timeout=15.0) as client:
        stats.sessions_connected += 1
        session_number = stats.sessions_connected
        if stats.sessions_connected > 1:
            stats.reconnects += 1
        print(
            f"STATE connected session={stats.sessions_connected} id={device.address}",
            flush=True,
        )

        services = client.services
        service = services.get_service(SERVICE_UUID)
        notify_characteristic = services.get_characteristic(NOTIFY_UUID)
        write_characteristic = services.get_characteristic(WRITE_UUID)
        if service is None or notify_characteristic is None:
            raise RuntimeError(
                "Connected device does not expose official BLE 5.0 FFE5/FFE4 service/notify UUIDs"
            )
        print(
            "GATT verified "
            f"service={service.uuid} notify={notify_characteristic.uuid} "
            f"write={write_characteristic.uuid if write_characteristic else 'not found'}",
            flush=True,
        )

        def on_notification(_: Any, data: bytearray) -> None:
            nonlocal last_print
            now = time.monotonic()
            for frame in stream.feed(data):
                if frame[1] != REALTIME_FRAME:
                    continue
                telemetry = parse_realtime_frame(frame)
                values = (
                    *telemetry.acceleration_g,
                    *telemetry.gyroscope_dps,
                    *telemetry.angles_deg,
                )
                stats.observe(session_number, now, values)
                recent_packet_times.append(now)
                while recent_packet_times and recent_packet_times[0] < now - 2.0:
                    recent_packet_times.popleft()
                if now - last_print >= 1.0 / display_hz:
                    live_rate = (len(recent_packet_times) - 1) / (
                        recent_packet_times[-1] - recent_packet_times[0]
                    ) if len(recent_packet_times) > 1 else 0.0
                    ax, ay, az = telemetry.acceleration_g
                    gx, gy, gz = telemetry.gyroscope_dps
                    print(
                        "DATA "
                        f"accel_g=({ax:+8.4f},{ay:+8.4f},{az:+8.4f}) "
                        f"gyro_dps=({gx:+9.3f},{gy:+9.3f},{gz:+9.3f}) "
                        f"roll_pitch_yaw_deg=({telemetry.roll:+8.3f},"
                        f"{telemetry.pitch:+8.3f},{telemetry.yaw:+8.3f}) "
                        f"rate_hz={live_rate:6.1f}",
                        flush=True,
                    )
                    last_print = now

        await client.start_notify(notify_characteristic, on_notification)
        print(f"STATE subscribed notify={notify_characteristic.uuid}", flush=True)

        while client.is_connected and not stop_event.is_set():
            if deadline is not None and time.monotonic() >= deadline:
                stop_event.set()
                break
            if (
                disconnect_test_after is not None
                and not disconnect_scheduled
                and time.monotonic() - session_started >= disconnect_test_after
                and stats.packet_times
            ):
                disconnect_scheduled = True
                stats.intentional_disconnects += 1
                print("STATE intentional_disconnect_for_reconnect_test", flush=True)
                await client.disconnect()
                return "intentional_disconnect"
            try:
                await asyncio.wait_for(disconnected.wait(), timeout=0.25)
            except asyncio.TimeoutError:
                pass

        if client.is_connected:
            await client.stop_notify(notify_characteristic)
        return "stopped" if stop_event.is_set() else "disconnected"


def print_summary(stats: RunStats) -> None:
    print("\nHARDWARE TEST SUMMARY", flush=True)
    print(f"  real_0x61_packets={len(stats.packet_times)}", flush=True)
    print(f"  observed_sample_rate_hz={stats.rate_hz:.2f}", flush=True)
    print(f"  physical_motion_detected={'YES' if stats.telemetry_changed else 'NO'}", flush=True)
    print(f"  connected_sessions={stats.sessions_connected}", flush=True)
    print(f"  reconnects={stats.reconnects}", flush=True)
    reconnect_result = (
        "PASS"
        if stats.intentional_disconnects and any(session > 1 for session in stats.sessions_with_packets)
        else "NOT_TESTED"
    )
    print(f"  disconnect_reconnect={reconnect_result}", flush=True)


async def run(args: argparse.Namespace) -> int:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signal_number in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(signal_number, stop_event.set)
        except NotImplementedError:
            pass

    stats = RunStats()
    deadline = time.monotonic() + args.duration if args.duration else None
    backoff = 1.0
    reconnect_test_pending = args.reconnect_test_after
    selected_identity: str | None = None

    while not stop_event.is_set():
        if deadline is not None and time.monotonic() >= deadline:
            break
        try:
            found = await discover_device(args.scan_seconds, args.name_prefix, args.device or selected_identity)
            if found is None:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, args.max_backoff)
                continue
            device, advertisement = found
            selected_identity = device.address
            print(
                f"SELECTED name={candidate_name(device, advertisement)!r} "
                f"id={device.address} rssi={advertisement.rssi}",
                flush=True,
            )
            outcome = await connected_session(
                device,
                args.display_hz,
                stats,
                stop_event,
                reconnect_test_pending,
                deadline,
            )
            if outcome == "intentional_disconnect":
                reconnect_test_pending = None
            backoff = 1.0
        except BleakBluetoothNotAvailableError as exc:
            print(f"STATE bluetooth_unavailable error={exc}", file=sys.stderr, flush=True)
            print(
                "On macOS, enable Bluetooth and allow your terminal under "
                "System Settings > Privacy & Security > Bluetooth.",
                file=sys.stderr,
                flush=True,
            )
            break
        except (asyncio.CancelledError, KeyboardInterrupt):
            break
        except Exception as exc:
            print(f"STATE connection_error type={type(exc).__name__} error={exc}", flush=True)

        if not stop_event.is_set():
            print(f"STATE reconnect_wait seconds={backoff:.1f}", flush=True)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=backoff)
            except asyncio.TimeoutError:
                pass
            backoff = min(backoff * 2.0, args.max_backoff)

    print_summary(stats)
    return 0 if stats.packet_times and stats.telemetry_changed else 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scan, connect, subscribe, and display real WT901BLECL5.0 telemetry."
    )
    parser.add_argument(
        "--device",
        help="optional device name fragment or macOS CoreBluetooth UUID; never required",
    )
    parser.add_argument("--name-prefix", default="WT901BLE", help="advertised device-name prefix")
    parser.add_argument("--scan-seconds", type=float, default=8.0)
    parser.add_argument("--display-hz", type=float, default=10.0)
    parser.add_argument("--max-backoff", type=float, default=15.0)
    parser.add_argument(
        "--duration",
        type=float,
        help="optional total run duration in seconds; default is until Ctrl-C",
    )
    parser.add_argument(
        "--reconnect-test-after",
        type=float,
        metavar="SECONDS",
        help="once only, disconnect after telemetry arrives and verify automatic reconnection",
    )
    args = parser.parse_args()
    if args.display_hz <= 0 or args.scan_seconds <= 0 or args.max_backoff <= 0:
        parser.error("scan/display/backoff values must be positive")
    if args.duration is not None and args.duration <= 0:
        parser.error("--duration must be positive")
    if args.reconnect_test_after is not None and args.reconnect_test_after <= 0:
        parser.error("--reconnect-test-after must be positive")
    return args


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
