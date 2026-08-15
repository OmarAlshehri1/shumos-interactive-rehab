interface SystemStatusProps {
  label: string;
  variant?: "light" | "dark";
}

export function SystemStatus({ label, variant = "dark" }: SystemStatusProps) {
  const styles =
    variant === "dark"
      ? "border-white/15 bg-white/5 text-white/70"
      : "border-slate-200 bg-white text-slate-600 shadow-sm";

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium tracking-wide sm:text-base ${styles}`}
    >
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      {label}
    </div>
  );
}
