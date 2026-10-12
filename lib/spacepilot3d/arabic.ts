import type { SessionLifecycle, SuspendReason } from "./sessionContract";
import type { SensorInputStatus } from "./sensorInput";

/** Presentation only: protocol identifiers and authoritative mission data stay unchanged. */
export const missionArabic = ["تدريب الطيران", "حقل النيازك", "الممر الناري"];
export const numberArabic = (value: number) => new Intl.NumberFormat("ar-SA").format(value);
export const lifecycleArabic: Record<SessionLifecycle | "disconnected", string> = {
  ready: "جاهز للانطلاق", running: "الرحلة جارية", paused: "استراحة قصيرة",
  suspended: "الرحلة متوقفة بأمان", "mission-complete": "اكتملت المهمة",
  completed: "اكتملت الرحلة", ended: "انتهت الجلسة", disconnected: "بانتظار المعالج",
};
export const sensorArabic: Record<SensorInputStatus, string> = {
  waiting: "بانتظار اليد اليمنى", align: "طابق موضع اليد مع التوجيه المحفوظ", tracking: "متصل وجاهز",
  unavailable: "غير متصل", stale: "انقطعت الإشارة", invalid: "إشارة غير صالحة",
  discontinuity: "أعد مطابقة موضع اليد", unsupported: "المتصفح لا يدعم الاتصال المحلي",
};
export const reasonArabic: Record<SuspendReason, string> = {
  "control-hidden": "أُخفيت نافذة التحكم. أظهر النافذتين، ثم اضغط متابعة.",
  "display-unavailable": "بانتظار نافذة عرض ظاهرة وجاهزة. اللعب متوقف بأمان.",
  "input-unavailable": "انقطعت إشارة اليد. طابق موضع اليد مع التوجيه المحفوظ، ثم اضغط متابعة.",
  "scheduling-gap": "توقف المتصفح مؤقتًا. اضغط متابعة عندما تصبح النافذتان جاهزتين.",
  "clock-discontinuity": "تغير توقيت الجهاز. اضغط متابعة عندما تكون جاهزًا.",
  "renderer-unavailable": "تعذر تشغيل الرسوم. أعد تحميل العرض، ثم اضغط متابعة.",
  "control-closed": "انقطع الاتصال بنافذة التحكم. اللعب متوقف بأمان.",
};
