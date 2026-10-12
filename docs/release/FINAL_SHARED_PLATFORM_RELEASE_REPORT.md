# Shumos Care — final shared-platform release report (2026-10-10)

Written for: the project owner, ahead of the batch push and Vercel deployment. **Nothing was committed, pushed or deployed, and no Firebase rules were published.** All Firebase testing used local emulators (demo project, loopback only); `.env.local` was never copied into any build or server. Supersedes the security statements in `UNIFIED_GAME_ARCHITECTURE_REPORT.md` §8 (the "patient identity in anonymous-readable data" row).

## Verdict
All software and security gates below passed. Items that remain open are listed in §10; none is a software blocker. The one thing that is **not** closed is that the child's first name is still readable by the anonymous Display (it is needed to speak and show the name) — see §1.

## 1. Security fixes
| Finding | Before | Now |
|---|---|---|
| **Patient identifier readable by the anonymous Display.** `liveSession.patientId` (the opaque patient key) sat in the record every anonymous client can read. | exposed | **Fixed.** The binding moved to a new staff-only node `liveSessionPrivate/{sessionId, patientId, updatedAt}`. It is written in the *same atomic multi-location update* as the live record, so the two cannot diverge. The rules now reject any `patientId` inside `liveSession`, and the repository scrubs the field from records written by older clients. The Display app never reads the new node. |
| Stale binding race (new record seen with old binding) | n/a | Staff subscriptions combine both nodes and coalesce to one emission; a binding from another session is ignored; a failing binding read is treated as walk-in and never hides the live record. A one-shot `get()` that resolves after the listener's first event is dropped (it is older data). |
| `presence/display` shape | any signed-in user, `connected` required | unchanged (see §10, accepted) |
| **Child first name** | anonymous-readable | **Not removable without breaking the product:** the Display speaks and shows it (`audio.prefetchForSession(childFirstName)`). It is a first name only (≤ 30 chars), no surname, no patient number, and it can no longer be linked to a patient record by anyone without staff access. Residual risk and options in §10. |

