# Q2 — Nine challenges passed

Three levels, three stages each: First Shapes (2 pieces), Three Shapes (3), Four Shapes (4), House (4), Car (4), Robot (4), Tower (3), Bridge (3), Castle (5). Total: 32 accepted placements across a complete nine-stage session.

Stages define unique piece IDs, source positions, matching target transforms, colors, geometry and prerequisite dependencies. House needs the base before walls and walls before roof; Tower requires bottom/middle/top; Bridge requires both supports before deck; Castle requires foundations before towers/wall and the final flag. Selection ignores unavailable upper pieces. Pieces never collapse; mistakes never remove progress or points; there is no elapsed-time failure.

Independent high/medium/low assistance controls tolerance. Source models are compact scaled versions of the full assembly pieces; selected pieces travel on a constrained plane and settle/enlarge at their accepted target. House windows/door, car cabin/windows/wheels, robot face, castle entrance/battlements/flag provide recognizable objects. Completion gently moves the car, waves the robot arm, lights the house/tower/castle and moves a small vehicle across the bridge. Reduced-motion users receive static completion feedback. No music, flashing, camera shake or physics failures.

Acceptance: 18 focused tests and TypeScript passed. `validation/q2-browser.mjs` completed all nine stages through actual browser mouse clicks/movement. No authoritative state was injected. The Display renders accepted Control state only. Zero page/console errors and zero Firebase requests were observed. Results: `validation/q2-browser.json`. Every stage has a completed screenshot in `screenshots/`; shape matching and final summary also have dedicated screenshots.

After the Q1 lifecycle fix, visible Chrome hardware rendering worked. Both screens together reported approximately 59–60 FPS in this run. This is the local browser/hardware configuration only, not projector or WT901 evidence. Detailed metrics are preserved in JSON; Q4 will extend stability, latency, cleanup and fallback checks.

Progression is therapist-gated: a completed model remains visible until Next. Pause, resume, restart, skip and end are available; no countdown pressures the child. Q2 critical acceptance passes; proceed to Q3.
