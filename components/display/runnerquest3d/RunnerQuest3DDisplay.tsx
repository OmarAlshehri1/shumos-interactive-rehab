"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ControlRuntime } from "@/lib/runnerquest3d/controlRuntime";
import { mountDisplay, type DisplayHandle } from "@/lib/runnerquest3d/displayMount";
import { toDisplayState, type DisplayState } from "@/lib/runnerquest3d/protocol";
import type { TherapistSettings } from "@/lib/runnerquest3d/types";
import { RunnerQuest3DView, type MotionSource } from "./RunnerQuest3DView";
import type { Quality } from "./scene/types";

export interface DisplayOptions {
  quality: Quality;
  autoQuality: boolean;
  /** Local single-window preview: runs a private Control runtime driven by the keyboard (validation aid only). */
  preview: boolean;
  previewStage?: number;
  previewSettings?: Partial<TherapistSettings>;
  /** Draw a small FPS / draw-call readout (development only). */
  diagnostics: boolean;
}

/**
 * Same-computer Display: talks to the Control window over the local BroadcastChannel (no Firebase).
 * Used by the development/local routes. The production, cross-device Display is RunnerQuestLiveDisplay.
 */
export function RunnerQuest3DDisplay({ opts }: { opts: DisplayOptions }) {
  const [state, setState] = useState<DisplayState | null>(null);
  const [silent, setSilent] = useState(false);
  const handle = useRef<DisplayHandle | null>(null);
  const preview = useRef<ControlRuntime | null>(null);
  const stateRef = useRef<DisplayState | null>(null);

  useEffect(() => {
    if (opts.preview) {
      const rt = new ControlRuntime({
        now: () => performance.now(), wall: () => Date.now(), send: () => {}, ownerId: "preview", newId: () => crypto.randomUUID(), seed: 20260610,
        settings: { speed: 3, ...opts.previewSettings }, startIndex: opts.previewStage ?? 0, endIndex: opts.previewStage ?? 8,
      });
      rt.command({ type: "allow-no-display", value: true });
      preview.current = rt;
      if (process.env.NODE_ENV === "development") (window as unknown as { __RQ3D_RT?: ControlRuntime }).__RQ3D_RT = rt;
      let raf = 0;
      const publish = (force = false) => {
        const s = toDisplayState(rt.session);
        if (!s) return;
        const prev = stateRef.current;
        stateRef.current = s;
        if (force || !prev || prev.stageIndex !== s.stageIndex || prev.lifecycle !== s.lifecycle || prev.stars !== s.stars || prev.hint !== s.hint || prev.holding !== s.holding) setState(s);
      };
      const loop = () => { rt.tick(); publish(); raf = requestAnimationFrame(loop); };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === "s") { rt.command(rt.session.lifecycle === "ready" ? { type: "start" } : rt.session.lifecycle === "stage-complete" ? { type: "advance" } : { type: "resume" }); publish(true); return; }
        if (e.key === "p") { rt.command({ type: "pause" }); publish(true); return; }
        const r = rt.key(e.key, e.repeat);
        if (r.accepted) e.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      publish(true);
      raf = requestAnimationFrame(loop);
      return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); preview.current = null; };
    }
    const h = mountDisplay((s, sil) => { stateRef.current = s; setState(s); setSilent(sil); });
    handle.current = h;
    return () => { h.dispose(); handle.current = null; };
  }, [opts.preview, opts.previewStage, opts.previewSettings]);

  const source = useMemo<MotionSource>(() => ({
    distance: () => preview.current?.session.stage?.distance ?? handle.current?.getDistance() ?? stateRef.current?.distance ?? 0,
    speed: () => preview.current?.session.stage?.speed ?? handle.current?.getSpeed() ?? stateRef.current?.speed ?? 0,
  }), []);

  return <RunnerQuest3DView state={state} silent={silent && !opts.preview} source={source} quality={opts.quality} autoQuality={opts.autoQuality} diagnostics={opts.diagnostics} waitingText={opts.preview ? null : "بانتظار المعالج…"} />;
}
