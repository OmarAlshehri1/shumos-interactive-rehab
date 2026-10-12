# Fire Rescue 3D — final implementation and validation report

Date: 2026-10-11. **Functional implementation completed; premium visual acceptance remains open. This is not declared a software release candidate.** The original procedural world is playable and optimized, but its rock materials, foliage silhouettes, vehicle finish and fire presentation remain below the supplied reference's premium driving-game quality. The safest next step is an art pass behind the existing production-disabled feature flag, followed by renewed screenshot review and GPU checks. Physical steering wheel, pedals, iPad, projector and audio validation are pending separately.

No commit, push, deployment or production Firebase rule publication was performed. Unrelated uncommitted platform and other-game work was preserved. The attached photograph was used as composition/art-direction reference; no image, branding, model or geometry was copied into the game.

## R1–R12 status

| Phase | Result | Evidence / remaining requirement |
|---|---|---|
| R1 platform audit | Complete | Existing registry, auth, lease, patient context, publisher, history and Display reused; [audit checkpoint](R1_CHECKPOINT.md). Installed Next.js guides read before implementation. |
| R2 world and art direction | Implemented; premium gate open | Three original procedural environments, lighting, atmosphere, terrain, winding roads, vegetation and cliffs. Final screenshots remain visibly procedural. |
| R3 truck and camera | Implemented; visual refinement open | Original articulated truck with cab/windows/mirrors, grille/lights, roller doors, ladder, roof rails, pump valves/gauges/couplings, hose, original rear chevrons and wheels. Three-quarter driving camera and eased firefighting camera. Finish/detail still below reference. |
| R4 accessible driving | Complete in software | Stable road-relative dynamics, steering/throttle/brake, speed caps, clamped boundaries, gradual acceleration/braking and safe rescue stops; unit and actual touch gameplay tests. |
| R5 firefighting | Complete in software; visual refinement open | Aimed continuous water, gradual depletion, missed stream has no effect, target selection/sequence, flame shader, smoke, glow, splash and articulated turret. |
| R6 nine stages | Complete | All nine touch-played; 12 driving objectives, 18 fire targets, 30 completed objectives. No completion shortcut used. |
| R7 manual therapist Control | Complete in browser | Separate Control and Display contexts, touch holds/sliders, all session commands and recovery; hardware unnecessary. Physical iPad validation pending. |
| R8 hardware adapters | Prepared; physical validation pending | Local native Gamepad adapter and calibration; wheels/pedals only when exposed through browser Gamepad. Shared normalized hand pointer reused. No force-feedback/HID or remote hardware relay claims. |
| R9 accessibility/game feel | Implemented | Assistance modes, small intentional pedal movement, dead zone/range/threshold, reduced motion, high/low graphics, optional muted-by-default sound, calm instructions, no timer pressure or clinical scoring. |
| R10 platform/history/rules | Complete in tested software | Shared liveSession, private patient binding, save-once history, rules candidates, original library categories retained. Rules unpublished. |
| R11 validation | Functional gates passed; visual gate open | Static/build/regression, rules emulator, nine-stage gameplay and cross-context recovery evidence below. Desktop browser readings do not validate physical devices. |
| R12 release preparation | Prepared; release approval blocked by visual gate | Production flag off by default, unpublished merged rules, rollback and batch checklist below. Requested READY wording intentionally withheld. |

## Implementation architecture

`lib/firerescue3d/engine.ts` is the authoritative pure reducer. Control runs it every 50 ms. Local touch, calibrated Gamepad or the existing shared hand pointer enters Control; the runtime applies freshness checks and safety pauses. Manual therapist input has priority over selected hardware. Display does not simulate objectives, award completions or write game state.

Control → existing `LiveRecordPublisher` → existing `publishSession` / `/liveSession` → strict Fire Rescue decoder → read-only Display. State uses the common session envelope and a versioned `fr3` JSON payload; no new cloud session tree was created. Writes coalesce at a minimum 150 ms interval and use the shared heartbeat/ownership mechanisms. Presentation interpolates vehicle and camera motion without changing authoritative progress. Stale Control connection freezes visible gameplay and displays a waiting overlay.

