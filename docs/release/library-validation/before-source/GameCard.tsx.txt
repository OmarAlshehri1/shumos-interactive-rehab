"use client";

import Link from "next/link";
import type { GameDefinition, SurfaceType } from "@/lib/games/registry";
import { SURFACE_TYPE_LABELS_AR } from "@/lib/games/registry";
import { GAME_THUMBNAILS } from "./gameThumbnails";

/** Tiny, currentColor-tinted pictograms — a downward arrow settling onto a baseline for FLOOR (projected at the child's feet), a plain frame for WALL. Deliberately not an emoji: stays crisp at 12px and matches the pill's own text color exactly. */
function SurfaceTypeIcon({ type }: { type: SurfaceType }) {
  if (type === "WALL") {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" aria-hidden="true">
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" aria-hidden="true">
      <path d="M8 2.2 V9.6 M8 9.6 L5.2 6.8 M8 9.6 L10.8 6.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="13.2" x2="13" y2="13.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * COMPACT LIBRARY TASK: the library's one card type, shared by every
 * registered game — see lib/games/registry.ts. Deliberately compact (not
 * the original Task A card, which was judged too large once the library
 * needs to hold 4-6 activities): a shorter thumbnail, tighter padding,
 * smaller type, so ~3 fit per row on iPad landscape and ~2 on portrait
 * (see GameLibraryScreen.tsx's grid) without shrinking the tap target below
 * a comfortable size. Still a premium activity card, not a generic SaaS
 * tile: full-bleed illustrated thumbnail (this game's own visual language),
 * bilingual naming, a surface-type pill DERIVED from registry metadata
 * (never a hardcoded "لعبة أرضية" string here), a status pill, a short
 * description, and one unambiguous action.
 */
export function GameCard({ game, onSelect }: { game: GameDefinition; onSelect?: () => void }) {
  const Thumbnail = GAME_THUMBNAILS[game.id];

  return (
    <Link
      href={game.route}
      onClick={onSelect}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_18px_rgba(30,41,59,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(30,41,59,0.12)] active:scale-[0.99] active:shadow-[0_4px_12px_rgba(30,41,59,0.08)]"
    >
      <Thumbnail />

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] leading-tight font-bold text-slate-900">{game.nameAr}</h2>
          <span className="text-[10.5px] font-medium tracking-wide text-slate-400 uppercase">{game.nameEn}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-slate-600">
            <SurfaceTypeIcon type={game.surfaceType} />
            {SURFACE_TYPE_LABELS_AR[game.surfaceType]}
          </span>
          {game.focusTagsAr.map((tag) => <span key={tag} className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-teal-700">{tag}</span>)}
        </div>

        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{game.shortDescriptionAr}</p>

        <span className="mt-1 inline-flex min-h-10 touch-manipulation items-center justify-center gap-1 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-sm shadow-teal-900/15 transition-colors group-hover:bg-teal-700">
          بدء النشاط
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
