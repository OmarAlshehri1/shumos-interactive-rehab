# WT901BLECL BLE device-rename research notes

Research date: 2026-09-05. Official WITMOTION sources only were used
(published protocol docs, the official user manual, and WITMOTION's own
open-source SDK repository). No hardware is available in this session and
no command was sent to a physical sensor.

## Question asked

Can the WT901BLECL's advertised/BLE device name be officially, persistently
renamed via WITMOTION's own **documented protocol or SDK** — as opposed to
the two registers already used in this codebase (output-rate `0x03` and
bandwidth `0x1F`, see `official-output-rate-notes.md`)?

## What IS officially documented

**1. An app-level "Rename" feature exists and is documented in the official
user manual.** WT901BLECL BLE5.0 manual v23-0420 ("WT901BLECL BLE5.0 | manual
v23-0420 | www.wit-motion.com"), Section 3.3.1 "Rename" (p.18):

> "Click rename and you can edit its name. The name will be fixed with WT +
> Name you input."

And Section 6.1.3 "Device name Edition" (p.51), for the PC-side utility:

> "Step 1. Modify your device name. Due to the integrated WitMotion algorithm
> and settings, the device name will always start with "WT". Step 2. Input
> the name you prefer. Then click the "Save Config"."

This confirms: renaming is an official, supported feature of WITMOTION's own
apps; the resulting name is always prefixed `WT`; and the manual's own flow
ends with an explicit "Save Config" action, implying the intent is a
persistent change (the manual does not spell out "persists across power
cycle" in those words, so treat that inference as manual-implied, not
literally stated).

**2. The default factory name format is documented, partially.** Section 3.2
"How to setup" (p.15):

> "Sensor device ID will be recognized as WT901BLE+number. The second column
> is its SSID number."

So the default advertised name is `WT901BLE` followed by a number the manual
calls the device's "SSID number". The manual does **not** state that this
number is the last 4 hex digits of the MAC address — that specific detail
(assumed in the task brief as a plausible example) is **not confirmed** by
this source and must not be asserted as fact.

**3. A full register map is officially published, and it has no NAME/BLENAME
register.** WITMOTION's own "WIT Standard Communication Protocol" page
(https://wit-motion.gitbook.io/witmotion-sdk/wit-standard-protocol/wit-standard-communication-protocol
— same `wit-motion.gitbook.io` domain already cited as an official source in
`official-output-rate-notes.md`) documents registers `0x00` through `0x84`.
The only identification-related entries are:

| Address | Register | Function |
| --- | --- | --- |
| `0x1A` | IICADDR | I2C/Modbus bus address, not a BLE name |
| `0x7F`–`0x84` | NUMBERID1–6 | Read-only device serial number words |

No register in this table sets a BLE-advertised or GAP device name.

**4. Register `0x00` (SAVE) is documented with three distinct values**, which
matters for questions 3–5:

> SAVE (address `0x00`, R/W, default `0x0000`): Save = `0x0000`,
> Restart = `0x00FF`, Factory reset = `0x0001`.

This confirms an official, documented **restart** command (`0x00`/`0x00FF`)
and an official, documented **factory-reset** command (`0x00`/`0x0001`) exist
for the WIT standard protocol family — but since there is no NAME register in
the map at all (see #3), it is unconfirmed whether a factory reset would have
any effect on an app-set name, because there is nothing in the documented
register set for it to reset.

**5. WITMOTION's own published, open-source BLE 5.0 Android SDK does not
implement a name-write command.** Repository
https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0 (official WITMOTION
GitHub org), file
`Android_Java/wit-example-ble5/WitSDK/src/main/java/com/wit/witsdk/Device/DeviceModel.java`,
implements exactly these outgoing commands over the same FFE5/FFE4/FFE9
custom service already used in this codebase:

- `SetRRate` → `FF AA 03 <value> 00` (output rate)
- `SetBandwidth` → `FF AA 1F <value> 00` (bandwidth)
- `SetAngle0` → `FF AA 01 08 00` (angle-zero reference)
- `SetMagStart` / `SetMagStop` → `FF AA 01 07 00` / `FF AA 01 00 00` (magnetic calibration)
- `ReSet` → `FF AA 00 01 00` (register `0x00` = `0x0001`, i.e. the documented factory-reset value above)
- a trailing `FF AA 00 00 00` (save) sent 100 ms after any command flagged `isSave`

There is no `SetDeviceName`/name-write command anywhere in this file, and the
class never touches the standard Bluetooth Generic Access service (`0x1800`)
or its Device Name characteristic (`0x2A00`) — it only opens the custom
`0000ffe5-...` service. (A `deviceName` field does exist on `DeviceModel`,
but it is populated from the Android BLE scan result and is local
display/reconnect state — it is never written back to the sensor.) The
non-Old_Example folder is WITMOTION's currently maintained SDK; the
`Old_Example` folder's `DeviceModel.java` has an identically local-only
`setDeviceName(String)` setter with the same characteristic.

**6. The BLE 5.0 SDK/protocol documentation pages list no name-setting API.**
https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/sdk and
https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/sdk/android_sdk-quick-start
were checked directly; neither documents a device-name method, register, or
characteristic.

## What is NOT confirmed

- No documented register address or BLE command for setting the WT901BLECL's
  advertised name was found anywhere in WITMOTION's published protocol docs,
  official manual's technical sections, or official open-source SDK code.
- How the official app actually implements its "Rename" feature is not
  disclosed by any source checked. A plausible mechanism — writing the
  standard Bluetooth SIG Generic Access "Device Name" characteristic
  (`0x2A00` under service `0x1800`), which is a generic BLE capability
  independent of WitMotion's own FFE5 command protocol — was considered, but
  **no source confirms the WT901BLECL exposes that characteristic as
  writable**. This is a plausible hypothesis, not a documented fact, and this
  note explicitly does not assert it as one.
- Maximum name length and allowed character set: not documented anywhere
  found.
- Whether the app-level rename persists across power cycles: implied by the
  manual's "Save Config" step, but not explicitly stated.
- Whether a documented `0x00`/`0x00FF` restart or `0x00`/`0x0001` factory
  reset actually reverts an app-set name back to `WT901BLE+<number>`: not
  documented, because there is no name register for either command to act on
  in the published register map.
- Whether a BLE restart/power cycle is required after a rename for the new
  name to be advertised: not documented.
- Exact factory-default naming rule (e.g. whether the trailing number is
  derived from the MAC address): not documented; the manual only says
  "WT901BLE+number" = its "SSID number".

## Final verdict

**Official BLE rename supported: UNCONFIRMED.**

Reasoning: WITMOTION's own official app and PC utility document a working,
supported "Rename" feature (manual sections 3.3.1 and 6.1.3), so renaming is
not fictional — it is real and officially supported *by WITMOTION's own
software*. However, the task asked specifically whether this can be done via
WITMOTION's **documented protocol or SDK** (the same kind of source this
codebase already relies on for the rate and bandwidth registers). Across the
one full register map WITMOTION publishes, the official open-source BLE 5.0
Android SDK's actual GATT command code, and the BLE 5.0 SDK doc pages, there
is no name-setting register, command, or API documented or implemented
anywhere. The mechanism the closed-source app uses to rename the device is
not published. Per this project's evidence discipline, that gap is reported
as UNCONFIRMED rather than guessed at, and no register address is invented.

Consequently, per this task's instructions, **no new production/runtime code
was added** — there is nothing citable to implement. This file is the only
deliverable for this task.

## Sources checked

- WT901BLECL BLE5.0 user manual, v23-0420 (official WITMOTION manual; mirror
  used: https://cdn.robotshop.com/rbm/f83835f4-5e29-4ee0-9cc2-e49300031503/b/bf5c1f59-3b36-40a4-a5f0-e5a0eea52565/15a3f141_wt901blecl-manual.pdf,
  same file also distributed via `m.media-amazon.com/images/I/C1UuWWxC83L.pdf`),
  sections 3.2, 3.3.1, and 6.1.3
- https://wit-motion.gitbook.io/witmotion-sdk/wit-standard-protocol/wit-standard-communication-protocol
  (official WITMOTION SDK docs — full register map and SAVE-register values)
- https://github.com/WITMOTION/WitBluetooth_BWT901BLE5_0 (official WITMOTION
  GitHub org, open-source BLE 5.0 SDK/example — see
  `Android_Java/wit-example-ble5/WitSDK/src/main/java/com/wit/witsdk/Device/DeviceModel.java`
  for the actual command bytes sent)
- https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/sdk
- https://wit-motion.gitbook.io/witmotion-sdk/ble-5.0-protocol/sdk/android_sdk-quick-start
