"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mountDisplay, type DisplayHandle } from "@/lib/balloonquest/displayMount";
import type { DisplayState } from "@/lib/balloonquest/protocol";
import { BalloonQuest3DView } from "./BalloonQuest3DView";
import "../preview/balloonQuestPreview.css";
import "./game.css";

/** Child-facing Display for the experimental Balloon Quest 3D. Read-only mirror of Control. */
export function BalloonQuest3DDisplay({ showSymbols = false, embedded = false }: { showSymbols?: boolean; embedded?: boolean }) {
  const [view, setView] = useState<{ state: DisplayState | null; silent: boolean }>({ state: null, silent: false });
  const handle = useRef<DisplayHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const getSimTimeMs = useCallback(() => handle.current?.getSimTimeMs() ?? 0, []);

  useEffect(() => {
    try {
      const h = mountDisplay((state, silent) => setView({ state, silent }));
      handle.current = h;
      return () => {
        handle.current = null;
        h.dispose();
      };
    } catch (e) {
      queueMicrotask(() => setError(e instanceof Error ? e.message : "تعذّر تشغيل شاشة العرض."));
    }
  }, []);
  const { state, silent } = view;

  if (error) return <Frame embedded={embedded}><Card title="تعذّر التشغيل" body={error} /></Frame>;
  if (!state || silent) {
    return (
      <Frame embedded={embedded}>
        <div className="bq3g-overlay bq3g-welcome" dir="rtl">
          <div className="bq3g-card">
            <h1>مغامرة البالونات</h1>
            <p>بانتظار المعالج…</p>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame embedded={embedded}>
      <BalloonQuest3DView state={state} getSimTimeMs={getSimTimeMs} showSymbols={showSymbols} embedded={embedded} />
    </Frame>
  );
}

/** Standalone (prototype route): a full-viewport letterboxed page. Embedded (inside the platform shell's PlayStage): just a fill-parent box. */
function Frame({ children, embedded = false }: { children: React.ReactNode; embedded?: boolean }) {
  return embedded ? (
    <div className="absolute inset-0" data-testid="bq-display">
      {children}
    </div>
  ) : (
    <div className="bq3-page" data-testid="bq-display">
      {children}
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="bq3g-overlay" dir="rtl">
      <div className="bq3g-card">
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </div>
  );
}
