# Mirror Quest M1
Baseline inspected in the original dirty working tree. The unified liveGame architecture is uncommitted; a HEAD-only worktree would omit it. All existing modifications are preserved. Other game folders remain untouched.

One authoritative Control engine; read-only Display; shared /liveSession, controller lease/presence/staff auth, ownership recovery, coalescing publisher and save-once history. Dedicated mirrorquest3d modules isolate renderer, feature engine, simulated adapter and platform mapping.

Exactly nine stages, four interchangeable costumes on one articulated rig. Features are normalized intentional motion values. Manual and simulation are supported. RIGHT_HAND, LEFT_HAND, RIGHT_FOOT, LEFT_FOOT and combinations are pending physical validation; normalized pointer input is deliberately not mapped to joint angles. No BLE/filter/calibration changes.