Staff authentication, controller lease, tab ownership, Display presence, patient selection, `HistorySaver` and `saveSessionHistoryOnce` come from the shared platform. The runtime captures patient identity once; active patient mismatches and competing tabs are blocked. Reload recovery pauses instead of replaying held input. Input loss, tab blur/visibility loss and network loss stop gameplay safely. Resuming requires therapist action.

## Visual architecture

Native Three.js, original runtime geometry and Canvas textures; no downloaded commercial assets. Physical sky, PMREM environment, sunlight, shadow map and distance fog provide lighting. Terrain and roadside geometry follow the same original road center as driving. Rescue pads are flattened and roadside clearance prevents terrain crossing the road. Distant ridgelines were corrected to remove visible flat floating edges. Rocks use irregular fractured geometry. Trees, bushes and rocks are instanced; stationary modular truck and roadside details merge by material. Renderer disposal releases geometry, materials, textures, environment and canvas.

High mode caps pixel ratio at 1.5 with shadows; low mode uses 0.75, fewer instances/terrain subdivisions and no shadow map. Reduced motion limits environmental and camera animation. Control defaults to a lightweight SVG mission overview; a 3D preview is optional to reduce tablet load. The original truck has independent wheel spin/front-wheel steering and aimed roof nozzle. Flames shrink as authoritative intensity falls; smoke and light also diminish.

**Visual assessment:** readable road, calm HUD, coherent original truck and three environments are present. Compared with the reference, the final vegetation still has clustered billboard silhouettes, rock/ground shading lacks natural material depth, the truck is simplified, and the stream/fire effects need refinement. Do not market these screenshots as photorealistic or premium-complete. Improve asset/material quality and scene composition before reopening R11/R12 acceptance. Projector readability is assessed only from desktop 1280×720 screenshots, not a real projector.

## Driving, water and assistance

Driving uses distance, lateral offset and relative heading along a shared road function. Steering changes trajectory while moving; turning at rest does not spin the chassis. Throttle accelerates toward a capped speed; brake decelerates. Safe bounds and assisted lane correction avoid falling/crashing punishment. Arriving at each rescue stop transitions to stationary hose work.

Water activation must be sustained and aimed near a live target. Intensity decreases gradually at 0.25 per second when effective; misses do not count. Multiple targets and sequential rescue stages are explicit. Auto-water, aim assistance, auto-drive and other assistance count as assisted outcomes; therapist manual control also counts as assistance. Skips remain skips, partial ended stages remain partial, and repeats remove the repeated objective's old completion before it can be earned again. No instant-extinguish or fake-completion control exists.

Modes include manual, assisted, auto-throttle, therapist-throttle, steering-only and pedal-only. Settings expose sensitivity, steering range/dead zone, intentional-input threshold, speed, lane centering, aim assistance and graphics/motion/audio controls. No claim of force, joint angle, balance, clinical accuracy or therapeutic benefit is generated.

## Exact nine-stage design

| Level / stage | Stage | Environment | Drive legs | Fire targets | Behavior |
|---|---|---|---:|---:|---|
| Easy 1 | First Mission | Mountain | 1 | 1 | Straight introductory road |
| Easy 2 | Right Turn | Mountain | 1 | 1 | Gentle right curve |
| Easy 3 | Left Turn | Mountain | 1 | 1 | Gentle left curve |
| Medium 1 | Winding Road | Forest | 1 | 1 | Winding route |
| Medium 2 | Water Control | Forest | 1 | 2 | Two aimed targets |
| Medium 3 | Double Rescue | Forest | 1 | 2 | Sequential targets |
| Advanced 1 | Mountain Route | Countryside / mountain forest | 1 | 2 | Longer winding route |
| Advanced 2 | Steering & Hose | Countryside / mountain forest | 2 | 3 | Two rescue stops |
| Advanced 3 | Final Rescue | Countryside / mountain forest | 3 | 5 | Three stops, sequential targets |

## Therapist controls and hardware boundary

Large touch holds provide left/right/center steering, throttle, brake, hose left/right/up/down and water. Sliders provide steering and aiming adjustment. Controls include start, pause/resume, safe stop, road reset, restart, repeat, objective/stage skip, next, stage selection, end and a fresh session. Pointer release/cancel/capture loss clears holds; holds refresh while pressed. The fixed stop appears during running gameplay.

