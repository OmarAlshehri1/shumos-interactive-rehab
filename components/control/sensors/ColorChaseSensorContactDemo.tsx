"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ColorChaseEnvironment } from "@/components/display/colorchase/ColorChaseEnvironment";
import { ColorPadGrid } from "@/components/display/colorchase/ColorPadGrid";
import {
  Difficulty,
  GameState,
  PAD_IDS,
  applyColorChaseTransition,
  confirmColorChasePad,
  createColorChaseSession,
  type ColorChaseSessionState,
} from "@/lib/colorchase";
import { SensorHandCursor } from "./SensorHandCursor";
import { SensorPlayPage } from "./SensorPlayPage";
import { useSensorPointerTargets } from "./useSensorPointerTargets";
import { useSensorRuntime } from "./SensorRuntimeProvider";

/**
 * Mirrors ColorPadGrid.tsx's own fixed layout region exactly
 * (`inset-x-[14%] top-[21%] bottom-[16%] grid grid-cols-3`) so the sensor's
 * hit-test lines up with the real rendered 3x3 pad grid — not a layout
 * invented for this demo.
 */
const GRID_X0 = 0.14;
const GRID_X1 = 0.86;
const GRID_Y0 = 0.21;
const GRID_Y1 = 0.84;
const PAD_HIT_RADIUS = 0.09;

function padPosition(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: GRID_X0 + ((col + 0.5) / 3) * (GRID_X1 - GRID_X0),
    y: GRID_Y0 + ((row + 0.5) / 3) * (GRID_Y1 - GRID_Y0),
  };
}

function createPlayingDemo(): ColorChaseSessionState {
  let state = createColorChaseSession({
    childFirstName: "اختبار الحساس",
    difficulty: Difficulty.EASY,
    seed: "colorchase-sensor-contact-diagnostic",
  });
  for (const next of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    state = applyColorChaseTransition(state, next, Date.now()).state;
  }
  return state;
}

let inputCounter = 0;

/**
 * Real Color Chase engine (lib/colorchase) + real display grid
 * (ColorPadGrid), driven by the shared sensor pointer. Fixed 3x3 pad grid —
 * same discrete-zone family as Bubble Pop Wall — confirmColorChasePad is
 * explicitly documented in session.ts as "the canonical controller/sensor
 * boundary," making this the most directly-intended integration of the
 * five games wired up.
 *
 * Skips ColorPadGrid's transient success/wrong-shake feedback props
 * (always passes null/false) — that local diff-state juice belongs to
 * ColorChaseControlScreen's own LiveScreen, not duplicated here; the real
 * engine state (pad colors, danger pads, stage-complete) still drives
 * everything that matters for practice.
 *
 * Local practice session, same scope caveat as the other sensor-play
 * routes: real scoring/progression/stage-complete, not the production
 * Firebase-backed patient session/history/realtime flow.
 */
export function ColorChaseSensorContactDemo() {
  const { pointer, connected } = useSensorRuntime();
  const [session, setSession] = useState<ColorChaseSessionState>(createPlayingDemo);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const stage = session.currentStage;

  const targets = useMemo(
    () => PAD_IDS.map((padId, index) => ({ id: padId, ...padPosition(index), radius: PAD_HIT_RADIUS })),
    [],
  );

  const active = session.gameState === GameState.PLAYING;
  const { contactCount } = useSensorPointerTargets(
    targets,
    (padId) => {
      inputCounter += 1;
      const result = confirmColorChasePad(sessionRef.current, { padId: padId as (typeof PAD_IDS)[number], inputId: `sensor-${Date.now()}-${inputCounter}`, timestamp: Date.now() });
      setSession(result.state);
    },
    active,
  );

  function reset(): void {
    setSession(createPlayingDemo());
  }

  return (
    <SensorPlayPage eyebrow="RIGHT_HAND · تجربة حساس" title="مطاردة الألوان — تحكم بالحساس">
      {() => (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">التلامس يستدعي confirmColorChasePad الحقيقية.</p>
            <button type="button" onClick={reset} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">إعادة الاختبار</button>
          </div>
          <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden rounded-2xl bg-slate-950">
            <ColorChaseEnvironment />
            <ColorPadGrid stage={stage} successPad={null} finalSuccess={false} feedbackPad={null} />
            <SensorHandCursor pointer={pointer?.pointer ?? null} visible={connected && !!pointer} />
            {session.gameState === GameState.STAGE_COMPLETE && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-emerald-950/25">
                <span className="rounded-full bg-white px-6 py-3 text-xl font-black text-emerald-700 shadow-xl">اكتملت المرحلة ✓</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1.5">تلامسات الحساس: {contactCount}</span>
          </div>
        </section>
      )}
    </SensorPlayPage>
  );
}
