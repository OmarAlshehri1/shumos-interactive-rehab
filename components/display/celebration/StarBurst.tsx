"use client";

import { Sparkles } from "../balloon/Sparkles";

const GOLD = ["#FFC94A", "#FFE29A", "#FFFFFF"] as const;

/** TASK 9 — the Stage 1 celebration language: "a tasteful star celebration... gentle celebratory lighting." `big` (Stage 3) adds two extra burst origins for a fuller moment without changing the underlying Sparkles primitive. */
export function StarBurst({ big = false }: { big?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute top-[36%] left-1/2 -translate-x-1/2">
        <Sparkles colors={[...GOLD]} count={big ? 14 : 10} radius={big ? 19 : 14} />
      </div>
      {big && (
        <>
          <div className="absolute top-[28%] left-[26%]">
            <Sparkles colors={[...GOLD]} count={8} radius={12} />
          </div>
          <div className="absolute top-[30%] right-[24%]">
            <Sparkles colors={[...GOLD]} count={8} radius={12} />
          </div>
        </>
      )}
    </div>
  );
}
