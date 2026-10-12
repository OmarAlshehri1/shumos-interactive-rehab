/**
 * Availability / rollback switch for the integrated Runner Quest 3D routes
 * (/control/runner-quest-3d, /display/runner-quest-3d) and its library card.
 *
 *  - development : available unless NEXT_PUBLIC_RUNNER_QUEST_3D=0
 *  - production  : OFF unless NEXT_PUBLIC_RUNNER_QUEST_3D=1 was set at build time
 *
 * Unsetting/zeroing the flag and rebuilding removes the card and makes both routes 404;
 * no other game is affected. The experimental /…-prototype routes stay development-only.
 */
export function runnerQuestAvailable(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv === "development" ? flag !== "0" : flag === "1";
}
export const RUNNER_QUEST_3D_ENABLED = runnerQuestAvailable(process.env.NODE_ENV, process.env.NEXT_PUBLIC_RUNNER_QUEST_3D);