Gamepad calibration is local to Control and stored locally under `shumos.fireRescue.mapping.v1`: device index, axis/button assignments, steering center/min/max, pedal rest/pressed, inversion and dead zone. Defaults intentionally leave axes unassigned. Invalid or absent devices pause and offer manual fallback. Wheel/pedal browser exposure varies; physical detection/calibration, latency and intentional small movement must be verified on target hardware. Hand aiming consumes the existing normalized pointer with monotonic freshness; hardware transport remains the platform's responsibility. No new Firebase hardware relay or device control service was added.

## Integration, security and history

Registry ID `fire-rescue-3d`, Arabic `مهمة الإطفاء`, English `Fire Rescue 3D`, surface `WALL`, route `/control/fire-rescue-3d`. Original six-category presentation and temporary all-games-in-first-category arrangement are retained. Display registration, library thumbnail, patient history/detail and analytics dispatch support the game. Its history label survives when the feature flag is disabled. Optional chimes use shared audio primitives; no paid TTS/prefetch requirement was introduced.

History uses existing `/sessions/{patientId}/{sessionId}`, `resultVersion: 1`, `engine: fr3`, UUID session ID, captured patient/staff IDs, timestamps, active duration, start/end difficulty/stage, completed/skipped stage counts, driving/fire counts, assisted/independent/skipped/repeated counts, session completion and per-stage rows. Rows are `COMPLETED`, `SKIPPED` or `PARTIAL`. Counts reflect actual objectives; `inputSource: MIXED` is coarse metadata, not validated hardware attribution. Walk-in sessions do not fabricate a patient history record. No clinical metrics are stored. The all-nine browser run saved one record and retained exactly one after ended-Control reload.

The merged rules add the game allowlist, version/payload bounds, staff/lease/owner/tab envelope restrictions, monotonic revisions, and create-only history with patient existence/binding and bounded integer counts. A restrictive guard prevents another active tab bypassing ownership by inventing a new session ID. Existing unrelated game/history validators were retained; the original platform rules suite passes. Security enforcement treats the JSON gameplay payload as bounded opaque data; strict client decoding handles internal state. It does not attempt to prove every simulated objective server-side.

Candidates: [merged Fire Rescue rules](DATABASE_RULES_MERGED_FOR_FIREBASE_CONSOLE.json), root `database.rules.json`, and the existing `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` are kept identical. These files are prepared artifacts, **not published rules**. One proposed automated authorization edit was rejected by automatic review; no rejected command ran. The final accepted implementation kept the original clauses and added a restrictive guard. No approval remains pending for the completed local work.

## Validation and evidence

Exact source file manifest: [FILES.md](FILES.md). [Shared integration review patch](SHARED_INTEGRATION_REVIEW.patch) compares snapshotted shared files against their pre-task dirty baseline; it omits later-added audio/history-label changes and is a review aid, not an automatic rollback command. Evidence artifact inventory: [ARTIFACTS.txt](evidence/ARTIFACTS.txt).

| Check | Result |
|---|---|
| Focused Fire Rescue engine/input/live/history tests | 13 passed, including real reducer completion of all nine stages |
| Full Vitest | 146 files passed / 10 skipped; 1828 passed, 75 skipped in final run (opt-in emulator tests run separately) |
| Full ESLint | Passed; final rerun log retained |
| TypeScript | Isolated fresh Next type generation and tsc passed; production builds also run TypeScript |
| Fire Rescue emulator rules | 8 passed, including new-session tab bypass rejection and honest partial history |
| Existing platform emulator rules | 12 passed |
| Production enabled | Passed on final source with fresh isolated output and `next build --webpack` |
| Production disabled | Passed on final source with fresh isolated output and `next build --webpack` |
| Actual touch gameplay | All nine stages, 12 drive legs, 18 targets, 30 assisted objectives, zero skipped |
| Independent Control/Display | Pose/progress, aim/fire, stages, pause/resume and recovery checked |
| Save once | Exactly one completed history record before and after reload |

