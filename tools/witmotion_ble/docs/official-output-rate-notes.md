# WT901BLECL official output-rate notes

Research date: 2026-09-03. Official WITMOTION sources only were used for
device configuration. No command was sent to a physical sensor.

## Confirmed commands and values

The official BLE 5.0 SDK uses FFE5 service, FFE4 notifications, and FFE9
writes. Its read-register packet is `FF AA 27 REG 00`; unlock is the normal
write packet for register `0x69`, value `0xB588`; write packets are
`FF AA REG VALUE_LOW VALUE_HIGH`; save is register `0x00`, value `0x0000`.
Reading the current rate is therefore exactly `FF AA 27 03 00`. The BLE SDK
returns register frames with header `55 71`, the requested start address, and
little-endian register words beginning at byte 4.

The official WT901BLECL datasheet defines output-rate register `0x03`:

| Code | Rate |
| --- | ---: |
| `0x01` | 0.2 Hz |
| `0x02` | 0.5 Hz |
| `0x03` | 1 Hz |
| `0x04` | 2 Hz |
| `0x05` | 5 Hz |
| `0x06` | 10 Hz (default) |
| `0x07` | 20 Hz |
| `0x08` | 50 Hz |
| `0x09` | 100 Hz |
| `0x0B` | 200 Hz |
| `0x0C` | single return (non-periodic mode) |
| `0x0D` | no periodic return |

Thus both 20 Hz and 50 Hz are officially enumerated. WITMOTION's product page
states 0.2–200 Hz and default 10 Hz. The documentation warns generally that
the effective rate can be reduced when too much return content exceeds link
capacity, but no authoritative BLE-specific guarantee for sustaining every
listed maximum was found. Actual received rate and stability must be measured.

## Safety policy implemented

The diagnostic tool refuses a rate change unless it first reads register
`0x03` and recognizes that code as officially restorable. It records the
original code, changes only to documented 20 or 50 Hz,
does not persist the experimental value to flash, measures received frames,
and restores the original code in `finally`. If BLE disconnects before restore,
the saved original code remains in the diagnostic report/local storage and the
tool must reconnect and restore before another trial. No automatic test runs
merely because the page opens.

For a deliberately persistent configuration, the official sequence is
unlock → write register `0x03` → save. The tomorrow tool intentionally omits
the save command for both experimental rates, restores the prior runtime value,
and therefore does not turn a 20/50 Hz comparison into a flash-persistent change.

Official references:

- https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0
- https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/sdk/android_sdk-quick-start
- https://wit-motion.com/WirelessInclinometer/52.html

## Update — 2026-09-04: bandwidth register (Part 2/15 research, hardware OFF all night)

The output-rate register (0x03) controls how often the device REPORTS a
sample. A separate register controls the device's own internal low-pass
FILTER bandwidth applied before that report — the two are independent
knobs, and the brief explicitly asked whether a different bandwidth at a
fixed rate could reduce noise without materially increasing lag.

**Source**: WITMOTION's own published "WIT Standard Communication Protocol"
page (https://wit-motion.gitbook.io/witmotion-sdk/wit-standard-protocol/wit-standard-communication-protocol)
— the same `wit-motion.gitbook.io` domain already cited above as an
official source, describing the shared protocol family the WT901BLECL's
BLE 5.0 SDK is documented to follow.

| Register | Name | Values |
| --- | --- | --- |
| `0x1F` | BANDWIDTH | `0x00`=256Hz, `0x01`=188Hz, `0x02`=98Hz, `0x03`=42Hz, `0x04`=20Hz, `0x05`=10Hz, `0x06`=5Hz |
| `0x24` | AXIS6 | selects 9-axis (magnetometer-fused heading, absolute) vs 6-axis (gyro/accel integral heading, relative) algorithm mode |

**Important caveat, stated plainly**: this table was found tonight through
documentation research only — the sensor was OFF and NO command was sent to
it. It has not yet been bench-verified that reading register `0x1F` on THIS
specific WT901BLECL actually returns one of these seven codes. Tomorrow's
guarded trial (`lib/physicalInput/WitmotionConfigTrial.ts`, built tonight)
applies the exact same safety policy already proven for the rate register:
read first, refuse to change anything unless the current code is already a
member of this known-restorable set, never persist to flash, restore in
`finally` even on failure. If register `0x1F` returns something outside
this set on the real device, the trial refuses automatically — it does not
guess or force a value.

**Why this matters for noise vs. latency (Part 6's tradeoff, to be measured,
not assumed)**: a narrower bandwidth (e.g. 20Hz instead of whatever the
factory default is) is a heavier internal low-pass filter — it should
reduce reported noise at the cost of some added phase lag, independent of
how often that (now smoother) value is reported via the rate register. At a
FIXED output rate of 50Hz, trying a narrower bandwidth (e.g. 20Hz) is the
literal targeted experiment the brief asked for: "could a different
bandwidth at 50 Hz materially improve noise without unacceptable lag."
`WitmotionConfigTrial.ts` measures exactly this pairing tomorrow (still
noise + a host-side latency proxy) for a small set of (rate, bandwidth)
candidates, never 200Hz, restoring after each one.

**AXIS6 (6 vs 9-axis) relevance**: `ContinuousMotionController` already
never reads the device's fused yaw/pitch/roll for pointer math (see its own
class doc comment on the twist-rejection redesign) — it only reads
`anglesDeg[0]` (roll) once, at `commitCenter()`, for the one-time reference
de-roll. Because of that, AXIS6 mode is far less consequential for the
current pointer pipeline than it would have been for the earlier fused-angle
model; it is left untouched (still whatever the factory/current setting is)
and not part of tomorrow's candidate list — this is a considered exclusion
(the pointer math doesn't consume the value it would change), not an
oversight.
