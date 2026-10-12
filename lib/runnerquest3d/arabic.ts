import type { Difficulty, FloorObjective, HintKey, InputSourceId, Level3, Lifecycle, SuspendReason } from "./types";

export const GAME_NAME_AR = "مغامرة العدّاء";
export const GAME_NAME_EN = "Runner Quest 3D";

export const DIFFICULTY_AR: Record<Difficulty, string> = { easy: "سهل — تعلّم الاتجاهات", medium: "متوسط — تخطَّ العوائق", advanced: "متقدم — تحدي المغامرة" };
export const DIFFICULTY_SHORT_AR: Record<Difficulty, string> = { easy: "سهل", medium: "متوسط", advanced: "متقدم" };
export const LEVEL3_AR: Record<Level3, string> = { low: "منخفضة", normal: "عادية", high: "عالية" };
export const TOLERANCE_AR: Record<Level3, string> = { low: "ضيّق", normal: "عادي", high: "واسع" };

export const SOURCE_AR: Record<InputSourceId, string> = {
  MANUAL: "تحكم المعالج باللمس",
  KEYBOARD: "لوحة المفاتيح (محاكاة)",
  RIGHT_FOOT: "القدم اليمنى",
  LEFT_FOOT: "القدم اليسرى",
  DUAL_FOOT: "القدمان معًا",
};
export const SOURCE_NOTE_AR: Record<InputSourceId, string> = {
  MANUAL: "لا يحتاج إلى أي حسّاس. يبقى التحكم اليدوي متاحًا في كل الأوضاع.",
  KEYBOARD: "للتجربة والتطوير فقط.",
  RIGHT_FOOT: "محاكاة فقط — لم تُختبر حسّاسات القدم الفعلية بعد.",
  LEFT_FOOT: "محاكاة فقط — لم تُختبر حسّاسات القدم الفعلية بعد.",
  DUAL_FOOT: "محاكاة فقط — لم تُختبر حسّاسات القدم الفعلية بعد.",
};

export const LIFECYCLE_AR: Record<Lifecycle, string> = {
  ready: "جاهز للبدء",
  playing: "تشغيل",
  paused: "متوقف مؤقتًا",
  suspended: "معلّق",
  "stage-complete": "اكتملت المرحلة",
  completed: "اكتملت الجلسة",
  ended: "انتهت الجلسة",
};
export const SUSPEND_AR: Record<SuspendReason, string> = {
  "input-lost": "انقطع الإدخال — أعد الاتصال ثم اضغط استئناف",
  "display-unavailable": "شاشة العرض غير متصلة",
  "control-hidden": "نافذة التحكم مخفية",
  "scheduling-gap": "توقّف قصير — اضغط استئناف",
};

export const HINT_AR: Record<Exclude<HintKey, null>, string> = {
  "move-left": "تحرّك إلى اليسار",
  "move-right": "تحرّك إلى اليمين",
  step: "ارفع قدمك لتتخطّى العائق",
  "choose-path": "اختر المسار المضيء",
  go: "رائع! واصل الجري",
};

export const ENCOURAGE_AR = ["أحسنت!", "رائع!", "ممتاز!", "استمر!", "جميل جدًا!"];
export const CHECKPOINT_AR = "نقطة تفتيش — أحسنت!";
export const FINISH_AR = "وصلتَ إلى الوجهة!";

// ---------- FLOOR projection ----------
export const PROJECTION_AR: Record<"WALL" | "FLOOR", string> = { WALL: "جداري", FLOOR: "أرضي" };
export const PROJECTION_NOTE_AR: Record<"WALL" | "FLOOR", string> = {
  WALL: "العدّاء يجري على الجدار بين ثلاثة مسارات ويتخطّى الحواجز بتوجيه المعالج.",
  FLOOR: "رحلة على الأرض من الأعلى: مناطق كبيرة مضيئة يؤكد المعالج حركة الطفل إليها. بلا قفز ولا جري ولا وقت محدد.",
};
export const FLOOR_CUE_AR = {
  left: "تحرّك إلى اليسار",
  right: "تحرّك إلى اليمين",
  centre: "عُد إلى المنتصف",
  choose: "اختر المنطقة المضيئة",
  step: "خطوة صغيرة بقدمك في مكانك",
  rest: "استرح قليلًا… ثم نتابع",
  done: "وصلتَ إلى الوجهة!",
} as const;
export const FLOOR_CUE_THERAPIST_AR = {
  left: "الطفل يتجه إلى اليسار",
  right: "الطفل يتجه إلى اليمين",
  centre: "الطفل يعود إلى المنتصف",
  choose: "الطفل يختار المنطقة المضيئة",
  step: "حركة صغيرة بالقدم في المكان",
  rest: "استراحة قصيرة",
} as const;
export const FLOOR_RANGE_AR: Record<Level3, string> = { low: "قريبة", normal: "متوسطة", high: "واسعة" };
export const FLOOR_PAD_AR: Record<Level3, string> = { low: "كبيرة", normal: "كبيرة جدًا", high: "ضخمة" };
export const FLOOR_HINT_AR = { left: "الحسّاس يقترح: حركة نحو اليسار", right: "الحسّاس يقترح: حركة نحو اليمين", step: "الحسّاس يقترح: حركة قدم صغيرة", rest: "الحسّاس: القدم عادت إلى وضع الراحة" } as const;

/** Arabic cue (child-facing) for an objective. */
export function floorCueAr(o: Pick<FloorObjective, "kind" | "target" | "variant">): string {
  if (o.kind === "step") return FLOOR_CUE_AR.step;
  if (o.kind === "rest") return FLOOR_CUE_AR.rest;
  if (o.variant === "choose") return FLOOR_CUE_AR.choose;
  return o.target === -1 ? FLOOR_CUE_AR.left : o.target === 1 ? FLOOR_CUE_AR.right : FLOOR_CUE_AR.centre;
}
export function floorCueTherapistAr(o: Pick<FloorObjective, "kind" | "target" | "variant">): string {
  if (o.kind === "step") return FLOOR_CUE_THERAPIST_AR.step;
  if (o.kind === "rest") return FLOOR_CUE_THERAPIST_AR.rest;
  const side = o.target === -1 ? FLOOR_CUE_THERAPIST_AR.left : o.target === 1 ? FLOOR_CUE_THERAPIST_AR.right : FLOOR_CUE_THERAPIST_AR.centre;
  return o.variant === "choose" ? `${FLOOR_CUE_THERAPIST_AR.choose} (${side.replace("الطفل ", "")})` : side;
}
