import type { GameDefinition, GameId } from "@/lib/games/registry";
export type ActivitySkill = "balance" | "feet" | "reaching" | "coordination" | "planning";
export const SKILL_LABELS: Record<ActivitySkill, string> = {
  planning: "التخطيط الحركي",
  balance: "التوازن والثبات",
  feet: "حركة القدمين والمشي",
  reaching: "حركة اليدين والوصول",
  coordination: "التناسق بين الأطراف",
};
/** Categories describe intended participation, not validated treatment effectiveness. Sensor membership never assigns a skill. */
const SKILLS: Partial<Record<GameId, readonly ActivitySkill[]>> = {
  "balloon-quest": ["reaching"],
  "follow-the-footsteps": ["feet"],
  "color-chase": ["feet"],
  "bubble-pop-wall": ["reaching"],
  "mirror-quest-3d": ["reaching", "coordination"],
  "safe-hex-arena-3d": ["feet", "balance"],
  "runner-quest-3d": ["feet"],
  "space-pilot": ["reaching"],
  "build-quest-3d": ["reaching"],
  "blooming-world-3d": ["reaching"],
  "harvest-valley-3d": ["reaching"],
  "fire-rescue-3d": ["coordination"],
  "pearl-voyage-3d": ["coordination"],
  "shumos-castle-legends-3d": ["feet", "reaching", "coordination"],
};
/** New registry entries may provide typed tags directly; unspecified activities remain honestly unclassified. */
export function gameSkillTags(
  game: GameDefinition & { activitySkills?: readonly ActivitySkill[] },
): readonly string[] {
  return (game.activitySkills ?? SKILLS[game.id] ?? []).map(
    (k) => SKILL_LABELS[k],
  );
}
