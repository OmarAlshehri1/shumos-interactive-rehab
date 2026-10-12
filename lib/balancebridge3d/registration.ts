export const BALANCE_BRIDGE_ENABLED =
  process.env.NODE_ENV === "development"
    ? process.env.NEXT_PUBLIC_BALANCE_BRIDGE_3D !== "false"
    : process.env.NEXT_PUBLIC_BALANCE_BRIDGE_3D === "true";
export const BALANCE_BRIDGE_REGISTRATION = {
  id: "balance-bridge-3d",
  nameAr: "الجسر المتوازن",
  nameEn: "Balance Bridge",
  shortDescriptionAr:
    "تسع رحلات أرضية سحرية للمشي واتباع العلامات، بتأكيد المعالج ومساعدة قابلة للتعديل.",
  focusTagsAr: ["اتباع المسار", "خطوات وثبات"],
  activitySkills: ["balance", "feet"],
  status: "ready",
  surfaceType: "FLOOR",
  route: "/control/balance-bridge-3d",
  sensorCompatible: false,
} as const;
