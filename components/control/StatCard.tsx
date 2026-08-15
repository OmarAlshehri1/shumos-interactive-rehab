interface StatCardProps {
  label: string;
  value: string;
  ltr?: boolean;
  tone?: "default" | "positive" | "negative";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-slate-900",
  positive: "text-emerald-600",
  negative: "text-rose-500",
};

/** Shared therapist-facing stat tile — used by the per-stage result overlay and the session summary, so every metric on /control looks and reads the same way. */
export function StatCard({ label, value, ltr, tone = "default" }: StatCardProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
      <span className={`text-lg font-bold sm:text-xl ${TONE_CLASSES[tone]}`} dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}
