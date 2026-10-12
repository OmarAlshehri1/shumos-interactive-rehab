"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BalloonArt3D, BalloonDefs } from "./BalloonArt3D";
import { PreviewHud } from "./PreviewHud";
import { SkyBackdrop } from "./SkyBackdrop";
import { PREVIEW_COLORS, PREVIEW_MODES, PREVIEW_MODE_ORDER, type PreviewColor, type PreviewMode, type PreviewModeConfig } from "./previewConfig";
import { advance, initEngine, makeParams, popBalloon, type EngineContext, type Motion } from "./previewEngine";
import "./balloonQuestPreview.css";

const SUCCESS_MS = 1500;
const GOAL_HOLD_MS = 2000;
const TICK_MS = 400;
const POP_PARTICLES = 8;

const noopSubscribe = () => () => {};
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface FieldProps {
  config: PreviewModeConfig;
  motion: Motion;
  seed: number;
  target: PreviewColor;
  remaining: number;
  symbols: boolean;
  onPop: (isTarget: boolean) => void;
}

/**
 * The play field. React state changes only on events (a spawn, a pop, a
 * retirement) — never per animation frame; all movement is CSS.
 */
function PreviewField({ config, motion, seed, target, remaining, symbols, onPop }: FieldProps) {
  const params = useMemo(() => makeParams(config, motion, seed), [config, motion, seed]);
  const ctxRef = useRef<EngineContext>({ target, remaining });
  const [state, setState] = useState(() => initEngine(params, { target, remaining }, Date.now()));

  useEffect(() => {
    ctxRef.current = { target, remaining };
  }, [target, remaining]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setState((s) => advance(s, params, ctxRef.current, now));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [params]);

  const handleSelect = (id: string, color: PreviewColor, popping: boolean) => {
    if (popping) return;
    setState((s) => popBalloon(s, id, Date.now()));
    onPop(color === target);
  };

  const rising = motion === "rising";
  return (
    <div className="bq3-field" data-motion={motion}>
      {state.balloons.map((b) => (
        <div
          key={b.id}
          className={`bq3-lane ${rising ? "is-rising" : `is-static${b.fresh ? " is-entering" : ""}`}`}
          style={
            {
              left: `${b.x}%`,
              top: rising ? 0 : `${b.y}%`,
              "--w": `${config.sizeCqh}cqh`,
              "--rise-seconds": `${config.riseSeconds}s`,
              "--rise-delay": `${b.delaySec}s`,
              "--bob-delay": `${-((b.x * 7) % 5)}s`,
            } as React.CSSProperties
          }
        >
          <div className="bq3-sway">
            <button
              type="button"
              className={`bq3-balloon${b.popping ? " is-popped" : ""}`}
              aria-label={`بالون ${PREVIEW_COLORS[b.color].nameAr}`}
              onClick={() => handleSelect(b.id, b.color, b.popping)}
            >
              <BalloonArt3D color={b.color} showSymbol={symbols} />
              {b.popping &&
                Array.from({ length: POP_PARTICLES }, (_, i) => (
                  <span key={i} className="bq3-particle" style={{ "--angle": `${(360 / POP_PARTICLES) * i + 12}deg`, "--pcolor": PREVIEW_COLORS[b.color].particle } as React.CSSProperties} />
                ))}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  initialMode: PreviewMode;
  initialSymbols: boolean;
  showPanel: boolean;
}

/**
 * VISUAL PREVIEW ONLY. Selecting a balloon pops it and it is gone for good
 * (replacements enter later); only the requested colour fills the goal bar,
 * and nothing is ever deducted. There is no session engine, persistence,
 * Firebase or sensor input, and no timer or failure state anywhere.
 */
export function BalloonQuestVisualPreview({ initialMode, initialSymbols, showPanel }: Props) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const osReduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  const [mode, setMode] = useState<PreviewMode>(initialMode);
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<PreviewColor>("blue");
  const [symbols, setSymbols] = useState(initialSymbols);
  const [still, setStill] = useState(false);
  const [goalDone, setGoalDone] = useState(0);
  const [success, setSuccess] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const config = PREVIEW_MODES[mode];
  const effectiveTarget = config.palette.includes(target) ? target : config.palette[0];
  const motion: Motion = config.rising && !osReduced && !still ? "rising" : "static";
  const remaining = Math.max(0, config.goalTotal - goalDone);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  // When the goal bar fills, hold it briefly, then loop so the preview never dead-ends.
  useEffect(() => {
    if (goalDone < config.goalTotal) return;
    const t = setTimeout(() => setGoalDone(0), GOAL_HOLD_MS);
    return () => clearTimeout(t);
  }, [goalDone, config.goalTotal]);

  const changeMode = (next: PreviewMode) => {
    setMode(next);
    setGoalDone(0);
    setSuccess(0);
    setNonce((n) => n + 1);
  };

  const handlePop = (isTarget: boolean) => {
    if (!isTarget) return; // any balloon pops, but only the requested colour counts — and nothing is ever deducted
    setGoalDone((g) => Math.min(g + 1, config.goalTotal));
    setSuccess((s) => s + 1);
    later(() => setSuccess(0), SUCCESS_MS);
  };

  return (
    <div className="bq3-page">
      <BalloonDefs />
      <div className={`bq3-stage${still ? " bq3-force-still" : ""}`} data-mode={mode} data-motion={motion} style={{ fontFamily: "var(--font-balloon-quest), system-ui, sans-serif" }}>
        <SkyBackdrop />

        {mounted && (
          <PreviewField
            key={`${mode}-${motion}-${nonce}`}
            config={config}
            motion={motion}
            seed={11 + nonce * 17}
            target={effectiveTarget}
            remaining={remaining}
            symbols={symbols}
            onPop={handlePop}
          />
        )}

        <PreviewHud config={config} target={effectiveTarget} stage={stage} goalDone={goalDone} showSymbols={symbols} />

        {success > 0 && (
          <div key={success} className="bq3-success" dir="rtl" role="status">
            <span aria-hidden="true">★</span> أحسنت!
          </div>
        )}
      </div>

      {showPanel && (
        <aside className="bq3-panel" dir="ltr" aria-label="Development preview controls">
          <button type="button" className="bq3-panel-toggle" onClick={() => setPanelOpen((o) => !o)}>
            DEV PREVIEW {panelOpen ? "–" : "+"}
          </button>
          {panelOpen && (
            <div className="bq3-panel-body">
              <p className="bq3-panel-note">Visual preview only — not gameplay. No scoring, sync or sensors. Popped balloons do not return; new ones keep arriving.</p>
              <div className="bq3-row">
                {PREVIEW_MODE_ORDER.map((m) => (
                  <button key={m} type="button" aria-pressed={m === mode} onClick={() => changeMode(m)}>
                    {PREVIEW_MODES[m].labelEn}
                  </button>
                ))}
              </div>
              <div className="bq3-row">
                {([1, 2, 3] as const).map((n) => (
                  <button key={n} type="button" aria-pressed={n === stage} onClick={() => setStage(n)}>
                    Stage {n}
                  </button>
                ))}
              </div>
              <label className="bq3-row">
                Target
                <select value={effectiveTarget} onChange={(e) => setTarget(e.target.value as PreviewColor)}>
                  {config.palette.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bq3-row">
                <input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} /> Shape cues
              </label>
              <label className="bq3-row">
                <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> Force reduced motion
              </label>
              <button
                type="button"
                onClick={() => {
                  setGoalDone(0);
                  setNonce((n) => n + 1);
                }}
              >
                Reset
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
