# Castle Legends implementation plan

Native game ID: `shumos-castle-legends-3d`. Reuse Three.js, `useLiveGameController`, `LiveRecordPublisher`, controller ownership/recovery, the canonical `/liveSession`, Display resolution and `saveSessionHistoryOnce`.

1. Audit canonical registries, launch adapter, Mirror/Runner/Space/Build/Bloom implementations, shared session/history schemas, physical-input limits and existing dirty files.
2. Implement a pure therapist-authoritative state machine with automatic travel, encounter stops, nonpunitive manual confirmation, assisted/skipped attempts, nine differentiated stages and recoverable checkpoints.
3. Render original procedural worlds, articulated hero/guardian models, exercise instructor, attack/defeat effects and Arabic presentation using existing Three.js.
4. Add dedicated Control, Display and game data directories; make small additive registry/history/analytics/audio integrations. Do not change unrelated sensor work.
5. Prepare a separate Firebase rules review candidate, never alter/deploy active rules. Test it only in an isolated `demo-castle` emulator.
6. Test curriculum, invariants, save-once, real separate-browser Control/Display, reload, rendering and production build. Capture gameplay and report limitations honestly.

Isolation: existing dirty workspace retained; dedicated development port 3387, Auth/RTDB emulator ports 19922/19921, build directories `.next-castle` and `.next-castle-prod`. No branches, commits, push or deployment. The added TypeScript override and ignored isolated outputs avoid stale route validators and Tailwind scanning generated bundles.
