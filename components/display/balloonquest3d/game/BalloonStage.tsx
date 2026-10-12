"use client";

import { useEffect, useRef } from "react";
import { BALLOON_COLOR_DEFS } from "@/lib/balloonquest/colors";
import { START_Y, TRAVEL_CQH } from "@/lib/balloonquest/geometry";
import type { DisplayState } from "@/lib/balloonquest/protocol";
import { BalloonArt3D, BalloonDefs } from "../preview/BalloonArt3D";
import { SkyBackdrop } from "../preview/SkyBackdrop";
import "../preview/balloonQuestPreview.css";
import "./game.css";

const POP_PARTICLES = 8;

interface Props {
  state: DisplayState;
  /** Authoritative simulation clock (ms). Balloon positions are a pure function of it. */
  getSimTimeMs: () => number;
  showSymbols?: boolean;
  /** Fill the parent (the platform's letterboxed PlayStage) instead of sizing itself to the viewport. */
  embedded?: boolean;
  /** Control preview only: lets the therapist tap a balloon. The child Display never passes this. */
  onSelect?: (balloonId: string) => void;
  children?: React.ReactNode;
}

/**
 * The play field shared by the child Display and the therapist preview. React
 * re-renders only when the authoritative STATE changes (spawn, retire, pop,
 * progress). Movement is written straight to the DOM from the simulation
 * clock in a requestAnimationFrame loop — never through React state — and CSS
 * sway/bob is cosmetic only (hit testing uses the clock, not CSS).
 */
export function BalloonStage({ state, getSimTimeMs, showSymbols = false, embedded = false, onSelect, children }: Props) {
  const lanes = useRef(new Map<string, HTMLDivElement>());
  const stateRef = useRef(state);
  const rising = state.motion === "rising" && state.riseSeconds > 0;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!rising) return;
    const speed = TRAVEL_CQH / state.riseSeconds;
    let raf = 0;
    const loop = () => {
      const t = getSimTimeMs();
      for (const b of stateRef.current.balloons) {
        const el = lanes.current.get(b.id);
        if (el) el.style.transform = `translateY(${START_Y - ((t - b.spawnedAtMs) / 1000) * speed}cqh)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [rising, state.riseSeconds, getSimTimeMs]);

  const place = (id: string, spawnedAtMs: number) => (el: HTMLDivElement | null) => {
    if (!el) {
      lanes.current.delete(id);
      return;
    }
    lanes.current.set(id, el);
    if (rising) el.style.transform = `translateY(${START_Y - ((getSimTimeMs() - spawnedAtMs) / 1000) * (TRAVEL_CQH / state.riseSeconds)}cqh)`;
  };

  return (
    <div
      className={`bq3-stage bq3g-stage${embedded ? " bq3g-embedded" : ""}${onSelect ? " is-interactive" : ""}${state.reducedMotion ? " bq3-force-still" : ""}`}
      data-layout={state.layout}
      data-motion={rising ? "rising" : "static"}
      data-target={state.target}
      data-lifecycle={state.lifecycle}
      data-goal-done={state.goalDone}
      data-testid="bq-stage"
      style={{ fontFamily: "var(--font-balloon-quest), system-ui, sans-serif" }}
    >
      <BalloonDefs />
      <SkyBackdrop />
      <div className="bq3g-field">
        {state.balloons.map((b) => {
          const def = BALLOON_COLOR_DEFS[b.color];
          return (
            <div
              key={b.id}
              ref={place(b.id, b.spawnedAtMs)}
              className={`bq3g-lane ${rising ? "is-rising" : "is-static"}${!rising && b.spawnedAtMs > 0 ? " is-fresh" : ""}`}
              data-balloon-id={b.id}
              data-color={b.color}
              style={{ left: `${b.x}%`, ...(rising ? {} : { top: `${b.topY}cqh` }), "--w": `${state.sizeCqh}cqh`, "--bob-delay": `${-((b.x * 7) % 5)}s` } as React.CSSProperties}
            >
              <div className="bq3-sway">
                <button
                  key={`${b.id}-${b.wrongCueCount}`}
                  type="button"
                  tabIndex={onSelect ? 0 : -1}
                  className={`bq3-balloon${b.popping ? " is-popped" : ""}${b.wrongCueCount > 0 ? " is-wobbling" : ""}`}
                  aria-label={`بالون ${def.nameAr}`}
                  onClick={onSelect ? () => onSelect(b.id) : undefined}
                >
                  <BalloonArt3D color={b.color} showSymbol={showSymbols} />
                  {b.popping &&
                    Array.from({ length: POP_PARTICLES }, (_, i) => (
                      <span key={i} className="bq3-particle" style={{ "--angle": `${(360 / POP_PARTICLES) * i + 12}deg`, "--pcolor": def.particle } as React.CSSProperties} />
                    ))}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
