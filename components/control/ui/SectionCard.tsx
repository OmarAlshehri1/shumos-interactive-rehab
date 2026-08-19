import type { ReactNode } from "react";

interface SectionCardProps {
  /** Short Arabic section heading — omit for a section that already renders its own custom header row. */
  title?: string;
  /** Right-aligned header action, e.g. a "عرض الكل" link — only rendered alongside `title`. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * CONTROL UX CLARITY — the one shared "this is a group" visual unit used
 * across /control (Home, Activities, Patients, Patient Profile, Setup,
 * Ready, Live, Summary/History): white surface, rounded corners, subtle
 * border + shadow, comfortable padding. Deliberately a single flat card per
 * meaningful section (never nested) — spacing/dividers inside a section are
 * plain flex gaps, not further cards.
 */
export function SectionCard({ title, action, className, children }: SectionCardProps) {
  return (
    <section className={`flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 ${className ?? ""}`}>
      {title && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
