"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_NAME_AR } from "@/lib/runnerquest3d/arabic";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import { frameFromState, planFor } from "./frame";
import { Hud } from "./Hud";
import { FloorView } from "./floor/FloorView";
import { RunnerQuest3DCanvas } from "./RunnerQuest3DCanvas";
import type { Quality, SceneFrame, SceneStageInput } from "./scene/types";
import styles from "./runner.module.css";

/** Where the authoritative distance/speed come from (local channel replica, Firebase replica, or the preview runtime). */
export interface MotionSource {
  distance(): number;
  speed(): number;
}

export interface ViewProps {
  state: DisplayState | null;
  silent: boolean;
  source: MotionSource;
  quality: Quality;
  autoQuality: boolean;
  diagnostics: boolean;
  /** `embedded`: sits inside the production DisplayScreen (no waiting card of its own when there is no state). */
  waitingText?: string | null;
}

/**
 * Child-facing renderer for ONE authoritative DisplayState. Pure presentation: it never scores, selects or
 * writes. Shared by the local-channel Display, the preview and the production (Firebase) Display.
 */
export function RunnerQuest3DView(props: ViewProps) {
  // The projection is fixed by Control before the session starts; the FLOOR journey has its own camera, layout and HUD.
  if (props.state?.projection === "FLOOR" && props.state.floor) return <FloorView state={props.state} silent={props.silent} quality={props.quality} autoQuality={props.autoQuality} diagnostics={props.diagnostics} />;
  return <WallView {...props} />;
}

function WallView({ state, silent, source, quality: initialQuality, autoQuality, diagnostics, waitingText = "بانتظار المعالج…" }: ViewProps) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [fatal, setFatal] = useState<string | null>(null);
  const [diag, setDiag] = useState("");
  const stateRef = useRef<DisplayState | null>(state);
  const sourceRef = useRef(source);
  const shown = useRef({ d: 0, key: "" });
  const lastT = useRef(0);
  useEffect(() => { stateRef.current = state; sourceRef.current = source; });

  const plan = useMemo(() => (state ? planFor(state) : null), [state?.stageIndex, state?.seed, state?.spacingUsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = useMemo<SceneStageInput | null>(() => (plan ? { spec: plan.spec, encounters: plan.encounters, length: plan.length } : null), [plan]);

  const getFrame = useCallback((): SceneFrame | null => {
    const s = stateRef.current;
    if (!s) return null;
    const now = performance.now();
    const dt = lastT.current ? Math.min(0.1, (now - lastT.current) / 1000) : 0.016;
    lastT.current = now;
    const key = `${s.stageIndex}|${s.seed}|${s.spacingUsed}`;
    const target = sourceRef.current.distance();
    const speed = sourceRef.current.speed();
    const sh = shown.current;
    if (sh.key !== key || target < sh.d - 0.5 || Math.abs(target - sh.d) > 6) { sh.d = target; sh.key = key; }
    else sh.d += (target - sh.d) * (1 - Math.exp(-14 * dt));
    return frameFromState(s, sh.d, speed);
  }, []);
  const getDistance = useCallback(() => shown.current.d, []);

  useEffect(() => {
    if (!diagnostics) return;
    const id = window.setInterval(() => {
      const st = window.__RQ3D?.stats();
      if (st) setDiag(`${st.fps.toFixed(0)} fps · ${st.frameMsAvg.toFixed(1)}ms (max ${st.frameMsMax.toFixed(0)}) · ${st.drawCalls} calls · ${(st.triangles / 1000).toFixed(0)}k tris · ${st.quality} · dpr ${st.pixelRatio}`);
    }, 500);
    return () => window.clearInterval(id);
  }, [diagnostics]);

  return (
    <div className={`${styles.root} ${state?.reducedMotion ? styles.reduced : ""}`} dir="rtl" lang="ar" data-testid="rq3d-display" data-lifecycle={state?.lifecycle ?? "none"} data-projection="WALL" data-stage={state?.stageIndex ?? 0} data-laneseq={state?.laneSeq ?? 0} data-stars={state?.stars ?? 0}>
      <RunnerQuest3DCanvas stage={stage} reducedMotion={state?.reducedMotion ?? false} quality={quality} autoQuality={autoQuality} getFrame={getFrame}
        onStatus={(st, detail) => { if (st === "error") setFatal(detail ?? "WebGL"); if (st === "context-lost") setFatal("context-lost"); }} onQuality={setQuality} />
      {state && <Hud state={state} getDistance={getDistance} silent={silent} />}
      {!state && waitingText && (
        <div className={styles.overlay}><div className={`${styles.big} ${styles.pop}`}><div className={styles.bigTitle}>{GAME_NAME_AR}</div><div className={styles.bigText}>{waitingText}</div></div></div>
      )}
      {fatal && <div className={styles.err}><div>تعذّر عرض المشهد ثلاثي الأبعاد.<br />يرجى إعادة تحميل الصفحة أو استخدام متصفح حديث.</div></div>}
      {diagnostics && <div className={styles.dev}>{diag}</div>}
    </div>
  );
}
