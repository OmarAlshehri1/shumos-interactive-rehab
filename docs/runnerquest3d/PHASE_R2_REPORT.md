# Runner Quest 3D — Phase R2 report (premium world, obstacles, game feel)

**Status: COMPLETE** (software; real-Chrome screenshots; no hardware involved)

## World
* A coherent park trail: cobble path over fenced grass, **three tinted lane regions** (blue / green / amber) with dashed dividers, instanced trees (round + pine), bushes, flower patches, rocks, bridges over streams, hills, drifting clouds, a windmill landmark, soft pollen motes, fog that hides pop-in, and a sun with real shadows (PCF, 2048 map on *high*).
* Nine stage themes (meadow, garden, trail, lake, forest, sunset, summit, river, festival) change sky, fog, grass and lighting — see `screenshots/r2-sunset-theme.png`, `r2-destination-final-stage.png`.
* Scenery is generated per 2.5 m cell from a hash of the cell index and rebuilt only when the runner crosses a cell, so it is deterministic and cheap; forward motion is therefore real parallax travel past fixed world objects, not scrolling textures.
* Destination: every stage ends in a plaza arch + fountain; the **final stage** adds a pavilion with lanterns and soft sparks (no flashing, disabled under reduced motion).

## Obstacles (all readable ≥ 20 m away, never unavoidable)
| Kind | Look | Rule |
|---|---|---|
| side | mossy boulder with orange flag, or log barrier with striped band, in 1–2 lanes + warm ground pad | stand in a free lane |
| hurdle | low striped hurdle (single lane or full width) + amber pad; turns green once accepted | free lane **or** one deliberate step (arms it; the hop is auto-timed) |
| gate | teal arch with light beam in the open lane; other lanes fenced | choose the glowing lane |
| marker | gold ring + arrow + beam, never blocks | correct lane = bonus star |
| checkpoint | full-width arch with bunting and Arabic banner | reward only |

## Safe timing (enforced in `session.ts`, covered by tests)
* Default speed 2.4 m/s; therapist range 1–4.5 m/s. First obstacle 38 m from the start; gaps ≥ 14 m. Generation is validated for reachability across many seeds/spacings.
* The runner **never collides**: when the way is blocked it brakes (2.6 m/s²) and **holds 1.6 m before the obstacle** until the child moves or steps. Optional "pause before obstacle" stops 7 m earlier. A therapist "assist" button moves past. There is no timer, no fail state and no lives; a ten-minute idle test stays in `playing` with the runner holding.
* A step is accepted up to 5/7/9.5 m (tolerance low/normal/high) before a hurdle; the hop animation is timed from the authoritative distance, so the child needs no precise timing.

## Feedback
* Soft gold sparkle burst (pooled, 0.95 s, additive) and an Arabic toast ("أحسنت!", "رائع!", "ممتاز!"…; "نقطة تفتيش — أحسنت!") on every star; the character cheers at checkpoints and markers. No screen flashes, no harsh sounds, **no background music** (no audio at all in this phase).

## Evidence (real Chrome, key events, M1 GPU, high quality)
`docs/runnerquest3d/screenshots/` — `r2-hop-*.png` (armed hurdle turns green, sparkle + toast after clearing), `r2-checkpoint-*.png`, `r2-marker.png`, `r2-gate-choose-path.png`, `r2-destination-final-stage.png`, `r2-sunset-theme.png`. Script: `validation/r2.mjs`. Short gameplay video is recorded in R5.

## Defects found and fixed during R2
* Hint banner showed while the next hurdle was 30 m away → range cut to 20 m.
* Obstacles behind the runner clipped through the camera → hidden once > 4.5 m behind.
* Hills had vertical cliff edges → replaced by 22 overlapping, lower, seeded hills.
* Marker was too small to read from the start of its approach → larger ring + arrow + beacon.
