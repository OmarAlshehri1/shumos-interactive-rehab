# Continuous RIGHT_HAND pipeline audit (hardware-off preparation)

Date: 2026-09-03. No sensor was powered or configured during this audit.

## Current end-to-end path

1. `Wt901BleInputSource` asks Chrome/Edge Web Bluetooth for a `WT901BLE*`
   device and verifies the official FFE5 service, FFE4 notification
   characteristic, and FFE9 write characteristic.
2. Each notification is host-timestamped immediately. `WitmotionFrameStream`
   is the only packet buffer: it retains at most an incomplete 20-byte frame
   and emits complete `0x55/0x61` frames. It has no time window or delay.
3. `parseWitmotionRealtimeFrame` scales the nine signed little-endian int16
   values exactly like the existing Python parser into acceleration (g),
   gyroscope (degrees/second), and `[roll, pitch, yaw]` (degrees).
4. `PhysicalInputManager` routes the sample synchronously to observers and
   the RIGHT_HAND `ContinuousMotionController`. There is no queue, debounce,
   polling timer, or semantic `RIGHT_HAND_RAISE` step in this path.
5. The current default mapping is X = inverted yaw, Y = pitch, and visual
   rotation = roll. This direction choice reflects the first real wrist test.
6. A local-center angular delta (with safe ±180° wrap) is converted to analog
   normalized coordinates, dead-zone-compensated, sensitivity-scaled, and
   clamped to `[0,1]`.
7. Filtering is one selectable controller stage. The original implementation
   was adaptive EMA with retained weight
   `r = smoothing * (1 - 0.7 * clamp(|gyro|/240, 0, 1))`.
8. React receives the output with `setState`. A layout effect can mark DOM
   commit and `requestAnimationFrame` marks the next visual frame.
9. The former 70 ms CSS transition on hand position/rotation was a second
   interpolation layer. The diagnostic build removes it so A/B filters are
   measured without duplicate UI smoothing.

## Rotation contamination root cause

The software did not use roll directly for pointer X/Y. The contamination is
physical/Euler coupling: rotating a wrist-mounted sensor around its perceived
hand axis also changes the reported yaw and/or pitch because the sensor axes,
forearm axis, and Euler decomposition are not perfectly aligned. Since pointer
X and Y consume yaw and pitch independently, those coupled deltas move the
cursor. The exact coupling coefficients and whether they remain linear across
the comfortable pediatric range require the labeled real capture.

Pointer position and visual orientation are now distinct output objects.
Two zero-by-default coefficients can subtract a measured roll contribution
from the X and Y orientation deltas. The diagnostic estimates these by linear
regression during the two rotation-only phases; nothing is applied until the
user explicitly chooses it tomorrow.

## Latency and filtering inventory

- Sensor/device fusion: internal WITMOTION Kalman/dynamic filtering; latency
  is not exposed by the BLE frame and cannot be measured host-side.
- Device output interval: default documented as 10 Hz, approximately 100 ms;
  average sample-and-hold wait is therefore roughly 50 ms before host work.
- BLE notification transport: no sensor-origin timestamp, so one-way radio
  latency cannot be isolated. Notification receipt is the first host mark.
- Frame buffer: byte reassembly only, zero intentional wait.
- Parsing, controller, and filter: synchronous; each now has monotonic marks.
- Adaptive EMA at default smoothing 0.35: at rest `r=0.35`, whose theoretical
  mean lag is `r/(1-r)=0.538` samples (~54 ms at 10 Hz). At ≥240°/s,
  `r=0.105`, ~0.117 samples (~12 ms at 10 Hz). These are mathematical
  estimates, not physical measurements.
- Sample-rate display: a two-second rolling timestamp window used only for
  telemetry; it never feeds control.
- React: one state update per pointer sample, then commit and next-frame marks.
- UI interpolation: the earlier 70 ms CSS transition stacked after the EMA;
  removed in the diagnostic lab. There is no `setInterval` in control.
- `requestAnimationFrame`: instrumentation only; it does not drive position.

## Prepared comparisons

- Filter A: light EMA (low fixed retained weight).
- Filter B: the existing gyro-adaptive EMA.
- Filter C: One Euro filter with timestamp-aware cutoff adaptation.

Sensitivity and dead zone remain independent of filter choice. None of the
filters decides whether a movement exists, so small-movement amplification is
not replaced by a larger threshold.

## Contact path prepared for tomorrow

Balloon Quest is the smallest-risk adapter because balloon positions are
static normalized coordinates and the canonical action accepts the exact
`balloonId`: `selectBalloon(state, balloonId, timestamp)`. The isolated test
uses `ContactActivationGate` (outside → enter once → hold does nothing → exit
rearms) and `ContactActionInstrument`; it does not reproduce scoring,
progression, or celebration logic and does not change production game routes.
