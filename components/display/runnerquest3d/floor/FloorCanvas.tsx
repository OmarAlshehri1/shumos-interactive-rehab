"use client";

import { useEffect, useRef } from "react";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import type { Quality, SceneStats } from "../scene/types";
import { FloorScene, type FloorStageInput } from "./FloorScene";

export interface FloorCanvasProps {
  stage: FloorStageInput | null;
  quality: Quality;
  autoQuality?: boolean;
  /** Called every animation frame; returns the authoritative state to draw. */
  getState: () => DisplayState | null;
  onStatus?: (s: "ready" | "context-lost" | "error", detail?: string) => void;
  onQuality?: (q: Quality) => void;
}

declare global {
  interface Window { __RQ3F?: { stats(): SceneStats; counts(): { geometries: number; materials: number; textures: number }; setQuality(q: Quality): void; resetFrameStats(): void } }
}

/** Owns one FloorScene: creates it, drives it from rAF, cleans it up on unmount. */
export function FloorCanvas({ stage, quality, autoQuality, getState, onStatus, onQuality }: FloorCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FloorScene | null>(null);
  const getStateRef = useRef(getState);
  const stageRef = useRef(stage);
  const statusRef = useRef(onStatus);
  const qualityCb = useRef(onQuality);
  useEffect(() => { getStateRef.current = getState; statusRef.current = onStatus; qualityCb.current = onQuality; stageRef.current = stage; });

  useEffect(() => {
    // A fresh canvas per mount: a canvas whose context was force-lost (StrictMode remount, route change) cannot be reused.
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "مشهد ثلاثي الأبعاد للعبة مغامرة العدّاء على الأرض");
    canvas.dataset.testid = "rq3f-canvas";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    host.appendChild(canvas);
    let scene: FloorScene;
    try {
      scene = new FloorScene(canvas, { quality, autoQuality, onContextLost: () => statusRef.current?.("context-lost"), onQualityChange: (q) => qualityCb.current?.(q) });
    } catch (e) {
      queueMicrotask(() => statusRef.current?.("error", e instanceof Error ? e.message : "WebGL"));
      canvas.remove();
      return;
    }
    sceneRef.current = scene;
    if (process.env.NODE_ENV === "development") window.__RQ3F = { stats: () => scene.stats(), counts: () => scene.resourceCounts(), setQuality: (q) => scene.setQuality(q), resetFrameStats: () => scene.resetFrameStats() };
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    let frame = 0, stopped = false, lastStage: FloorStageInput | null = null;
    const loop = (now: number) => {
      if (stopped) return;
      const st = stageRef.current;
      if (st && st !== lastStage) { scene.setStage(st); lastStage = st; statusRef.current?.("ready"); }
      const s = getStateRef.current();
      if (s && st) scene.render(s, now);
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
      if (process.env.NODE_ENV === "development") delete window.__RQ3F;
    };
    // The scene is created once per mount; quality changes go through setQuality below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneRef.current?.setQuality(quality); }, [quality]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}
