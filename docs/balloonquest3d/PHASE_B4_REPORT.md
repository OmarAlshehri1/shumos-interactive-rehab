# Balloon Quest 3D — Phase B4 report: multi-input integration

**Status: COMPLETE (software acceptance criteria).** Only RIGHT_HAND has any prior real-hardware validation in this project, and **none of this phase was exercised against physical sensors**. LEFT_HAND, both hands, foot and handheld are *software-ready and simulation-tested only* and are labelled "تجريبي" / "محاكاة فقط" in the therapist UI.

## 1. Architecture

```
 existing RIGHT_HAND runtime ─┐                       ┌────────────────────────────┐
 existing LEFT_HAND runtime  ─┤ HandInputBridge       │ ControlRuntime (authority) │
 simulated foot / handheld   ─┼─►  InputHub  ─────────►  SelectionPipeline         │
 keyboard cursor             ─┘ (freshness, order,    │  (per-source contact gate) │
                                 validation, mapping) │  ─► selectBalloon (engine)  │
                                                      └────────────────────────────┘
```

| Piece | File | Role |
|---|---|---|
| `PointerSample`, `PointerAdapter` | `lib/balloonquest/input/types.ts` | The narrow typed interface. A sample is `{sourceId, x, y, visible, seq, atMs}` in stage coordinates (0..1 of the projected image). Adapters report `hardwareVerified`; every simulated adapter reports `false`. |
| `InputHub` | `input/hub.ts` | Latest pointer per enabled source. Rejects invalid, disabled-source, stale (> 250 ms), future-dated, out-of-order samples; a source that went silent may restart its sequence (reconnect). Clamps to the stage. Applies an explicit per-source floor orientation. Never smooths. |
| `SelectionPipeline` | `input/pipeline.ts` | One edge-triggered contact gate **per source** — it reuses the existing `ContactActivationGate` (enter once, hold does nothing, exit re-arms) fed isotropic stage coordinates. Resume / first frame / recenter *prime* instead of firing. Explicit "press" events pick the nearest balloon under the pointer. |
| `KeyboardCursor` | `input/keyboard.ts` | Arrow keys / WASD move a cursor, Space/Enter presses. Development aid. |
| `SimulatedPointer` | `input/simulated.ts` | Scripted pointer for any source (hand, foot, handheld); also drives the on-screen simulator pad. |
| `HandInputBridge` | `components/control/balloonquest3d/HandInputBridge.tsx` | Reads the **existing** shared RIGHT_HAND and LEFT_HAND runtimes (`useDualSensorRuntime`) and forwards their final normalised pointer into the hub. |

**Not touched:** `lib/physicalInput/*` (WT901 BLE driver, calibration, motion filters, role assignment), `SensorRuntimeProvider`, `useSensorHandRuntime`, the local pointer channel, the layout. The bridge only *reads* what those publish.

## 2. RIGHT_HAND
* Reuses the final normalised pointer (`runtime.pointer.pointer`) — no extra smoothing, no calibration change, no Firebase write from the new code, no per-frame network traffic.
* Contact uses the existing `ContactActivationGate`; the shared runtime's `recenterEpoch` is forwarded so a therapist recenter primes the gate instead of firing a phantom contact (same behaviour as the other sensor games).
* Freshness: a sample older than 250 ms is not trusted (same budget the Space Pilot 3D receiver and local Display receiver use).

## 3. LEFT_HAND and both hands
* **Inspection result:** `SensorRuntimeProvider` runs two independent runtimes. `LocalPointerBroadcastSync` in the shared layout publishes only RIGHT_HAND on the local channel, so a receiver on that channel cannot see LEFT_HAND. The LEFT_HAND runtime is, however, available through React context in the Control window, so the bridge reads it directly — **no shared file needed to change**.
* Supported modes: `left-hand` and `both-hands`, each marked **experimental**. The existing codebase itself says LEFT_HAND is "prepared architecture only, not enabled until real LEFT_HAND validation passes".
* Hand assignment and calibration are untouched (the existing runtime already prevents one physical sensor serving both roles).
* Both-hand behaviour covered by simulation: either hand can select; a simultaneous contact on the same balloon scores once; losing one hand does not pause play while the other is live.
* **Not verified:** two physical WT901 sensors on the real BLE stack, or dual-hand ergonomics.

## 4. Foot sensors (prepared, simulation only)
* Interface: `RIGHT_FOOT` / `LEFT_FOOT` samples enter the hub like any pointer. The `foot` mode accepts both feet at once.
* **Coordinate mapping, stated explicitly:** a foot provider must deliver a *position on the projected floor image*, normalised 0..1 (x right, y down; **y = 1 is the edge nearest the child**). Identity mapping is the default. `FloorOrientation { rotateQuarterTurns, mirrorX }` + `mapToImage` exists for installations whose projected image is rotated or mirrored relative to that convention; the hub applies it per source (unit-tested).
* **Open hardware question (honest):** a foot-mounted IMU gives motion, not an absolute floor position. Nothing in this repo converts IMU data to a floor position, and no BLE code was added. A real foot input needs a positioning method (calibration against the projection, or step-event based selection) that has not been designed or validated. The software side simply accepts a normalised position when one exists.
* Tested with simulated foot movement: contacts, a full floor-layout session driven by `LEFT_FOOT`.

