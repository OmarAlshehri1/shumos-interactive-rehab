# Control audio, explicit Start and live workspace corrections

Base: approved rollout `cbfbffb`. Local correction only; no push, deployment, production configuration/rule changes or production patient access.

## Confirmed causes and fixes

**Audio:** Chrome can leave `AudioContext.resume()` pending indefinitely when initiated by a Firebase callback without a real Display gesture. The homepage only remembered that the command write succeeded, with no acknowledgement correlation or timeout. General readiness reports could also overwrite the command acknowledgement. Remote activation now bounds waiting at 1,200 ms, reports the actual context state and keeps the command ID on subsequent Display reports. Control requires a matching, fresh, Display-authored running acknowledgement, shows pending/blocked/ready/failed, and ends unacknowledged pending requests after 8 seconds (observed on its existing 1.5-second UI refresh). A blocked request clearly asks for a real Display click. A write alone never establishes readiness. No new listener or polling loop, autoplay bypass, or new database path/schema was added.

**Measured local Chrome handshake:** Restrictive document-user-activation autoplay policy, real Chrome, isolated Auth/RTDB emulators, synthetic staff. Old production build remained `attempting` after **4,020 ms**, then reached ready only after a Display gesture (**4,135 ms total**). Candidate acknowledged blocked/suspended in **1,491 ms**; a real Display gesture produced a running/ready acknowledgement in **125 ms**; an already-unlocked repeat request acknowledged ready in **133 ms**. These are individual local samples observed at 100-ms intervals, not production latency or physical loudspeaker/audibility guarantees.

**Setup:** Fresh native setup updates publish a legitimate `START_ZONE` record, but Display previously resolved any record into its game component and put the introduction over the game world. The old build showed a Castle canvas during configuration before Start. The shared presentation gate now keeps unstarted setups and native `START_ZONE` preparation on the neutral waiting world; game rendering/audio selection requires actual started presentation. The session remains stored, including ownership, patient binding and unfinished progress. Existing abandoned-preview expiry and recovery behavior remain intact. Between-stage selection waits for explicit stage Start too. Engines, timers, scoring and curricula were not edited.

**Workspace:** The previous fixed-height preview box letterboxed the 16:9 composition, and native stage/progress/restart/manual actions were left inside additional options. The preview now fills a responsive 16:9 box without cropping. Shared progress/navigation targets surface original native commands and stage metadata. Previous/Next uses native selection handlers, bounds and disabled options. Existing runtime manual commands and restart are relocated with their original guards, including inherited fieldset disabled state. Two to four existing essential fields remain; native paused-only restrictions still apply. Advanced configuration is hidden during active play and available before Start/after the native safe end/save flow. Controllers remain mounted. No unsupported actions or independent game engine were introduced.

**Dialogs:** Castle's end, restart, encounter skip and takeover actions and homepage setup discard used `window.confirm()`. They now use a reusable Arabic Shumos-styled native HTML dialog with an inert background, focus trapping/restoration, Cancel initially focused, Escape handling and duplicate-submission protection. End & Save is distinct from discarding an unstarted setup. Existing native result persistence and navigation guards remain authoritative. Browser `beforeunload` handling is untouched.

## Verification

- 62 unique focused unit tests passed across eight files: AudioManager, audio request states, Display session presentation/recovery, workspace presentation, setup cleanup, shared progressive setup, reward setup and live-game ownership/persistence utilities. Two runs contain eight overlapping shared setup tests (48 + 22 - 8 unique).
- All 22 canonical setup routes passed setup-only Chrome smoke checks; rewards retained exactly three levels without subordinate stages. No full 22-game gameplay suite ran.
- Ten representative Castle checks passed with synthetic patient data: configuration remained at zero elapsed time/distance/attempts with no child canvas; explicit Start kept the same session; uncropped preview and assistance/safety fit 1366×768 and 1440×900; native assistance/repeat; paused Previous/Next preserved attempts and required stage Start; styled-dialog focus/Escape; pause/resume synchronized Display; navigation guard; End & Save cancellation and double-click yielded exactly one unchanged history record; no native dialogs/runtime errors.
- Two short Footsteps checks passed: shared Previous/Next retained running locks and native paused selections, stage labels and explicit Start, with no new events/runtime errors.
- Source audit confirmed original action/input handlers, disabled props, values and bounds across 21 non-Castle native controller files. Castle's four browser-confirm handlers were deliberately changed to styled confirmations; its native command reducers/save workflow remain unchanged.
- Scoped ESLint, TypeScript, whitespace checks and one production build passed (83 pages).
- No Firebase rule changes. Existing audio command/status enums and authorized paths are reused. Display authentication, YouTube signaling/capture, therapy visits, histories, physical-input adapters and all game engines/curricula remain unchanged.

## Limits

Browser verification uses local emulators and synthetic data, not the owner's production browser or physical audio/projector hardware. Tablet hardware was not tested in this correction. Existing Space Pilot/Runner preview fallbacks remain. Only Castle received the representative full flow; Footsteps received a short navigation spot check. Temporary browser scripts, screenshots and QA logs stay outside the commit. The four pre-existing untracked files remain untouched.

## Files changed

- `components/balancebridge3d/BridgeControl.tsx`
- `components/castlelegends3d/CastleControl.tsx`
- `components/control/achievementcity3d/AchievementCityControl.tsx`
- `components/control/achievementforest3d/AchievementForestControl.tsx`
- `components/control/balloonquest3d/BalloonQuest3DControl.tsx`
- `components/control/bloomingworld3d/BloomControl.tsx`
- `components/control/bodysequence3d/BodySequenceControl.tsx`
- `components/control/bubblepopwall3d/DomeControl.tsx`
- `components/control/buildquest3d/BuildQuestControl.tsx`
- `components/control/colorchase3d/ColorChaseControl.tsx`
- `components/control/firerescue3d/FireRescueControl.tsx`
- `components/control/footmaze3d/FootMazeControl.tsx`
- `components/control/footsteps3d/FootControl.tsx`
- `components/control/harvestvalley3d/HarvestControl.tsx`
- `components/control/home/ReadinessDashboard.tsx`
- `components/control/live/ResetLiveDisplayOnMount.tsx`
- `components/control/mirrorquest3d/MirrorControl.tsx`
- `components/control/oceanwonders3d/OceanWondersControl.tsx`
- `components/control/pearlvoyage3d/PearlVoyageControl.tsx`
- `components/control/rhythmsteps3d/RhythmControl.tsx`
- `components/control/runnerquest3d/RunnerQuest3DControl.tsx`
- `components/control/safehexarena3d/HexControl.tsx`
- `components/control/setup/ProgressiveStages.tsx`
- `components/control/spacepilot3d/SpacePilot3DControl.tsx`
- `components/control/turngo3d/TurnGoControl.tsx`
- `components/control/ui/ControlWorkspace.tsx`
- `components/control/ui/TherapistConfirmation.tsx`
- `components/control/ui/confirmation.module.css`
- `components/control/ui/workspace.module.css`
- `components/display/DisplayScreen.tsx`
- `lib/audio/AudioManager.ts`
- `lib/audio/__tests__/AudioManager.test.ts`
- `lib/control/__tests__/audioRequest.test.ts`
- `lib/control/audioRequest.ts`
- `lib/display/__tests__/sessionPresentation.test.ts`
- `lib/display/sessionPresentation.ts`
- `docs/control-start-audio-workspace-fix.md` (this report)