Contract change (small, backward compatible for readers): `publishSession`/`clearLiveSession`/`subscribeToLiveSession`/`fetchLiveSession` keep their signatures; every caller (all games' controllers and the Display) is unchanged. Records or bindings written before the change still parse (legacy in-record `patientId` is honoured when no binding exists). **No new per-game tree** was added; the new node is game-agnostic.

Verified already present and re-tested (not changed): staff-only authoritative writes; strictly increasing revisions (stale **and** duplicate rejected); create-only history with creator = caller, existing patient, strict per-game shape, only the creating therapist may edit the note; no wildcard (unknown top-level nodes are unreadable/unwritable); controller lease takeover rules.

## 2. Exact files changed in this pass
Product code / rules:
* `lib/realtime/sessionRepository.ts` — atomic publish/clear across both nodes; staff-side merge, coalescing, stale-`get()` guard; Display handle never reads the binding.
* `database.rules.json` — `liveSession/patientId` must be absent; new `liveSessionPrivate` node (staff read/write, strict shape, no extra fields).
* `docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` — byte copy of the above.

Tests (updated to the new contract, equivalent assertions; none removed or weakened):
* `lib/realtime/__tests__/sessionRepository.test.ts` (+4 tests: binding kept out of the record, staff merge, same-session only, failing read, Display never reads it, coalescing), `bq3LiveRecord.test.ts`.
* `lib/{balloonquest,buildquest3d,spacepilot3d,runnerquest3d}/__tests__/rules.emulator.test.ts` — live records no longer carry `patientId` (the rules now forbid it); Space Pilot's suite takes `SP_DB_PORT` (default unchanged, 19200) so it no longer has to share another process's emulator.
* **New** `lib/realtime/__tests__/platformRules.emulator.test.ts` — 12 rules tests (below).
* Browser harnesses: `docs/release/validation/legacy-smoke.mjs` (reads the binding from the private node), **new** `docs/release/validation/legacy-history.mjs`, `docs/runnerquest3d/validation/e2e-cross-full.mjs`, `docs/balloonquest3d/validation/b6/e2e-prod.mjs`, `docs/buildquest3d/validation/production-cross-device.mjs` (it read the history key from a URL parameter that the unified design no longer sets; it now lists the patient's history and asserts exactly one row).
* Evidence: `docs/release/evidence/final-pass/*`.

## 3. Shared architecture confirmation
Reviewed the code, not just the report. Every `liveSession` read/write in the app goes through `lib/realtime/sessionRepository.ts` (no other file references the path). Build Quest, Space Pilot 3D, Balloon Quest and Runner Quest publish into the same record, use the same lease/presence, the same `sessions/{patient}/{id}` history and the same staff login; Balloon Quest 3D replaces the original at `/control/balloon-quest` and Space Pilot 3D at `/control/space-pilot`, with documented rollback routes (`/control/balloon-quest-legacy`, `/control/space-pilot-legacy`). No new Firebase tree for any game, no separate ownership, history or auth flow. The two documented Space Pilot exceptions (`spacePilot3d/presence`, `spacePilot3d/sensor`) are unchanged and still anchored to the live record. A new game follows `UNIFIED_GAME_ARCHITECTURE_REPORT.md` §15; the patient binding is now handled for it automatically by the repository.

## 4. Test results
| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint, whole repo | 0 errors, 0 warnings |
| Vitest, full repo | 137 files passed (4 opt-in emulator suites skipped); **1,769 tests passed**, 33 skipped |
| Firebase Auth + RTDB emulator, final rules | **34/34**: new platform suite 12, Balloon 4, Build 6, Space Pilot 5, Runner 7 |
| Production build, all four flags on | succeeds (Turbopack); 8 library cards |
| Production build, flags off | succeeds; 6 library cards; Build/Runner/Space-3D Displays 404; their Controls render the 404 page; prototype routes 404 |

Emulator platform suite (`PLATFORM_RULES_EMULATOR=1`): active staff may publish; inactive staff, non-staff, anonymous and signed-out may not; every one of the 8 registered game ids publishes, an unregistered id is refused; stale and duplicate revisions, malformed records and over-long names refused; anonymous Display reads the record but cannot write (PUT or PATCH) and the record contains no patient id (a staff write that tries to add one is refused); `liveSessionPrivate`, `patients`, `patientNumbers`, `sessions`, `staff`, `controllerLease`, `presence/controller` and the database root are unreadable by anonymous, inactive and non-staff users, and the binding is unwritable by them; the atomic record + binding update works for staff and is refused to everyone else, a stale revision rejects the whole update including the binding; lease owner refresh, second-staff block, forged owner refused, stale-lease takeover, inactive/anonymous refused; Display may write only a shape-valid `presence/display`; history for **each of the six legacy games** is create-only (anonymous/inactive/forged creator/wrong patient/wrong id/unknown field denied; overwrite, delete and patch denied, also by another staff member); note edits only by the creator; patient number immutable and unique; unknown top-level nodes denied.

## 5. Browser validation (production build, `next start`, Firebase emulators)
Method: Control = iPad-sized touch Chrome profile, Display = separate Chrome profile (anonymous), real staff login, patient selected. **Not a physical iPad/projector.** Dev server (`next dev`, port 3101) only where the suite needs the sensor simulator, which is hidden in production builds.

| Game | Suite | Result |
|---|---|---|
| Runner Quest 3D | production flow | 18/18 |
| | nine stages by touch, latency (dev) | 17/17 |
| | workflow: sensor loss/manual, reloads, stale commands, staff authorization, history (dev) | 41/41 |
| Balloon Quest 3D | production: nine stages by therapist taps, Display agreement, history | 15/15 |
| | production: floor layout, pause/resume/restart/skip, Display reload, end sheet, leave mid-session | 19/19 |
| | production: reload recovery (moving, paused, completion, second window) | 28/28 |
| | dev (sensor simulator): manual fallback after sensor loss 11/11; sensor loss + Control reload 11/11; RIGHT_HAND simulated + manual priority 10/10; recovery incl. 5 s offline, Display reload, Control reload 10/10 | all pass |
| Build Quest 3D | production: library card, touch, history validators, denied-history retry, save-once | pass (3 checks) |
| | cross-device: nine stages, 150 ms latency, reloads, RIGHT_HAND sim, sensor loss, handheld, offline, history, second window | pass |
| Space Pilot 3D | cross-device: touch steering, nine mode × difficulty configs, three missions / 15 rings, relay with clock skew, Control + Display reload, offline, walk-in (no binding, no history) | pass |
| Build + Space | window take-over / blocked / stood-down, Display follows, no history from hand-over | 12/12 |
| Original six | library lists all games exactly once; each game started from its own Control publishes into the shared record (binding in the private node, none in the record) and renders on the Display | 14/14 |
| Original six | **new:** each game started for a patient, advanced to a stage, ended early from the Control; exactly one history row for that patient, still one after settling | 13/13 |

Coverage per requirement: manual stage completion without sensors — Balloon (nine stages), Runner (nine), Build (nine), Space (three missions, 15 rings); touch controls, Display sync, pause/resume/restart, Control and Display reload recovery, sensor-loss manual fallback, history save-once and staff authorization are covered by the suites above for the four new games. **Gap, stated plainly:** the original six games were *not* played through all stages in this pass (they are unmodified code); they were started, synchronised to a Display, advanced a stage, ended early with history saved once, and covered by the rules suite. Also not re-run: 60-minute soak, real WAN, real hardware.

Library check (`libcheck`): flags on → balloon-quest, footsteps, color-chase, bubble-pop, feed-animals, space-pilot, runner-quest-3d, build-quest-3d (each name appears once; **no duplicate Balloon Quest or Space Pilot**); flags off → the original six only.

## 6. Routes
Shipped routes that are not in the game library: `/control/{balloon-quest-legacy, space-pilot-legacy}` (documented rollbacks); development prototypes (`*-prototype`, `balloon-quest-visual-preview`) are `notFound()` outside development; Build/Runner/Space-3D routes are flag-gated. **Ungated but staff-only and unlinked** (behind the staff login in `/control/layout.tsx`, no navigation entry): `sensor-hand-demo`, `sensor-setup-prototype`, `right-hand-twist-invariance`, `right-hand-final-session`, `left-hand-enrollment-session`, and the four `*-sensor-play` / `right-hand-balloon-play` pages. They are hardware-validation tools from the WT901 work; I left them because you need them for the hardware tests. Gating them with `notFound()` in production is a one-line change per page if you want them off for the clinic.

## 7. Rules file
`docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` is identical (`cmp`) to `database.rules.json`: **SHA-256 `a938b716b53f7e7e8ef9b066f8998b2583a89282945d1cf1905ab826c4bea940`**, 26,185 bytes, valid JSON. The production build and all emulator runs used exactly this file. Re-check the hash before publishing: `shasum -a 256 database.rules.json docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json`.

## 8. Required Vercel environment (Production)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED` | `true` |
| `NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED` | `true` |
| `NEXT_PUBLIC_RUNNER_QUEST_3D` | `1` |
| `NEXT_PUBLIC_BALLOON_QUEST_LEGACY` | unset (set `1` only to roll Balloon Quest back) |
| `NEXT_PUBLIC_FIREBASE_*` (7 real values), existing Munsit/TTS variables | as today |
| `NEXT_PUBLIC_FIREBASE_EMULATOR_*` | **must not exist** |

`NEXT_PUBLIC_*` values are inlined at build time: changing them requires a new deployment.

## 9. Deployment procedure (nothing below has been run)
**Order matters.** The new app writes `liveSessionPrivate`, which the old rules reject; the old app writes `liveSession/patientId`, which the new rules reject. So publish the rules and ship the app **in one maintenance window with no session running**: flags, then rules, then push, then test straight away.
1. **Back up the live rules.** Firebase Console → Realtime Database → Rules → copy everything into `docs/release/backup/LIVE_RULES_<date>.json` (outside git history if you prefer) and note the time. Also export current data if you want a belt-and-braces copy (Database → ⋮ → Export JSON); no data migration is needed either way.
2. **Compare.** `diff <(python3 -m json.tool LIVE_RULES_<date>.json) <(python3 -m json.tool database.rules.json)`. The expected differences: the `liveSessionPrivate` node, `patientId` forbidden in `liveSession`, the Space Pilot `spacePilot3d` presence/sensor nodes, the Build/Runner game ids and history shapes. Anything else in the live file that is not in yours means someone edited the console — resolve before publishing.
3. **Check the file.** Hash matches §7; `git status` shows the tree you tested.
4. **Set the Vercel flags** (§8) on Production; confirm no `FIREBASE_EMULATOR` variables.
5. **Publish the rules** (Console → Rules → paste `FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json` → Publish). From this moment the *old* app cannot start sessions, so do steps 5–7 back to back.
6. **Commit and push** the stable tree (review `git status` first: this working tree has many untracked files that must all be added — `app/…`, `lib/liveGame/`, `lib/buildquest3d/`, `lib/runnerquest3d/`, `lib/spacepilot3d/`, `components/…`, `docs/…`; do not add `.env.local`). Vercel builds on push.
7. **Confirm the Vercel deployment** is Ready on the production domain; open `/control/activities` and check the library shows 8 cards.
8. **Live test (use a test patient):** (a) Control on the iPad, Display on the projector laptop; start Balloon Quest, play a stage, pause/resume, reload the Control, reload the Display; end early and confirm one history row in the patient page. (b) Repeat briefly for Build Quest, Runner Quest and Space Pilot; start one original game (e.g. Color Chase). (c) In the Firebase Console Data tab confirm `liveSession` has **no `patientId`** while a patient session runs, and `liveSessionPrivate` does. (d) Open the Display in a signed-out/private browser and confirm it follows; confirm it cannot read `/patients`.
9. **Rollback (if any step 7–8 check fails):** (i) Vercel → Deployments → previous production deployment → *Promote / Instant rollback*; (ii) Console → Rules → paste the backup from step 1 → Publish. Rules and app must be rolled back **together** as a pair (old app + old rules, or new app + new rules). History in `sessions/` and patients are never touched by either version, so there is nothing to migrate or delete; stale `liveSession` / `liveSessionPrivate` data can be deleted in the Console (it is ephemeral). To disable only one new game, unset its flag and redeploy (rules can stay); to revert only Balloon Quest, set `NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1`.
10. Keep the backup file and the pre-deploy Vercel deployment until a full clinic day has passed.

## 10. Remaining items and risks
**Software blockers: none.**

Accepted / for your decision:
1. **Child first name is anonymous-readable** (needed by the Display). Anyone who has the public Firebase web config can sign in anonymously and read the live record while a session runs: a first name, game state and nothing that identifies a patient record. To close it later: Firebase **App Check** with reCAPTCHA on the Display app, and/or a Display pairing code that the Control writes and the rules compare. Not done: it changes the Display start-up flow, which you asked me not to redesign.
2. **Ownership of `liveSession` is client-enforced** (window id, heartbeat, explicit take-over), as in the original six games; the server enforces the controller *lease* and staff-only writes, not "this window owns the live record". Any active staff member can overwrite another's live session with a higher revision. Acceptable under the trusted-staff model; covered by browser tests (blocked / take-over / stood-down).
3. `presence/display` is writable and readable by any signed-in client (contents: connection, fullscreen, audio flags, pointer); anyone with the web config could spoof Display presence. No patient data.
4. Ungated staff-only hardware routes (§6).
5. Real-project check: the emulator accepts the multi-location `update` at the database root; the real service evaluates the same rules, but step 8(c) is the first time it runs against the real project — keep the rollback ready.

Physical tests still pending (software cannot cover): real iPad touch (all games), projector laptop with real Display audio/fullscreen, WT901 RIGHT_HAND with Balloon, Build, Runner and the Space Pilot sensor laptop, real network latency and iPad Safari on mobile data, Munsit TTS with real credentials.

Operational note: during this pass I started my own emulators (ports 9000/9099 and 19000/19099) and scratch builds under the session scratchpad; I did not touch the other agent's emulator (19200) or dev server (3000). My emulators and servers on those ports are still running and can be stopped by port.