## 5. Handheld controllers (prepared, simulation only)
* Interface: a handheld provider emits normalised pointer samples (same shape as above) and optionally "press" events (trigger). Contact (hover-to-select) and press activation both work.
* **Compatibility requirements for a future real adapter:** (1) a normalised pointer in image coordinates at ≥ 30 Hz with a per-source increasing `seq` and a receive time on the Control machine's monotonic clock; (2) a way to recentre/re-arm; (3) a visible/hidden flag so loss of tracking is explicit; (4) optional press events; (5) no drift compensation inside the game.
* **Not assumed:** that Joy-Con or any controller exposes browser-readable motion data (WebHID / Gamepad API support and motion availability are unverified). No controller library was installed.

## 6. Wall and floor layouts
| | WALL | FLOOR |
|---|---|---|
| Intended use | front-facing display; hands, handhelds | floor projection; future foot interaction |
| HUD | title, instruction, level+stage markers on top; goal bar bottom | all HUD in the **far (top) band**; the near band is left clear for the child's feet and shadow |
| Safe area (cqw / cqh) | x margin 8, y 19–89 | x margin **14**, y **20–88** |
| Targets | spec size, spec speed | **×1.15 size, ×0.85 speed** (rising stages); static Easy balloons are shrunk only as far as needed to keep spare replacement slots |
| Input mapping | identity | identity by default, explicit orientation per source |

Rotating the whole screen would not be enough: the HUD, the keep-out band and the larger/slower targets are layout decisions, not a transform.

**Physical installation assumptions (unverified):** the projector image is not rotated relative to the child; the bottom edge of the image is the edge nearest the child; the child can reach every target inside the safe area; the projected area is large enough that ≈ 12 % of its height near the child is genuinely clear. None of this has been measured on a real installation.

## 7. Input safety
| Situation | Behaviour |
|---|---|
| Sensor disconnects / pointer hidden | After a 600 ms grace the session is **held** (`input-lost`). Nothing moves or scores. |
| Stale input (stops streaming) | Treated as lost; the same hold. |
| Recovery | Auto-resumes after 300 ms of fresh input. A pointer that is already resting on a balloon does **not** count as a contact (gates are primed); leaving and re-entering selects normally. |
| Mode switch mid-session | Hub re-keyed, gates reset, old source ignored immediately. |
| Pause / resume | Gates are reset and primed on resume: no phantom selection. |
| Recenter | Pending recenter primes the gate. |
| Multiple pointers | Per-source gates; one balloon scores once. |
| Duplicate / replayed samples | Rejected by sequence; selections de-duplicated by input-event id. |
| Cannot start without live input in a sensor mode | Refused with an Arabic reason. |
| Keyboard mode | Exempt from loss detection (development aid). |

## 8. Validation

**Simulated / software only** (not hardware):
* `lib/balloonquest/__tests__/input.test.ts` (33 tests): mode→source mapping and experimental flags; keyboard; for each of right-hand, left-hand, handheld and foot — enter-once, hold-does-nothing, wrong-colour cue, disabled sources ignored; both hands; contact boundaries (just outside 1.04×, just inside 0.96× the contact radius at tolerance 0 / 0.15 / 0.5; larger tolerance turns a miss into a hit); input loss and recovery without a phantom contact; stale input; start refusal; mode switch; pause with the pointer on a balloon; recenter priming; hub rejection rules; wall/floor mapping and floor safe-area; a full floor session with a simulated foot.
* Browser (two real windows, simulator pad feeding the real hub): simulated LEFT_HAND (left-hand mode), LEFT_HAND (both-hands mode), RIGHT_FOOT and LEFT_FOOT (foot mode), HANDHELD (handheld mode) each selected a target; **real keyboard key events** (arrows + Space, injected through the browser) selected a target; input loss held play, froze the authoritative transforms on both windows (bit-identical) and auto-resumed; the same on Display loss; Control/Display agreed to within 0.06 % of the stage height.
* Honest exclusion: a browser check of "a source not enabled for the mode cannot score" was **not meaningful** because the simulator keeps every previously used simulated source streaming; it is covered by the unit tests (`rejections().disabled`) instead.

**Real hardware validation: none performed.** See the hardware checklist in the B5 report.

## 9. Known issues / limits
* The shared `/control` layout still mounts `SensorPointerDisplaySync`, which mirrors a connected RIGHT_HAND pointer to Firebase (`presence/display`) when realtime is enabled. Only the Space Pilot 3D route is exempted, through a Space Pilot-owned file (`PrototypeLocalOnlyBoundary`) that tests the exact Space Pilot path. The Balloon Quest 3D route therefore inherits it. In this development environment Firebase is not configured and no external request was observed from either window, but with Firebase enabled that pre-existing write would run. **Approval needed** to add this route's path to that boundary (a one-line change to a shared, currently modified file) — not done.
* LEFT_HAND / both hands: experimental, unverified on hardware. Foot and handheld: no adapters exist; simulation only.

PHASE B4: COMPLETE (software acceptance). Hardware validation outstanding.
