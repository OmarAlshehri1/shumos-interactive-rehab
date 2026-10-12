# Space Pilot 3D — cross-device integration

The game keeps `space-pilot` and `/control/space-pilot`. With Firebase configured,
Control is authoritative and the child Display receives accepted bounded checkpoints.
The normal `/display` automatically joins the latest authorized Space Pilot room.
A dedicated `/display/space-pilot?session=<UUID>` link is also available from Control.
Use the same reachable application origin on the therapist and child devices.

`NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED=true` explicitly enables production 3D.
`false` restores legacy registration and Control. Unset defaults to legacy in
production and 3D in development. Rebuild after changing public flags.
`/control/space-pilot-legacy` preserves the original implementation.

Therapist touch controls support held directions, diagonals, neutral, cancellation
and focus loss. MANUAL maps to the existing `keyboard` contract value; RIGHT_HAND
maps to `sensor`. Manual override stays available in sensor mode. Release requires
fresh sensor pickup before returning to sensor steering. EASY stays horizontal;
MEDIUM assists altitude; ADVANCED accepts two-axis movement. Difficulty, sensitivity,
missions, camera, non-punitive collisions, golden rings and cosmetic upgrades retain
R3 gameplay. LOW/MEDIUM/HIGH still contain 15/13/11 rings and 3/5/7 hazards.

The existing calibrated pointer can originate on Control or an authenticated laptop.
For an iPad Control, select the remote sensor source and open the generated
`/control/space-pilot/sensor-source?session=<UUID>` URL on the supported sensor laptop,
using the same staff account. Connect RIGHT_HAND through the existing sensor setup,
return to the source URL, and keep it visible. This relay uses the unchanged local
pointer protocol and forwards only normalized filtered coordinates at at most 10 Hz.
It adds no BLE driver, calibration, filter, recenter or role-assignment changes.
Manual iPad control does not require a physical sensor.

Firebase rooms use schema 1, the existing v4 accepted gameplay contract, a 12-second
ownership lease and compare-and-swap epoch/revision fencing. Running checkpoints
are bounded to 10 Hz; stopped checkpoints use 1 Hz. Display interpolates accepted
positions only, never collisions, missions or scoring. Reload/reconnect restores
accepted geometry and counters stopped for therapist resume. No raw WT901 samples
or Three.js scene objects are sent. The legacy pointer mirror remains excluded on
these game/source routes.

Eligible patients receive immutable `space-pilot`, `resultVersion: 2`, `sp3-rings`
results through the existing history repository. Walk-ins do not write patient
history. Old star records remain unversioned legacy records and are never converted
to rings. Mixed star/ring trend comparisons are excluded.

See `docs/spacepilot3d/CROSS_DEVICE_INTEGRATION_REPORT.md` for verification evidence,
hardware checks, complete merged rules, deployment order and rollback. Prototype
routes and historical phase artifacts remain available; their local BroadcastChannel
transport is independent of configured production sessions.
