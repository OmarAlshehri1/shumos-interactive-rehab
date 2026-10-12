import type { Difficulty, InputMode, Layout, Lifecycle, SourceId, SuspendReason } from "./types";

export const DIFFICULTY_AR: Record<Difficulty, string> = { EASY: "سهل", MEDIUM: "متوسط", ADVANCED: "متقدم" };
export const LAYOUT_AR: Record<Layout, string> = { WALL: "جداري (عرض أمامي)", FLOOR: "أرضي (إسقاط على الأرض)" };
export const INPUT_MODE_AR: Record<InputMode, string> = {
  therapist: "بنقر المعالج على المعاينة",
  keyboard: "لوحة المفاتيح (للتطوير)",
  "right-hand": "اليد اليمنى (حساس)",
  "left-hand": "اليد اليسرى (حساس) — تجريبي",
  "both-hands": "اليدان معًا — تجريبي",
  foot: "حساسات القدم — محاكاة فقط",
  handheld: "وحدة تحكم يدوية — محاكاة فقط",
};
export const SOURCE_AR: Record<SourceId, string> = {
  RIGHT_HAND: "اليد اليمنى",
  LEFT_HAND: "اليد اليسرى",
  RIGHT_FOOT: "القدم اليمنى",
  LEFT_FOOT: "القدم اليسرى",
  HANDHELD: "وحدة التحكم",
  KEYBOARD: "لوحة المفاتيح",
  THERAPIST: "المعالج",
};
export const LIFECYCLE_AR: Record<Lifecycle, string> = {
  ready: "جاهز للبدء",
  playing: "قيد اللعب",
  paused: "متوقف مؤقتًا",
  suspended: "متوقف تلقائيًا",
  "stage-complete": "اكتملت المرحلة",
  completed: "اكتملت المغامرة",
  ended: "أُنهيت الجلسة",
};
export const SUSPEND_AR: Record<SuspendReason, string> = {
  "input-lost": "فُقد إدخال الحساس — تتوقف اللعبة حتى يعود",
  "display-unavailable": "شاشة العرض غير متاحة",
  "control-hidden": "نافذة التحكم مخفية",
  "scheduling-gap": "توقف قصير في المتصفح",
};
const DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
export const arabicNumber = (n: number): string => String(Math.trunc(n)).replace(/\d/g, (d) => DIGITS[Number(d)]);
