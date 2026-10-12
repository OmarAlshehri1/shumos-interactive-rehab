"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { noopDisplayEventListener } from "@/components/display/events";
import { BubblePopPlayingScene } from "@/components/display/bubblepop/scenes/BubblePopPlayingScene";
import { STATION_SCREEN_Y, stationScreenX } from "@/components/display/bubblepop/stations/stationLayout";
import {
  BubbleSize,
  Difficulty,
  GameState,
  ReachHeight,
  ReachSide,
  TargetMode,
  applyBubblePopGameTransition,
  confirmBubblePopColor,
  createBubblePopSession,
  currentTargetId,
  getBubbleStagePlan,
  type BubblePopSessionState,
} from "@/lib/bubblepop";
import { SensorHandCursor } from "./SensorHandCursor";
import { SensorPlayPage } from "./SensorPlayPage";
import { useSensorPointerTargets } from "./useSensorPointerTargets";
import { useSensorRuntime } from "./SensorRuntimeProvider";

/** Matches StationDock's own rendered pearl size (`min(20vmin, 80/count%)` of a ~24%-tall dock) closely enough for a generous, therapist-safe hit radius. */
const STATION_HIT_RADIUS = 0.09;

function createPlayingDemo(): BubblePopSessionState {
  let state = createBubblePopSession({
    childFirstName: "اختبار الحساس",
    difficulty: Difficulty.EASY,
    bubbleSize: BubbleSize.LARGE,
    reachHeight: ReachHeight.FULL,
    reachSide: ReachSide.FULL,
    targetMode: TargetMode.COLOR_ONLY,
    seed: "bubblepop-sensor-contact-diagnostic",
  });
  for (const next of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    state = applyBubblePopGameTransition(state, next, Date.now()).state;
  }
  return state;
}

/**
 * Real Bubble Pop Wall engine (lib/bubblepop) + real display scene
 * (BubblePopPlayingScene, which already renders the real StationDock),
 * driven by the shared sensor pointer. Stations are a fixed DOCK, not
 * free-floating targets — same discrete-zone family as Color Chase — but
 * still a natural point-and-select fit: each station occupies a real
 * screen position via stationScreenX/STATION_SCREEN_Y, the SAME formula
 * BubblePopPlayingScene's own EnergyPulse effect uses internally (not a
 * layout invented for this demo), so the sensor's hit-test lines up with
 * what is actually drawn.
 *
 * Local practice session, same scope caveat as the other sensor-play
 * routes: real scoring/progression/stage-complete, not the production
 * Firebase-backed patient session/history/realtime flow.
 */
export function BubblePopSensorContactDemo() {
  const { pointer, connected } = useSensorRuntime();
  const [session, setSession] = useState<BubblePopSessionState>(createPlayingDemo);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const stage = session.currentStage;
  const targetId = currentTargetId(stage);
  const target = stage.bubbles.find((bubble) => bubble.id === targetId) ?? null;
  const plan = getBubbleStagePlan(stage.difficulty, stage.stageNumber);

  // Mirrors StationBar.tsx's own item derivation exactly, so the sensor's target set always matches
  // what the real StationDock renders (fixed color palette, or the current mission's shape tokens).
  const stationItems = useMemo(
    () =>
      target?.requiresShape && target.stationTokens.length > 0
        ? target.stationTokens.map((token, index) => ({ key: `${token.color}-${token.shape}-${index}`, color: token.color, shape: token.shape }))
        : plan.stations.map((color) => ({ key: color, color, shape: undefined })),
    [target, plan],
  );

  const targets = useMemo(
    () =>
      stationItems.map((item, index) => ({
        id: item.key,
        x: stationScreenX(index, stationItems.length),
        y: STATION_SCREEN_Y,
        radius: STATION_HIT_RADIUS,
      })),
    [stationItems],
  );

  const active = session.gameState === GameState.PLAYING;
  const { contactCount } = useSensorPointerTargets(
    targets,
    (stationKey) => {
      const item = stationItems.find((candidate) => candidate.key === stationKey);
      if (!item) return;
      const result = confirmBubblePopColor(sessionRef.current, item.color, Date.now(), item.shape);
      setSession(result.state);
    },
    active,
  );

  function reset(): void {
    setSession(createPlayingDemo());
  }

  return (
    <SensorPlayPage eyebrow="RIGHT_HAND · تجربة حساس" title="جدار الفقاعات — تحكم بالحساس">
      {() => (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">التلامس يستدعي confirmBubblePopColor الحقيقية.</p>
            <button type="button" onClick={reset} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">إعادة الاختبار</button>
          </div>
          <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden rounded-2xl bg-gradient-to-b from-sky-950 to-cyan-950">
            <BubblePopPlayingScene stage={stage} childFirstName={session.config.childFirstName} onEvent={noopDisplayEventListener} />
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
