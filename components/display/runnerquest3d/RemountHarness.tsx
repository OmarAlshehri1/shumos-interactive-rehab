"use client";

import { useEffect, useMemo, useState } from "react";
import { generateStage } from "@/lib/runnerquest3d/encounters";
import { RunnerQuest3DCanvas } from "./RunnerQuest3DCanvas";
import type { SceneFrame, SceneStageInput } from "./scene/types";

declare global { interface Window { __RQ3D_HARNESS?: { cycle: number; done: boolean; samples: Array<{ cycle: number; geometries: number; textures: number; materials: number; heap: number }> } } }

/** Development-only: mounts/unmounts the whole renderer repeatedly to prove GPU resources are released. */
export function RemountHarness({ cycles }: { cycles: number }) {
  const [cycle, setCycle] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [plan] = useState(() => generateStage(8, 5, 1));
  const stage = useMemo<SceneStageInput>(() => ({ spec: plan.spec, encounters: plan.encounters, length: plan.length }), [plan]);
  const [t0] = useState(() => performance.now());
  useEffect(() => { window.__RQ3D_HARNESS = { cycle: 0, done: false, samples: [] }; }, []);
  useEffect(() => {
    if (cycle >= cycles) { if (window.__RQ3D_HARNESS) window.__RQ3D_HARNESS.done = true; return; }
    const id = window.setTimeout(() => {
      const c = window.__RQ3D?.counts();
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      if (c && window.__RQ3D_HARNESS) window.__RQ3D_HARNESS.samples.push({ cycle, ...c, heap });
      setMounted(false);
      window.setTimeout(() => { setCycle((n) => n + 1); setMounted(true); }, 120);
    }, 700);
    return () => window.clearTimeout(id);
  }, [cycle, cycles]);
  const getFrame = (): SceneFrame => {
    const d = ((performance.now() - t0) / 1000) * 6 % 200;
    return { distance: d, speed: 3, lane: 0, holding: false, mood: "run", celebrateSeq: 0, stars: 0, armed: [], resolved: [], footLiftRequired: true, reducedMotion: false };
  };
  return <div style={{ position: "fixed", inset: 0 }}>{mounted && <RunnerQuest3DCanvas key={cycle} stage={stage} reducedMotion={false} quality="medium" getFrame={getFrame} />}<div style={{ position: "fixed", top: 4, left: 4, font: "12px monospace" }}>cycle {cycle}/{cycles}</div></div>;
}
