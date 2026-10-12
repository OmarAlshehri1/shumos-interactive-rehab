/** Library registration; optional hardware remains pending physical validation. */
export const BUILD_QUEST_REGISTRATION = {
  id: "build-quest-3d",
  nameAr: "عالم البناء",
  nameEn: "Build Quest 3D",
  shortDescriptionAr:
    "يبني الطفل قطعة بعد قطعة بالتحكم اليدوي، مع شاشة طفل على جهاز آخر. الحساس ووحدة التحكم بانتظار الاختبار الفعلي.",
  focusTagsAr: ["تناسق بصري حركي", "اختيار وبناء", "العتاد بانتظار التحقق"],
  status: "ready",
  surfaceType: "WALL",
  route: "/control/build-quest-3d",
  displayRoute: "/display/build-quest-3d",
  sensorCompatible: true,
  supportedInputs: [
    "RIGHT_HAND final normalized pointer",
    "manual touch / mouse / keyboard; always available",
    "simulated standard Gamepad; physical compatibility pending",
  ],
} as const;
export function buildQuestAvailable(
  environment: string | undefined,
  flag: string | undefined,
): boolean {
  return environment === "development" ? flag !== "false" : environment === "production" && flag === "true";
}
/** Rollback: set false and restart/rebuild. Production requires explicit true at build time. */
export const BUILD_QUEST_3D_ENABLED = buildQuestAvailable(
  process.env.NODE_ENV,
  process.env.NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED,
);

export function isBuildQuestControl(pathname: string | null): boolean {
  return pathname === BUILD_QUEST_REGISTRATION.route;
}
