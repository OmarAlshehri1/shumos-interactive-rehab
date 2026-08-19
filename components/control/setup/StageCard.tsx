"use client";

import type { ReactNode } from "react";

interface StageCardProps {
  /** e.g. "المرحلة 1" */
  label: string;
  title: string;
  description: string;
  characteristics: readonly string[];
  selected: boolean;
  onSelect: () => void;
  preview: ReactNode;
}

/**
 * THERAPIST SETUP SIMPLIFICATION — one visual, non-technical preset card for
 * the setup screen's Stage grid. Shared across all four games: only the
 * `preview` node and text content differ per game/stage, the card shell
 * (selection state, touch target, accessibility) is identical everywhere.
 *
 * Selection is never color-only (task section 45): a teal ring + a check
 * badge + the "تم الاختيار" text all change together. The whole card is one
 * button — no separate tiny radio control to hit precisely.
 */
export function StageCard({ label, title, description, characteristics, selected, onSelect, preview }: StageCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex touch-manipulation flex-col gap-3 rounded-3xl border-2 p-4 text-start transition-all active:scale-[0.98] ${
        selected
          ? "border-teal-600 bg-teal-50/60 shadow-md shadow-teal-900/10"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" style={{ aspectRatio: "4 / 3" }}>
        {preview}
        {selected && (
          <span className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white shadow-sm">
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-white">
              <path d="M8 13.5 4.5 10l1.4-1.4L8 10.7l6.1-6.1L15.5 6z" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-teal-600">{label}</span>
          {selected && <span className="text-xs font-semibold text-teal-600">تم الاختيار</span>}
        </div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
          {characteristics.map((item) => (
            <li key={item} className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-slate-400" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}
