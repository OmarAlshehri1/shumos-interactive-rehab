# Premium therapist Control rollout

Local UX rollout based on the approved Castle design (`c80f6b9`). No deployment or Firebase rule changes are included.

## Coverage

All 22 canonical setup routes use the shared Arabic-first setup frame, essential settings, additional-options disclosure, readable controls and existing native difficulty/stage choices. No curriculum or stage availability changes. The three reward games retain exactly three levels without subordinate stages.

| Game / route | Active preview |
| --- | --- |
| Balance Bridge / `balance-bridge-3d` | Existing moving readonly renderer |
| Castle Legends / `shumos-castle-legends-3d` | Existing moving readonly renderer |
| Harvest Valley / `harvest-valley-3d` | Existing moving readonly renderer |
| Blooming World / `blooming-world-3d` | Existing moving readonly renderer |
| Fire Rescue / `fire-rescue-3d` | Existing moving readonly renderer; native preview opt-out retained |
| Pearl Voyage / `pearl-voyage-3d` | Existing moving readonly renderer; native preview opt-out retained |
| Mirror Quest / `mirror-quest-3d` | Existing moving readonly renderer |
| Safe Hex Arena / `safe-hex-arena-3d` | Reused native readonly view |
| Turn and Go / `turn-and-go-3d` | Reused native readonly view |
| Foot Maze / `foot-maze-3d` | Reused native readonly view |
| Rhythm Steps / `rhythm-steps-3d` | Reused native readonly view |
| Body Sequence / `body-sequence-3d` | Reused native readonly view |
| Achievement Forest / `achievement-forest-3d` | Reused native readonly view |
| Achievement City / `achievement-city-3d` | Reused native readonly view |
| Ocean Wonders / `ocean-wonders-3d` | Reused native readonly view |
| Balloon Quest / `balloon-quest` | Existing native interactive preview |
| Follow the Footsteps / `follow-the-footsteps` | Reused native readonly view |
| Bubble Pop Wall / `bubble-pop-wall` | Reused native readonly view |
| Space Pilot / `space-pilot` | Honest representative image with native status and manual flight controls |
| Color Chase / `color-chase` | Reused native readonly view |
| Runner Quest / `runner-quest-3d` | Existing synchronized floor map in floor mode; representative image otherwise |
| Build Quest / `build-quest-3d` | Existing native interactive workshop preview |

Twenty games support moving previews using existing views and controller state. These are local renderings, not captured video of the remote Display. Space Pilot's Display wrapper performs acknowledgements and is deliberately not reused as a Control preview. Runner keeps its existing state-based floor preview. No new streaming, authority, scoring, database listeners or writes were introduced for previews. Added readonly previews are silent; existing Control audio and physical-input handlers are retained.

## Shared implementation

`ControlGameFrame`, `GameSetupLayout`, existing therapist surface/disclosure components and progressive setup cards remain the common foundation. `ControlWorkspace` adds UI-only targets for preview, native assistance, settings, session controls and dialogs. `ControlSlot` moves original JSX with its original values, handlers, bounds and disabled conditions, including disabled state inherited from native fieldsets. The native controller remains mounted through Start/End. End-reason, ownership and safety dialogs remain accessible outside closed additional-options disclosures.

During play, the large setup header stays hidden. The compact Arabic header shows actual native difficulty/stage, activity status, available cumulative native time and relevant patient/visit context. The preview appears on the right with native assistance immediately underneath; the left panel contains native session controls and two to four existing essential fields. Paused-only settings keep their native restrictions. Additional native options remain in a disclosure. On portrait tablets, the layout stacks and session/safety controls remain fixed within reach.

## Verification

- 19 focused tests passed across shared progressive setup, three-level rewards, workspace lifecycle presentation and setup-preview cleanup.
- All 22 canonical setup routes passed real Chrome smoke checks against isolated Auth/Realtime Database emulators with synthetic staff/session data. Three reward games each had exactly three levels and no subordinate stages. No horizontal overflow or browser runtime errors.
- Nine representative Castle browser checks passed: unchanged session identity; compact first-viewport laptop layout; navigation guard; repeat/skip/assisted confirmation; Display pause synchronization; native paused settings; tablet landscape and portrait; resume/confirm/safe end; preserved attempts/results and no duplicate controller/canvas.
- Source contract audit passed across 32 native controller/settings files: original action/input handlers, disabled props, values and bounds match `c80f6b9`.
- TypeScript, scoped ESLint and the production build passed (83 pages generated). The subsequent label-container and defensive payload-reading corrections passed focused tests, scoped ESLint and TypeScript; the label correction also passed a Chrome smoke check and the native contract audit.
- Engines, hooks, curricula, history schemas, Display code, Firebase rules and YouTube implementation are unchanged.

## Screenshots

All images show synthetic local emulator sessions. Existing Next development overlays were hidden only in the capture browser.

- [Compact laptop workspace](screenshots/castle-laptop.png)
- [Portrait tablet workspace](screenshots/castle-tablet.png)
- [Harvest setup](screenshots/harvest-setup.png)
- [Three-level reward setup](screenshots/forest-setup.png)

## Limits

Only Castle received a complete representative native gameplay flow in this rollout; the other 21 routes received setup smoke checks and source contract review, not full gameplay suites. Tablet checks use browser viewport emulation, not physical iPad hardware. Moving 3D previews consume an additional rendering context/GPU budget but do not create another authoritative game engine. Preview artwork reuses real existing stage/level images where available; other existing game screenshots remain labeled representative rather than inventing stage-specific captures. Untagged legacy rollback controllers retain their native UI.

Patient history, production data and environment variables were not accessed or changed. Nothing was pushed or deployed.
