/**
 * TASK 5 LOCAL DEV CONVENIENCE ONLY. Hidden outright in a production build
 * (same gate as components/display/DevBadge.tsx) — the real setup form
 * always starts with an empty name field; this just saves re-typing "محمد"
 * on every reload while testing the controller locally.
 */
export function DevQuickFill({ onFill }: { onFill: () => void }) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <button
      type="button"
      onClick={onFill}
      className="self-center rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500"
    >
      تعبئة تجريبية (محمد) — للتطوير فقط
    </button>
  );
}
