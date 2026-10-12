/**
 * Library registration for Runner Quest 3D (the single canonical `runner-quest-3d` card). lib/games/registry.ts imports this
 * manifest; `surfaceType: "BOTH"` is backed by two real projections (WALL lane runner, FLOOR top-down journey) that the
 * therapist picks before a session starts.
 */
import { GAME_NAME_AR, GAME_NAME_EN } from "./arabic";

export const RUNNER_QUEST_3D_GAME_ID = "runner-quest-3d" as const;

export const RUNNER_QUEST_3D_REGISTRATION = {
  id: RUNNER_QUEST_3D_GAME_ID,
  nameAr: GAME_NAME_AR,
  nameEn: GAME_NAME_EN,
  shortDescriptionAr: "رحلة العدّاء على الجدار بين ثلاثة مسارات، أو على الأرض من الأعلى بمناطق كبيرة يؤكدها المعالج. بلا قفز ولا وقت محدد. حسّاسات القدم الفعلية قيد التحقق.",
  focusTagsAr: ["اتجاهات وتنقّل", "حركة القدمين"],
  status: "ready",
  surfaceType: "BOTH",
  route: "/control/runner-quest-3d",
  displayRoute: "/display/runner-quest-3d",
  sensorCompatible: false,
  supportedInputs: ["KEYBOARD (simulation)", "RIGHT_FOOT / LEFT_FOOT / DUAL_FOOT — simulated only; physical WT901 foot sensors pending validation"],
  physicalFootSensorsValidated: false,
} as const;
