/** No identities, SDP, media, credentials or raw exception text in diagnostics. */
export type ShareStep = "capability" | "control-readiness" | "ownership" | "game-guard" |
  "display-readiness" | "capture" | "capture-surface" | "existing-share" |
  "legacy-command" | "prepare-display" | "server-clock" | "display-approval" |
  "offer" | "publish-offer" | "answer";

export function shareFailureCode(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown } | null;
  const code = e?.code;
  if (code === "PERMISSION_DENIED" || code === "permission-denied" || code === "database/permission-denied") return "permission-denied";
  const name = e?.name;
  return typeof name === "string" && ["TypeError", "InvalidStateError", "NotAllowedError", "AbortError", "NotFoundError", "NotReadableError", "OverconstrainedError"].includes(name) ? name : "Error";
}

export function shareDiagnostic(step: ShareStep, outcome: "start" | "passed" | "rejected", error?: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[youtube-sharing]", {
    step, outcome,
    ...(outcome === "rejected" ? { code: shareFailureCode(error) } : {}),
    ...(step === "capture" && typeof document !== "undefined" ? {
      focused: document.hasFocus(), activeGesture: navigator.userActivation?.isActive === true,
    } : {}),
  });
}

export function captureFailureMessage(error: unknown): string {
  switch (shareFailureCode(error)) {
    case "InvalidStateError": return "أعد التركيز على نافذة التحكم واضغط زر الربط مباشرةً.";
    case "TypeError": return "رفض Chrome خيارات مشاركة التبويب قبل فتح نافذة الاختيار.";
    case "NotReadableError": return "تعذّر على Chrome التقاط التبويب. تحقق من إذن تسجيل الشاشة في إعدادات النظام.";
    case "NotFoundError": return "لم يجد Chrome مصدرًا متاحًا للمشاركة. افتح تبويب يوتيوب ثم أعد المحاولة.";
    case "OverconstrainedError": return "تعذّر تطبيق إعدادات الالتقاط على التبويب المحدد.";
    default: return "تعذّر بدء التقاط التبويب في Chrome. أعد المحاولة.";
  }
}
