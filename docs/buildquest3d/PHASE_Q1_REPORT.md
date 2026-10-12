# Q1 — Foundation passed

2026-10-10. Existing registry, Control/Display routes, staff gate, sensor runtime, normalized pointer transport, local authority patterns and installed Three.js were inspected. Relevant installed Next.js routing/client-component guides were read before coding.

Shared registry, Control layout, Display registry and many existing game files are dirty. No shared file was edited. A validation copy of the complete current working baseline (including required uncommitted code) was made at `/private/tmp/buildquest3d-validation`, excluding credentials and generated outputs. Node dependencies are reused. No worktree, commit, stash, reset or deployment occurred.

New modules isolate pure gameplay, rendering, sensor/controller adapters and local session protocol. First Shapes has two accessible source pieces and matching ghost openings. Three.js supplies rounded geometry, room environment reflections, soft shadow lighting, an angled orthographic camera, work mats and a composite/wood workbench. Selection and snap scoring live only in the pure Control engine.

Acceptance: typecheck and focused lint passed; 2 foundation tests passed. An actual Chrome mouse click/move placed a square, with no page errors. Screenshot: `screenshots/q1-workshop.png`. Browser harness and results: `validation/q1-browser.mjs`, `validation/q1-browser.json`. SwiftShader software WebGL was used after a hardware context failed. Initial metrics were not yet sampled; no performance claim is made.

Fixed during validation: authority-lock race and forced WebGL context loss during React development effect remount. Disposal explicitly releases geometries, materials, environment and renderer without invalidating the remounted canvas.

Cloud-configured routes are blocked until the dirty inherited shared cloud pointer publisher boundary can be safely changed. StaffAuthGate remains inherited and untouched. Library integration is deferred because its source registry is dirty. Q1 critical local foundation passes; proceed to Q2.
