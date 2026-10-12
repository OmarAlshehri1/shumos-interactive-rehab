"use client";

import { useEffect, useRef, useState } from "react";
import { SOURCE_AR } from "@/lib/balloonquest/arabic";
import type { ControlRuntime } from "@/lib/balloonquest/controlRuntime";
import { SimulatedPointer } from "@/lib/balloonquest/input/simulated";
import type { SourceId } from "@/lib/balloonquest/types";

const SOURCES: SourceId[] = ["RIGHT_HAND", "LEFT_HAND", "RIGHT_FOOT", "LEFT_FOOT", "HANDHELD"];

/**
 * DEVELOPMENT SIMULATOR. A mouse-driven stand-in for any pointer source so the
 * input modes can be exercised without hardware. It is NOT a sensor, never
 * claims hardware compatibility, and exists only on the experimental route.
 */
export function SimulatorPad({ runtime }: { runtime: ControlRuntime }) {
  const [source, setSource] = useState<SourceId>("RIGHT_HAND");
  const [streaming, setStreaming] = useState(true);
  const sims = useRef(new Map<SourceId, SimulatedPointer>());
  const streamingRef = useRef(streaming);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  const get = (id: SourceId) => {
    let s = sims.current.get(id);
    if (!s) {
      s = new SimulatedPointer(id, () => performance.now());
      s.start((sample) => runtime.ingestPointer(sample));
      sims.current.set(id, s);
    }
    return s;
  };

  // A steady stream while a simulated source is "tracking", like a real sensor at a fixed rate.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (streamingRef.current) for (const s of sims.current.values()) s.heartbeat();
    }, 50);
    const map = sims.current;
    return () => {
      window.clearInterval(timer);
      for (const s of map.values()) s.stop();
      map.clear();
    };
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    get(source).moveTo(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm" aria-label="محاكي الإدخال">
      <p className="font-bold text-amber-900">محاكاة تطويرية — ليست حساسًا حقيقيًا</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-amber-300 bg-white p-1.5" value={source} onChange={(e) => setSource(e.target.value as SourceId)} aria-label="مصدر المحاكاة" data-testid="sim-source">
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_AR[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} data-testid="sim-stream" /> بث مستمر
        </label>
        <button type="button" className="rounded-lg bg-amber-200 px-2 py-1" onClick={() => get(source).hide()} data-testid="sim-hide">
          إخفاء المؤشر
        </button>
      </div>
      <div className="mt-2 aspect-video w-full cursor-crosshair touch-none rounded-xl bg-white shadow-inner" onPointerMove={onMove} onPointerDown={onMove} data-testid="sim-pad" />
    </section>
  );
}
