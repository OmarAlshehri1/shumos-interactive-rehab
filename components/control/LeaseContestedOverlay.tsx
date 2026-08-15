/**
 * TASK 6/8: shown instead of the normal controller UI whenever another
 * /control device currently holds the session lease (see
 * lib/control/useRealtimeControllerSession.ts). As of Task 8 the lease is
 * tied to an authenticated Firebase UID, and Security Rules only allow a
 * DIFFERENT uid to take it over once it's gone stale (~45s without a
 * heartbeat) — matching the common real case (the other device actually
 * disconnected) rather than forcibly evicting one that's still connected.
 * This is still not "authorized Shumos Care therapist" verification —
 * anonymous auth only proves a Firebase-issued identity, not who's holding
 * the device — see the Task 8 report's security-limitation section.
 */
export function LeaseContestedOverlay({ onTakeOver, takeoverBlocked }: { onTakeOver: () => void; takeoverBlocked?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-slate-900/85 px-8 text-center backdrop-blur-sm">
      <span className="text-4xl" aria-hidden="true">
        🔒
      </span>
      <h2 className="text-xl font-bold text-white">جلسة أخرى نشطة على جهاز آخر</h2>
      <p className="max-w-xs text-sm leading-relaxed text-white/70">
        جهاز تحكم آخر يتحكم حاليًا بالجلسة. لا يمكن إجراء أي تغييرات من هذا الجهاز حتى الاستحواذ على التحكم.
      </p>
      {takeoverBlocked && (
        <p className="max-w-xs text-sm font-semibold leading-relaxed text-amber-300">
          الجهاز الآخر ما زال متصلاً — لا يمكن الاستحواذ الآن. حاول مرة أخرى بعد قليل.
        </p>
      )}
      <button
        type="button"
        onClick={onTakeOver}
        className="min-h-14 touch-manipulation rounded-2xl bg-white px-8 text-base font-bold text-slate-900 shadow-lg transition-all active:scale-[0.98]"
      >
        الاستحواذ على الجلسة
      </button>
    </div>
  );
}
