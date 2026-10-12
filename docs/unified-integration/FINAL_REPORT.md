# Unified Shumos — verified local main

Completed 12 October 2026 on local `main`. **No push, deployment, production environment modification, or Firebase production rules publication occurred.** The owner has explicitly withheld final push approval until after integration and review.

## Integration

The existing backup directory `/Users/omaralshehri/ShumosBackups/shumos-prerelease-20261012-210510/` was verified before edits. Its current `du` output rounds to 3.1 GiB; the owner previously verified it as approximately 3.2 GB. All completed main-tree application work was preserved in commit `3587011`, including clinical visits, readiness/dashboard, calibration, library/audio/game refinements, Castle Legends and Balance Bridge. Videos, debug logs, raw WT901 datasets, build directories and environments were preserved locally and excluded from Git. Required native assets and thumbnail provenance sources are included.

| Local integration commit | Work |
| --- | --- |
| `3587011` | Preserve completed main-tree development |
| `e2e594a` | Merge Turn & Go, including feature commit `a61c45d` |
| `f32669f` | Merge Foot Maze, including feature commit `c6e76f6` |
| `4a32e71` | Merge Rhythm Steps, including feature commit `647b8d9` |
| `61d5be6` | Merge Body Sequence, including feature commit `ff710b4` |
| Final integration commit following the above | Shared fixes, verified final rules, regression tests and this report |

All four feature commit hashes were checked as ancestors of local main. The final library contains **19 unique canonical games** with all intended feature flags enabled. Existing IDs, legacy revivers, archived patient history and all 19 shared Display registrations remain available. Historical Arabic titles for the six new games remain readable when their optional launch flags are disabled.

## Resolved defects

- Added `tg3`, `fm3`, `rs3`, `bs3` to exact run-suffixed history handling; retained Balance Bridge's conditional suffix and Castle's original identity.
- Reconciled all shared registries, capabilities, audio cases, live/history unions and revivers, analytics, instructions, activity tags, native thumbnails and library counts. No independent visit, history or sensor system was introduced.
- Removed the duplicate Turn & Go, Foot Maze and Body Sequence projection validators in favor of the existing shared profile module. Rhythm Steps now imports shared measured dimensions and safe inset. Per-game configuration still travels through the existing accepted live-state envelope.
- Added short-lived calibration grid delivery through `presence/controller/projectionCommand`, with active-staff writes and authenticated Display reads of only that non-patient command. Validated profiles reject undeclared data. The existing controller metadata remains staff-only. A 90° Control profile was observed on an independent Display context.
- Corrected candidate rules that restricted shared stage-result fields such as `repeats` and `skipped` to one new game, and feature settings validators that rejected Castle's array-shaped configuration. Preserved the corresponding existing-game validators and strict new-game checks.
- Allowed legitimately early-ended Rhythm Steps sessions with zero presented targets to omit an empty `stageResults` collection; any progress still requires results. The real early-ended histories of all six games were saved and linked in the clinical emulator suite.
- Persisted evaluation-prompt acknowledgement in the existing tab session storage. Reload no longer reopens an acknowledged prompt and blocks the next activity. Clinical ratings remain separate and optional; acknowledgement does not fabricate an evaluation.
- Excluded isolated `.next-*` output from root TypeScript checks and preserved all required thumbnail provenance sources for fresh checkouts.

## Executed verification

| Check | Final result |
| --- | --- |
| Full unit suite, serial worker | **2,279 passed; 149 skipped; 0 failed** — 189 files passed, 19 skipped |
| Separate Firebase emulator suites | **138 passed; 0 failed** across 19 suites, no skipped tests in that run |
| Root `npx tsc --noEmit` | Passed |
| Isolated application TypeScript check | Passed |
| Full ESLint | 0 errors; 6 existing warnings in evidence scripts |
| Production build with all canonical flags enabled | Passed using fake emulator configuration |
| Unified production browser integration | 8 checks passed, 19 Control routes, 6 new game lifecycles; 0 Control/Display page errors |
| Branch ancestry, diff whitespace, staged asset/secret review | Passed |

The browser test used independent Control and Display contexts and real shared Firebase publishing, history and visit paths on an isolated loopback demo project. It verified authenticated readiness, 19 unique cards, all 19 Control routes with fresh fixtures, calibration delivery, six games' pause/reload/resume, immutable save-once results, parent visit linkage, acknowledged evaluation recovery, parent visit completion and patient history. This is lifecycle integration coverage, not a fresh visual review of every stage of every game. Nine-stage engine/history/security coverage also runs in the unit and rules suites. Earlier per-game browser reports remain historical evidence and are not counted as new execution here.

Initial failed runs were resolved and rerun: sandbox loopback access, stale/absent demo fixtures, shared rule conflicts, the zero-target history case, evaluation recovery and browser selectors. The full Display-registry test imports all renderers; its default 5-second cold-import limit failed under concurrent build/browser load, so that specific test uses a 20-second limit. The final complete unit run passed.

## Firebase release candidate

The authoritative files are:

- `database.rules.json`
- `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`

They are byte-identical, 288,772 bytes, with SHA-256:

`b52b8442b808df4df9e38b1ac0279ab6c4d615df942058bea0ec37cb6fb4d5ff`

The merged candidate includes clinical visit lifecycle/claims, all existing games, Castle Legends, Balance Bridge, Turn & Go, Foot Maze, Rhythm Steps, Body Sequence and the calibration command. Emulator coverage includes accepted real results, denied unauthorized/anonymous writes and patient reads, immutable history, invalid metrics/ownership, legacy records, all six parent visit references and strict calibration payloads. Per-game candidate files and patch scripts document earlier phases; **do not publish an individual game's historical candidate in place of the unified file**.

The owner confirms that the new production rules have **not** been published. The current production rules cannot be treated as compatible with the newly integrated clinical paths and game results. This remains the release blocker: review and publish the exact unified candidate through the separately authorized rules process, then authorize the final push. No production data migration or deletion is required by this integration. Actual production Console acceptance and post-publication operation have not been tested.

## Production and physical status

Software integration is ready for owner review and production rules publication, followed by an explicitly approved push. It is not currently released. The test build enables all 19 games; production flags/environment settings were not inspected or modified, and optional new floor games retain explicit opt-in behavior. Castle and clinical workflows require the new permissions before release. Repository inspection did not expose a Vercel linkage configuration; no Vercel deployment was triggered or observed. The final push must still include a fresh remote-state check and assessment of any Git-triggered deployment.

Physical Bluetooth/WT901 foot pairing, reconnect behavior on intended devices, real projector alignment and distances, audible speech, intended tablet/browser performance and clinical acceptance remain unverified. No automatic child position, pressure, balance or movement acceptance is claimed. Actual Vercel/Firebase rollout and device acceptance remain outside this local integration phase.

Reproduction instructions and machine-readable evidence are in `README.md` and `evidence/{validation,browser}.json`. Local validation logs are intentionally ignored rather than committed.