The full suite initially encountered two existing Space Pilot 5-second timeouts while GPU recording and builds competed for resources. No tests were changed or weakened. A run with `--maxWorkers=2` passed. Skipped tests require their respective opt-in environments; Fire Rescue and original platform rules were run separately against emulators. Isolated validation copies symlink dependencies and therefore use `next build --webpack`; Turbopack rejected a symlink outside the temporary filesystem root. A disabled-build attempt was also blocked fetching the existing Google Fonts in the sandbox; the permitted font-fetch retry passed without modifying fonts. The dirty source tree also had stale `.next` validator references to previously removed Feed Animals routes; isolated fresh type generation/builds avoid treating that generated cache as source.

The all-nine recording used real CDP touch events and actual throttle/water holds in independent authenticated Control and read-only Display contexts. Browser automation represents therapist interaction; it is not physical iPad testing. Latest renderer refinements followed the long run, without changing its engine behavior; focused final tests and separate recovery/graphics runs cover the final source. Graphics-only runs deliberately use skip to reach a water demonstration; that video is not the all-nine completion proof.

- [Nine-stage results and history](evidence/browser-gameplay.json)
- [Full nine-stage gameplay video](evidence/gameplay-nine-stages.webm)
- [Earlier recovery/graphics checks](evidence/browser-final-qa.json)
- Final renderer screenshots, recovery/video and performance summary are linked in the final validation addendum below.
- Exact executed browser scripts are retained as `.cjs.txt` evidence with local paths replaced by placeholders. They require Playwright/Chromium, isolated loopback Auth/DB emulators, fake active staff `fire-therapist@example.test`, fake password `local-test-password`, and fake patient `fr-patient`. Never point their fixture resets at production.

## Performance interpretation

Desktop: Apple M1, Chromium ANGLE Metal renderer, Display 1280×720 and independent touch-enabled Control 1024×900. Production high mountain warm samples measured 60 FPS, 88 draw calls, approximately 213,516 triangles, 43 geometries and 11 textures before the final rock/ridgeline refinements. Final environment/mode measurements appear in the addendum. Earlier low-mode steady runs measured roughly 5.7 live writes/sec and ~1.5 KB envelopes; publication is bounded to ≤6.7 gameplay writes/sec plus the shared heartbeat. Public liveSession had no patient ID.

The all-nine 8m44s browser recording ran headless software WebGL at 3–5 FPS. That verifies authoritative gameplay/synchronization, not acceptable GPU performance. Headful GPU runs warmed to 60 FPS; cold scene changes under competing builds briefly measured 2–24 FPS. Cold compilation spikes are not hidden by steady averages. Physical laptop variants, iPad, wheel/pedals and projector require validation. Resource counts and command propagation timings are browser measurements, not heap-leak proofs or network SLA claims.

## Feature flag and rollback

`NEXT_PUBLIC_FIRE_RESCUE_3D`: production defaults off; set `true` at build time to opt in. Development defaults on unless explicitly `false`. `.env.example` documents production `false`. Client flags are build-time values, so changing one requires a new build. Disabled route returns notFound and the library excludes the game; historical records remain readable.

Safest rollback is to rebuild with the flag `false`. For source rollback, remove only the new Fire Rescue application files and surgically reverse the additions listed in [FILES.md](FILES.md). Preserve all pre-existing modifications, including other games, library changes and retirement of Feed Animals. Initial shared-file snapshots and status were preserved locally in `/private/tmp/firerescue3d-baseline`; do not use `git reset`, `git clean` or whole-file baseline restoration on this shared dirty workspace. Unpublished rule candidates can be withdrawn without changing any live database. If rules are ever published later, use a separately reviewed compatible rollback that preserves existing patient history access.

## Batch deployment checklist — pending, not executed

