"use client";

import Link from "next/link";

export interface ControlBreadcrumbItem {
  label: string;
  /** Omit on the LAST item — that one is "where you are," never a link. */
  href?: string;
}

/**
 * CONTROL UX POLISH TASK — the small, subtle contextual trail for deep
 * pages (Patient Profile, Session Detail) that a top-level tab strip
 * (ControlNav) doesn't fit naturally on: "المرضى / عمر / جلسة 15 أغسطس"
 * (task section 17). Deliberately not an enterprise-style breadcrumb bar —
 * just a text row — and it does double duty as this page's back/context
 * navigation (task sections 8/9/16: "avoid pages where a tiny arrow in a
 * corner is the only navigation"), including a route back to الرئيسية,
 * without adding a second nav element alongside it.
 */
export function ControlBreadcrumb({ items }: { items: ControlBreadcrumbItem[] }) {
  return (
    <nav aria-label="مسار التنقل" className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {item.href ? (
            <Link href={item.href} className="font-semibold text-slate-400 transition-colors hover:text-slate-600">
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold text-slate-700">{item.label}</span>
          )}
          {index < items.length - 1 && (
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
