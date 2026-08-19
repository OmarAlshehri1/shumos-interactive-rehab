"use client";

import { Sparkles } from "../balloon/Sparkles";

/**
 * Client feedback: correct-balloon feedback (pop + chime) "isn't visually
 * rewarding enough" — wants a short, exciting burst around the OUTER play
 * area on every correct pop, described as "طراطيع" around the screen, but
 * explicitly NOT full-screen, NOT flashing, and never hiding the balloons.
 * This reuses the same `Sparkles` primitive already approved for the
 * per-balloon pop and the Stage/Session celebrations (see StarBurst.tsx) —
 * a new shape system was judged unnecessary and more expensive than reusing
 * one that already reads as "this game's celebration language."
 *
 * Three lightweight, DETERMINISTIC variants (cycled by the caller via
 * `stage.correctCount`, never Math.random() — see PlayingScene.tsx) so
 * every correct pop doesn't look identical, without ever looking like the
 * bigger Stage/Session celebrations. Every burst positions its pieces near
 * the screen's edges/corners, well clear of the balloon field's center, and
 * finishes within ~1s (Sparkles' own fixed 0.8s lifetime plus a small
 * stagger) — short enough that it can never look like session completion.
 * Motion-only (x/y/opacity/scale), so MotionConfig's `reducedMotion="user"`
 * (see DisplayScreen.tsx) already makes this respect prefers-reduced-motion
 * for free, same as every other celebration piece in this app.
 */
const GOLD = ["#FFC94A", "#FFE29A", "#FFFFFF"] as const;
const RAINBOW = ["#FFC94A", "#3E8EF7", "#F2555A", "#3DD68C", "#A66DF2"] as const;

export type CorrectBurstVariant = 0 | 1 | 2;

function StarsAndSides() {
  return (
    <>
      <div className="absolute top-[8%] left-1/2 -translate-x-1/2">
        <Sparkles colors={[...GOLD]} count={9} radius={11} />
      </div>
      <div className="absolute top-1/2 left-[4%] -translate-y-1/2">
        <Sparkles colors={[...GOLD]} count={6} radius={8} />
      </div>
      <div className="absolute top-1/2 right-[4%] -translate-y-1/2">
        <Sparkles colors={[...GOLD]} count={6} radius={8} />
      </div>
    </>
  );
}

function RadialBursts() {
  return (
    <>
      <div className="absolute top-[10%] left-[10%]">
        <Sparkles colors={[...RAINBOW]} count={7} radius={9} />
      </div>
      <div className="absolute top-[10%] right-[10%]">
        <Sparkles colors={[...RAINBOW]} count={7} radius={9} />
      </div>
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2">
        <Sparkles colors={[...RAINBOW]} count={8} radius={10} />
      </div>
    </>
  );
}

function CornerShower() {
  return (
    <>
      <div className="absolute top-[4%] left-[4%]">
        <Sparkles colors={[...GOLD]} count={6} radius={9} />
      </div>
      <div className="absolute top-[4%] right-[4%]">
        <Sparkles colors={[...GOLD]} count={6} radius={9} />
      </div>
      <div className="absolute bottom-[6%] left-[4%]">
        <Sparkles colors={[...GOLD]} count={6} radius={9} />
      </div>
      <div className="absolute bottom-[6%] right-[4%]">
        <Sparkles colors={[...GOLD]} count={6} radius={9} />
      </div>
    </>
  );
}

const VARIANTS = [StarsAndSides, RadialBursts, CornerShower] as const;

export function CorrectCelebrationBurst({ variant, final = false }: { variant: CorrectBurstVariant; final?: boolean }) {
  const Variant = VARIANTS[variant];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <Variant />
      {final && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Sparkles colors={[...RAINBOW]} count={18} radius={18} />
          </div>
          <div className="absolute top-[12%] left-[8%]"><Sparkles colors={[...GOLD]} count={8} radius={10} /></div>
          <div className="absolute right-[8%] bottom-[12%]"><Sparkles colors={[...GOLD]} count={8} radius={10} /></div>
        </>
      )}
    </div>
  );
}