- [ ] Finish the premium art pass and repeat comparison with the attached reference.
- [ ] Verify final screenshots/video and projector readability on intended hardware.
- [ ] Calibrate actual wheel/pedals/Gamepad and test small intentional movement, dead zones, inversion, input loss and manual fallback.
- [ ] Test actual iPad/Safari touch holds, network recovery, optional preview and audio unlock.
- [ ] Review shared-file diffs against the dirty baseline and run the combined batch regression suite.
- [ ] Review and emulator-test the final combined Firebase rules for all concurrently developed games.
- [ ] Obtain explicit authorization before commit, push, deployment or production rule publication.
- [ ] Build the release with the intended flag, verify authenticated staff/lease/history against staging, then smoke-test enabled and disabled builds.
- [ ] Publish reviewed compatible rules and application only through the authorized batch workflow.
- [ ] Repeat nine-stage and save-once checks in staging; preserve rollback artifacts and existing records.

No other game was started. The remaining release blocker is premium visual acceptance; target physical hardware validation is also pending and explicitly separate from software/browser coverage.

## Final validation addendum

The final renderer browser run passed all 14 recorded recovery/control checks with zero page errors. Network loss paused Control; reconnect followed by reload preserved progress paused. An earlier harness incorrectly tried to press the running-only floating stop while already paused; the harness was corrected to explicitly resume first. No gameplay behavior or assertions were weakened.

- [Final source browser results](evidence/browser-art-review-qa.json)
- [Mountain screenshot](evidence/art-review-mountain-driving.png)
- [Forest screenshot](evidence/art-review-forest-driving.png)
- [Countryside screenshot](evidence/art-review-countryside-driving.png)
- [Aimed water screenshot](evidence/art-review-water-stream.png)
- [Touch Control screenshot](evidence/art-review-control-touch.png)
- [Final source graphics/recovery video](evidence/art-review-graphics-and-recovery.webm)

| Final source GPU scene | Warm FPS | Draw calls | Triangles | Geometries / textures |
|---|---:|---:|---:|---:|
| High mountain | 60 across 5 samples | 88 | 213,516 | 43 / 11 |
| High forest | 60 across 5 samples | 82–84 | 194,202–194,206 | 43 / 11 |
| High countryside | 60 across 5 samples | 99 | 204,854 | 50 / 11 |
| Low water | 60 | 66 | 63,614 | 52 / 11 |
| Low driving resource sample | 59–60 | — | — | 45 / 11, unchanged for 5 seconds |

Measured live writes: 5.53/sec; final envelope 1,477 bytes, no public patient ID. Ten touch-command → Display-status measurements were 149–216 ms, median 180 ms, including Playwright action/polling overhead and local emulator transport. These are local browser observations, not physical device latency guarantees. The source run used development serving; production high mountain before the final geometry-only art changes also held 60 FPS. Final clean production evidence is recorded separately when available.

### Clean final production verification

Both final production builds passed. The enabled production run repeated all 14 control/recovery checks with zero page errors after loading the final rules into the demo emulator only. All three high-mode environments held 60 FPS across five warm samples each; low water held 60 FPS. The disabled build retained all five baseline production games (`balloon-quest`, `follow-the-footsteps`, `bubble-pop-wall`, `space-pilot`, `color-chase`), excluded Fire Rescue from the library and rendered Next notFound on its direct route. Next streamed that response with HTTP 200 plus its 404 boundary; this is a rendered notFound check, not a claim of HTTP-status 404.

Final production command propagation: 58–203 ms, median 198 ms across ten touch commands; live writes 5.53/sec; envelope 1,478 bytes. Low-mode resource samples stayed at 45 geometries and 10 textures.

- [Final production browser results](evidence/browser-production-final-qa.json)
- [Disabled build browser results](evidence/browser-disabled-qa.json)
- [Production mountain](evidence/production-final-mountain-driving.png)
- [Production forest](evidence/production-final-forest-driving.png)
- [Production countryside](evidence/production-final-countryside-driving.png)
- [Production aimed water](evidence/production-final-water-stream.png)
- [Production touch Control](evidence/production-final-control-touch.png)
- [Production graphics and recovery video](evidence/production-final-graphics-and-recovery.webm)
- [Enabled build log](evidence/build-enabled-final.log), [disabled build log](evidence/build-disabled-final.log)
- [Full regression log](evidence/full-vitest-final.log), [Fire rules log](evidence/rules-tests-final.log), [original rules log](evidence/platform-rules-final.log)

The screenshots were visually inspected. The open premium-art gate remains; passing the production checks does not change that assessment.
