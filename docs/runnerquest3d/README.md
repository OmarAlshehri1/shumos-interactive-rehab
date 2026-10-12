# Runner Quest 3D — documentation index

* `FINAL_REPORT.md` — start here (status, files, tests, limitations, hardware checklist, rollback).
* `PHASE_R1_REPORT.md` … `PHASE_R5_REPORT.md` — per-phase reports.
* `LOCAL_INTEGRATION_PATCH.md` + `LOCAL_INTEGRATION.patch` — staged library integration (not applied).
* `results/` — raw JSON/text results (tests, perf, e2e, production smoke, resource checks).
* `screenshots/`, `video/` — real browser captures.
* `validation/` — the Chrome DevTools-protocol scripts that produced the evidence (`node <script> <outputDir>`; they expect the dev server on `127.0.0.1:3210` of a credential-free scratch copy, or `prod.mjs` against a `next start`). Scripts `shot1.mjs`, `shots.mjs`, `glprobe.mjs`, `e2e-basic.mjs` are exploratory helpers.
* `DUAL_PROJECTION_UPGRADE_REPORT.md` — WALL + FLOOR dual-projection upgrade (R1–R12): start here for the current state.
* `floor-evidence/` — FLOOR/WALL screenshots, results JSON/logs, gameplay video; `validation/floor/` — the scripts that produced them.
