# Phases 05–07 final report

| Phase | Status | Evidence |
|---|---|---|
| 05 — Control/Display integration | **COMPLETE** | Exclusive Control authority, corrected timing/readiness, complete matching sessions and safe interruption recovery |
| 06 — Graphics upgrade | **COMPLETE for experimental software upgrade** | Licensed textured 3D ship and live scene substantially improve the placeholder; reference realism remains visibly higher |
| 07 — Software validation | **COMPLETE** | 1,337 tests, typecheck, lint, build, all difficulty runs, actual-focus integrated performance and failure recovery |

**The visual reference is not fully matched.** The implementation is a stylized, playable browser scene. The low-poly hull, procedural rocks/planet and sprite exhaust still need richer authored assets to reach the reference's realism. Physical sensor/projector validation and child/therapist usability review remain pending.

## Open the experiment

- Control: http://127.0.0.1:3000/control/space-pilot-3d-prototype
- Display: use **Open Display** in Control to generate `/display/space-pilot-3d-prototype#room=<room-id>`.
- The normal configured development server is running. Existing staff sign-in is required; the final signed-out browser check exposed zero session controls.
- Keep both windows visible in the same browser profile and origin. Control may be unfocused. Hidden/stale windows suspend; Resume is explicit.

Production routes and game registration were not migrated. Built Display returns 404. Built Control streams Next.js not-found content with HTTP 200 under its inherited layout, without the experimental component or controls. Authentication behavior was preserved.

## Delivered behavior

Control alone steps the existing simulation and accepts collisions, score, missions and upgrades. Versioned room/owner/session/run/revision/input-epoch identities guard local synchronization. Fresh frame echoes and nonce round trips establish readiness without comparing window clocks. Duplicate and stale messages cannot claim outcomes. Web Locks prevent duplicate authority. Local summaries support safe reload recovery and do not write patient history.

The active Display uses a real-time Three.js scene with a licensed Quaternius Bob GLB, embedded panel texture, white/silver-blue PBR materials, twin engines, tier-specific cosmetic attachments, beveled gold stars, irregular rocks, emissive fiery variants, pooled effects, sparse starfields and a procedural planet/nebula. No gameplay screenshot, reference-image background or image-based gameplay simulation is used.

Low/medium/high graphics quality and adaptive resolution preserve input/gameplay behavior. Model failures and context loss disable readiness and recover through Display reload plus therapist Resume. Resources and late asynchronous loads have explicit cleanup.

## Actual screenshots

| Capture | Path |
|---|---|
| Phase 05 placeholder comparison | [phase05-display.png](screenshots/phase05-display.png) |
| Final tier 1 and recognizable star | [phase07-medium-m1-encounter1.png](screenshots/phase07-medium-m1-encounter1.png) |
| Final rock avoidance scene | [phase07-low-m1-encounter3.png](screenshots/phase07-low-m1-encounter3.png) |
| Tier 2, paused at three stars | [phase07-tier2.png](screenshots/phase07-tier2.png) |
| Final tier 3 and fiery asteroid | [phase07-low-m3-encounter2.png](screenshots/phase07-low-m3-encounter2.png) |
| Matching therapist view | [phase06-control.png](screenshots/phase06-control.png) |
| Full authoritative session summary | [phase06-summary.png](screenshots/phase06-summary.png) |

These are unretouched actual gameplay captures. Some capture names retain the phase in which the capture workflow was created. One other medium mission-3 capture omitted static composited content; it is retained and documented in the Phase 07 report. Representative images above have been inspected.

## Validation results

- **105 Vitest suites / 1,337 tests passed**, including existing production tests.
- TypeScript, lint and final production build passed. No ignored failing test or relaxed safety timeout.
- Three missions at each of LOW, MEDIUM and HIGH completed after the graphics upgrade: **11 stars, 1,100 points, two deliberate asteroid collisions, 18 resolved encounters**, matching Control/Display after each encounter.
- Keyboard steering, simulated RIGHT_HAND, sensor dropout/pickup, therapist controls, tiers, duplicate/stale messages, reloads, focus/minimize, message loss, scheduler stalls, multiple Displays and ownership transfer were exercised.
- Actual WebGL context loss, model 404/recovery, repeated reloads and disposal tests passed. Final performance/recovery browser run had no page/shader errors or Firebase requests.
- Staff auth was checked separately with the real configured environment. Test-only local demo override was process-scoped and removed; `.env.local` and auth code were not edited.

### Integrated performance

Apple M1 / ANGLE Metal, Chrome 155, 1376×768 CSS viewport, device scale 2. Both windows ran together. Browser background override flags and focus emulation were disabled; actual focused/unfocused states were asserted.

| Quality | Render DPR | FPS with Control unfocused | p95 frame ms | Max sampled frame ms |
|---|---:|---:|---:|---:|
| low | 0.80 | 60.00 | 16.80 | 17.60 |
| medium | 1.25 | 60.00 | 17.40 | 17.70 |
| high | 1.75 | 60.00 | 17.10 | 17.70 |

Opposite focus arrangement also remained about 60 FPS. Each steady sample covers 240 frame intervals after settling, not an entire-session average. Sampled draw calls were 31–44 with 13 geometries, 4 textures and 10 programs. GPU memory bytes were not measurable. Repeated paused reloads returned stable resource counts; startup spikes are separately reported. These measurements do not include physical BLE/projector latency, a long-session soak or peak fiery-effect benchmarking.

