"use client";

import { GAME_REGISTRY } from "@/lib/games/registry";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { PatientContextBanner } from "@/components/control/patients/PatientContextBanner";
import { GameCard } from "./GameCard";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";
import { ResetLiveDisplayOnMount } from "@/components/control/live/ResetLiveDisplayOnMount";

/**
 * The full Activity Library, at /control/activities (see
 * app/control/activities/page.tsx) — CONTROL UX POLISH TASK: /control
 * itself is now the therapist's Home dashboard (components/control/home/HomeScreen.tsx),
 * which previews this same GAME_REGISTRY compactly and links here for the
 * full picture. The therapist picks an activity here; each registered game
 * (lib/games/registry.ts) owns its own route under /control/<id> — see
 * app/control/balloon-quest/page.tsx.
 *
 * Same outer shell shape as ControlScreen's ControllerShell (fixed inset,
 * safe-area padding, RTL, the control app's dedicated typeface) so the
 * library reads as the same app, not a different product — duplicated
 * rather than shared because ControllerShell also carries controller-only
 * state (the therapist workflow phase) that has no meaning here.
 *
 * COMPACT LIBRARY TASK: the grid track size (240-300px) is tuned so
 * `auto-fit` naturally lands on ~3 columns on iPad landscape, ~2 on iPad
 * portrait, and 1 on phone — see the report's grid-math for the exact
 * numbers — with NO hardcoded breakpoints. `justify-center` only centers
 * the row of actual cards that exist today; a single Balloon Quest card
 * sits at its natural compact size in the grid, never stretched to fill
 * the page, and every future registered game simply becomes another grid
 * item with no layout change needed here.
 */
export function GameLibraryScreen() {
  const wallGames = GAME_REGISTRY.filter((game) => game.surfaceType === "WALL");
  const floorGames = GAME_REGISTRY.filter((game) => game.surfaceType === "FLOOR");

  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <ResetLiveDisplayOnMount />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
        <ControlNav active="library" />

        <header className="flex flex-col items-center gap-2 text-center">
          <ShumosBrandMark compact />
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">مكتبة الأنشطة</h1>
          <p className="text-base text-slate-500">اختر النشاط لبدء جلسة جديدة</p>
        </header>

        <PatientContextBanner />

        <ActivitySurfaceSection
          title="ألعاب الأرض"
          englishTitle="Floor Games"
          description="أنشطة تُعرض على الأرض ويشارك الطفل فيها بالحركة والوقوف على المساحات المضيئة."
          games={floorGames}
          tone="floor"
        />
        <ActivitySurfaceSection
          title="ألعاب الجدار"
          englishTitle="Wall Games"
          description="أنشطة تُعرض على الجدار ويشارك الطفل فيها بالوصول واللمس والحركة أمام الشاشة."
          games={wallGames}
          tone="wall"
        />
      </div>
    </main>
  );
}

function ActivitySurfaceSection({
  title,
  englishTitle,
  description,
  games,
  tone,
}: {
  title: string;
  englishTitle: string;
  description: string;
  games: typeof GAME_REGISTRY;
  tone: "floor" | "wall";
}) {
  return (
    <section className={`flex flex-col gap-5 rounded-3xl border p-4 shadow-sm sm:p-6 ${tone === "floor" ? "border-indigo-200 bg-indigo-50/55" : "border-teal-200 bg-teal-50/55"}`}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
          <span className="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">{englishTitle}</span>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => <GameCard key={game.id} game={game} />)}
      </div>
    </section>
  );
}
