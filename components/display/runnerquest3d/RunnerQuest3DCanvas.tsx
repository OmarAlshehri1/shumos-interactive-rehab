"use client";

import { useEffect, useRef } from "react";
import { RunnerScene } from "./scene/RunnerScene";
import type { Quality, SceneFrame, SceneStageInput, SceneStats } from "./scene/types";

export interface RunnerQuest3DCanvasProps {
  stage: SceneStageInput | null;
  reducedMotion: boolean;
  quality: Quality;
  autoQuality?: boolean;
  /** Called every animation frame; returns what to draw. */
  getFrame: () => SceneFrame | null;
  onStatus?: (s: "ready" | "context-lost" | "error", detail?: string) => void;
  onQuality?: (q: Quality) => void;
}

declare global {
  interface Window { __RQ3D?: { stats(): SceneStats; counts(): { geometries: number; materials: number; textures: number }; setQuality(q: Quality): void; resetFrameStats(): void } }
}

/** Owns one RunnerScene: creates it, drives it from rAF, cleans it up on unmount. */
export function RunnerQuest3DCanvas({ stage, reducedMotion, quality, autoQuality, getFrame, onStatus, onQuality }: RunnerQuest3DCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<RunnerScene | null>(null);
  const getFrameRef = useRef(getFrame);
  const stageRef = useRef(stage);
  const reducedRef = useRef(reducedMotion);
  const statusRef = useRef(onStatus);
  const qualityCb = useRef(onQuality);
  useEffect(() => { getFrameRef.current = getFrame; statusRef.current = onStatus; qualityCb.current = onQuality; stageRef.current = stage; reducedRef.current = reducedMotion; });

  useEffect(() => {
    // A fresh canvas per mount: a canvas whose context was force-lost (StrictMode remount, route change) cannot be reused.
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "مشهد ثلاثي الأبعاد للعبة مغامرة العدّاء");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);
    let scene: RunnerScene;
    try {
      scene = new RunnerScene(canvas, { quality, autoQuality, onContextLost: () => statusRef.current?.("context-lost"), onQualityChange: (q) => qualityCb.current?.(q) });
    } catch (e) {
      queueMicrotask(() => statusRef.current?.("error", e instanceof Error ? e.message : "WebGL"));
      canvas.remove();
      return;
    }
    sceneRef.current = scene;
    if (process.env.NODE_ENV === "development") window.__RQ3D = { stats: () => scene.stats(), counts: () => scene.resourceCounts(), setQuality: (q) => scene.setQuality(q), resetFrameStats: () => scene.resetFrameStats() };
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    let frame = 0, stopped = false, lastStage: SceneStageInput | null = null;
    const loop = (now: number) => {
      if (stopped) return;
      const st = stageRef.current;
      if (st && st !== lastStage) { scene.setStage(st, reducedRef.current); lastStage = st; statusRef.current?.("ready"); }
      const f = getFrameRef.current();
      if (f && st) scene.render(f, now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      scene.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (process.env.NODE_ENV === "development") delete window.__RQ3D;
    };
    // The scene is created once per mount; quality changes go through setQuality below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneRef.current?.setQuality(quality); }, [quality]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
