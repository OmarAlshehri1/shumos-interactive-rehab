"use client";

import Link from "next/link";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";

export type ControlNavSection = "home" | "library" | "patients" | "youtube";

const NAV_ITEMS: { section: ControlNavSection; href: string; label: string }[] = [
  { section: "home", href: "/control", label: "الرئيسية" },
  { section: "library", href: "/control/activities", label: "الأنشطة" },
  { section: "youtube", href: "/control/youtube", label: "يوتيوب" },
  { section: "patients", href: "/control/patients", label: "المرضى" },
];

/**
 * CONTROL UX POLISH TASK — the global navigation shell for every top-level
 * authenticated /control screen (Home, Activities, Patients): "the
 * therapist should always understand whether they are in [Home/Activities/
 * Patients]." Deliberately a compact three-tab strip, not a sidebar — this
 * app is an iPad-first, fixed-viewport tool, and a persistent side rail
 * would eat into the already-limited width (see PatientQuickRail, the ONE
 * place a rail exists, on the single deep page that benefits from it).
 * "تسجيل الخروج" (also a task-listed "main destination") is deliberately
 * NOT duplicated here — StaffAuthGate's LogoutCorner already renders a
 * persistent sign-out control on every authorized /control page, including
 * gameplay, so adding a second one here would just be clutter.
 *
 * Shown only on the three top-level screens — never during an active game
 * session, where a global tab strip would tempt the therapist away from a
 * live session by accident; ControlScreen.tsx's own contextual controls
 * (patient chip, cancel, end session) own navigation there instead.
 */
export function ControlNav({ active, showBrand = true }: { active: ControlNavSection; showBrand?: boolean }) {
  return (
    <>
      {/* The single Shumos logo for every Control page: pinned to the top left corner (the right corner holds the sign-out pill) (scrolls with the page), in flow on narrow screens. */}
      {showBrand && <div className="absolute top-5 left-6 z-10 max-lg:static max-lg:mx-auto max-lg:mb-3 max-lg:w-fit" data-control-logo>
        <ShumosBrandMark compact />
      </div>}
    <nav aria-label="التنقل الرئيسي" className="mx-auto flex w-full max-w-5xl items-center justify-center gap-1.5 px-5 sm:px-8">
      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        {NAV_ITEMS.map((item) => {
          const isActive = item.section === active;
          return (
            <Link
              key={item.section}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`min-h-11 touch-manipulation rounded-full px-3 sm:px-5 text-base font-semibold transition-colors ${
                isActive ? "bg-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              } flex items-center justify-center`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}
