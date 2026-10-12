# Fire Rescue 3D — implementation checkpoint

2026-10-11. Current uncommitted shared platform baseline inspected and preserved; pre-edit snapshots in `/private/tmp/firerescue3d-baseline`. ARCHITECTURE.md is outdated: the actual current platform has staff authentication, private patient binding, generic lib/liveGame ownership/publisher/history helpers and native Three.js.

Control owns a pure deterministic engine in lib/firerescue3d. Shared liveSession receives a versioned fr3 payload, via the existing sessionRepository and coalescing publisher. Display decodes strictly and interpolates presentation only. No new cloud paths, authentication, history repository or game registry. Nine stages across mountain, forest and countryside. Simplified stable road-relative driving, clamped boundaries, gradual aimed extinguishing, explicit assistance attribution.

New game uses development-on/production-opt-in NEXT_PUBLIC_FIRE_RESCUE_3D. Existing temporary six-category arrangement is retained. Wheel/pedal mappings are configurable and unassigned until calibrated. Local Control hardware only; no safe shared remote hardware relay currently exists. Physical hardware validation is pending. User forbids commit, push, deployment and rules publication.
