# Space Pilot fresh-start readiness fix

Base: `f24dccf`. Local verification on 22 October 2026; no deployment.

The shared START_ZONE visibility gate prevented Space Pilot's renderer from mounting. Its authoritative Control requires a visible Display's actual rendered-frame acknowledgement before accepting Start, so neither side could advance.

The Display now mounts only a validated, authorized Space Pilot ready checkpoint behind the existing Shumos waiting screen. The preparation layer is invisible, inert and excluded from accessibility navigation. The same renderer remains mounted when the therapist presses Start. The shared gameplay visibility gate, authority checks, rendered-frame acknowledgement logic, Firebase rules and authentication are unchanged. Other engines and legacy Space Pilot do not receive this preparation exception.

Verification used local Auth/Database emulators, unchanged rules and synthetic records:

- Separate Chrome browser contexts for Control and Display; staff approval and distinct anonymous Display identity verified. An unapproved third context could not mount preparation.
- Start disabled before a rendered Display is ready. Actual readiness observed **1,018 ms** after opening the authenticated Display in the final local dev run (one measured sample, not a production timing guarantee).
- Before Start, the waiting screen stayed visible and no game canvas was visible; simulation time, ship pose and scores remained unchanged.
- Explicit Start entered running in both contexts without replacing the prepared canvas.
- Pause froze time; Resume synchronized both contexts through the existing readiness gate.
- Safe End with repeated clicks created exactly one synthetic history record. Control reload did not duplicate or rewrite it.
- No browser runtime errors or application-owned native dialogs in the final flow.
- **15 focused tests passed:** four new preparation regressions, seven existing shared-presentation tests, and four selected authority readiness/pause/end/renderer-loss tests. TypeScript and scoped ESLint passed. No full gameplay suites or production build were run for this fix.

Game engines, curricula, controls, history schemas, patient data and production configuration are untouched. Physical devices and production behavior still require owner verification after an approved release.