Detailed loading times, transport delivery measurements and raw data: [Phase 07 report](PHASE_07_REPORT.md), [performance JSON](validation/phase07-performance.json). Reproduction scripts and logs: [validation/README.md](validation/README.md).

## Bugs fixed and limits

The key synchronization fault was mixing message receipt `performance.now()` with an earlier RAF frame-start timestamp. A valid ACK could look as if it came from the future and be expired. Both runtimes now use callback-entry clocks; true reverse-clock and 250 ms safety checks remain. Readiness follows actual rendering, and shader warmup precedes readiness. Queued cancellable ownership acquisition resolves the StrictMode lock race. ACK sequences/epochs and owner-handshake invalidation reject stale recovery.

Graphics review replaced a bulky candidate hull, corrected background clipping and reduced overbright rocks. Browser harness focus/selector errors were corrected and rerun; final measurements use only the passing actual-focus run. The standalone CDP freeze command was unreliable, so combined freeze/message-loss checks are identified accurately. Native-GPU checks passed; an earlier SwiftShader run safely paused and is not counted as a performance pass.

## Assets and dependencies

No package dependency was added in Phases 05–07. Existing `three` and `@types/three` from the earlier prototype remain unchanged. The only shipped external model is Quaternius Bob from [Ultimate Spaceships Pack](https://quaternius.com/packs/ultimatespaceships.html), published under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The author's Drive quota was exceeded, so a documented public redistribution of the same pack supplied the glTF. Only its model/embedded texture were used, converted to GLB; no other game's code was imported.

Sources, commercial-use license, modifications, download provenance and hashes: [ASSET_LICENSES.md](ASSET_LICENSES.md). All other scene content is repository-authored procedural geometry/shaders/effects. The user reference is not distributed as an asset.

## Files changed

This list is relative to the saved **732-file Phase 05 starting baseline**, not the repository's pre-existing uncommitted changes. Those earlier changes were retained.

Modified existing files:

- `app/control/layout.tsx`
- `app/display/space-pilot-3d-prototype/page.tsx`
- `components/display/spacepilot3d/prototype.module.css`
- `lib/spacepilot3d/README.md`
- `lib/spacepilot3d/renderer.ts`
- `next-env.d.ts` — generated by Next.js on server/build transitions; not manually edited.

Created implementation, tests and asset files:

- `app/control/space-pilot-3d-prototype/page.tsx`
- `components/control/spacepilot3d/PrototypeLocalOnlyBoundary.tsx`
- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/display/spacepilot3d/SpacePilot3DSessionDisplay.tsx`
- `lib/spacepilot3d/PHASE05.md`
- `lib/spacepilot3d/__tests__/graphicsAsset.test.ts`
- `lib/spacepilot3d/__tests__/graphicsLifecycle.test.ts`
- `lib/spacepilot3d/__tests__/runtime.test.ts`
- `lib/spacepilot3d/__tests__/session.test.ts`
- `lib/spacepilot3d/controlSessionRuntime.ts`
- `lib/spacepilot3d/displaySessionRuntime.ts`
- `lib/spacepilot3d/graphics.ts`
- `lib/spacepilot3d/presentation.ts`
- `lib/spacepilot3d/sessionAuthority.ts`
- `lib/spacepilot3d/sessionChannel.ts`
- `lib/spacepilot3d/sessionContract.ts`
- `lib/spacepilot3d/sessionReplica.ts`
- `lib/spacepilot3d/sessionStorage.ts`
- `public/spacepilot3d/models/bob.glb`

Reports and evidence created:

- `docs/spacepilot3d/PHASE_05_REPORT.md`
- `docs/spacepilot3d/PHASE_06_REPORT.md`
- `docs/spacepilot3d/PHASE_07_REPORT.md`
- `docs/spacepilot3d/PHASE_05_TO_07_FINAL_REPORT.md`
- `docs/spacepilot3d/ASSET_LICENSES.md`
- `docs/spacepilot3d/PHYSICAL_VALIDATION_CHECKLIST.md`
- Every screenshot and validation script/log listed in [ARTIFACT_MANIFEST.md](ARTIFACT_MANIFEST.md).

Generated `tsconfig.tsbuildinfo` also changed during typechecks. The source hash audit confirms unchanged authoritative gameplay/collision/mission code, sensor/keyboard adapters, existing production registry/schema/auth and package manifests. The only intentional shared-layout change omits the inherited Firebase pointer publisher on the exact experimental Control route; the local RIGHT_HAND publisher and all production routes retain their existing wiring. See [change-manifest.json](validation/change-manifest.json).

## Production readiness and next authorized boundary

This is a validated local software prototype, **not production-ready clinical software**. It has no approved cloud authority, production registration, clinical history writes, target-projector sign-off or physical WT901 validation. Follow the [physical checklist](PHYSICAL_VALIDATION_CHECKLIST.md) before making those claims.

Recommended Phase 08, **proposal only**: review the visual/playability result with the user; run physical sensor/projector and long-session validation; resolve any findings; then seek explicit approval for a versioned production session/history adapter, Firebase rules/emulator tests, controlled rollout and production game registration. The Phase 05 report contains the unapplied schema/rules migration proposal.

**Stopped after Phase 07. No Phase 08 implementation, other game, commit, push or deployment was started.**
