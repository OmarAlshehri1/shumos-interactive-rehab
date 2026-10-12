# Local game-library integration — staged, tested, **not yet applied** to the shared files

**Why it is staged and not applied.** `lib/games/registry.ts` and `components/control/library/gameThumbnails.tsx` are among the ~36 uncommitted shared files in this working tree, and **another agent (Build Quest 3D) was actively editing this tree while this work ran** (its own `LOCAL_INTEGRATION_CONFLICT.md` also defers its registration for the same reason). A bad edit in those files would also break the other agent's running dev server on `:3000`. The brief says to defer rather than overwrite, so the integration is delivered as a verified patch.

## What is already in place (new files only, nothing shared touched)
| Piece | File |
|---|---|
| Integrated Control route (library card target) | `app/control/runner-quest-3d/page.tsx` |
| Integrated Display route | `app/display/runner-quest-3d/page.tsx` |
| Feature flag / rollback | `lib/runnerquest3d/availability.ts` |
| Registration manifest (names, id, routes, inputs, `physicalFootSensorsValidated: false`) | `lib/runnerquest3d/registration.ts` |
| Library thumbnail | `components/control/runnerquest3d/RunnerQuestThumbnail.tsx` |
| Staff authentication | inherited unchanged from `app/control/layout.tsx` (`StaffAuthGate`) |

Both routes return **404 unless the flag is on** (`NODE_ENV=development` and not `NEXT_PUBLIC_RUNNER_QUEST_3D=0`, or a build made with `NEXT_PUBLIC_RUNNER_QUEST_3D=1`). The `-prototype` routes remain development-only.

## The patch (`LOCAL_INTEGRATION.patch`, 2 files, +20 lines)
```bash
git apply --check docs/runnerquest3d/LOCAL_INTEGRATION.patch   # passes against the current dirty tree
git apply docs/runnerquest3d/LOCAL_INTEGRATION.patch
```
* `lib/games/registry.ts`: adds `export type LocalGameId = "runner-quest-3d"`, widens `GameDefinition.id` to `GameId | LocalGameId`, and appends **one** entry, only when the flag is on (no duplicates).
* `components/control/library/gameThumbnails.tsx`: maps the new id to the thumbnail.

**Deliberately not done: widening `GameId`.** The first attempt added the id to `GameId`; `tsc` then failed in `lib/audio/AudioManager.ts` (exhaustive switch) and `lib/audio/__tests__/prefetchLines.test.ts` (`Record<GameId,…>`), i.e. it would have forced edits to the audio manager and the production Display dispatcher. `GameId` is what realtime Firebase sessions switch on; Runner Quest is local-only and never creates a session record, so it is kept out of that union. `components/display/gameDisplayRegistry.tsx` therefore needs no change.

## Verified on a scratch copy with the patch applied (never on the real tree)
* `tsc`: clean (only the pre-existing generated-types `LayoutProps` message that `next build` itself resolves).
* `next build` with `NEXT_PUBLIC_RUNNER_QUEST_3D=1`: succeeds; `next start`: library lists the card (screenshot `screenshots/r5-library-card.png`), the card opens `/control/runner-quest-3d`, `/display/runner-quest-3d` renders, `*-prototype` → 404, existing routes unchanged. Browser run: `validation/prod.mjs` 9/9 (no dev diagnostics, only `127.0.0.1` requests, nothing to Firebase, 60 fps).
* Rebuilt **without** the flag: `/control/runner-quest-3d` and `/display/runner-quest-3d` → 404, no card in the library, `/control`, `/display`, space-pilot, balloon-quest, color-chase → 200.

## Rollback
Unset (or set `0`) `NEXT_PUBLIC_RUNNER_QUEST_3D` and rebuild: card and both routes disappear; no other game is affected. To remove entirely: `git apply -R docs/runnerquest3d/LOCAL_INTEGRATION.patch` and delete the Runner Quest folders listed in the final report.

## Constraint that still applies after applying the patch
A Runner Quest session is **local**: Control and Display must be two windows of the **same browser profile on the same computer** (BroadcastChannel). A Display on a different device is not supported until a Firebase transport is built; it is also **not saved to patient history**.
