"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { noopDisplayEventListener } from "@/components/display/events";
import { FootstepsPlayingScene } from "@/components/display/footsteps/scenes/FootstepsPlayingScene";
import {
  Difficulty,
  GameState,
  PathStyle,
  PathWidth,
  StepLength,
  applyFootstepsGameTransition,
  confirmCurrentFootstep,
  createFootstepsSession,
  type FootstepsSessionState,
} from "@/lib/footsteps";
import { SensorHandCursor } from "./SensorHandCursor";
import { SensorPlayPage } from "./SensorPlayPage";
import { useSensorPointerTargets } from "./useSensorPointerTargets";
import { useSensorRuntime } from "./SensorRuntimeProvider";

/** No explicit size field on Footprint (unlike Balloon/food-choice) — a generous fixed radius matching this app's other touch-target scale (roughly what "large" balloons/food choices render at). */
const CURRENT_FOOTPRINT_HIT_RADIUS = 0.09;

function createPlayingDemo(): FootstepsSessionState {
  let state = createFootstepsSession({
    childFirstName: "اختبار الحساس",
    difficulty: Difficulty.EASY,
    stepLength: StepLength.LONG,
    pathStyle: PathStyle.STRAIGHT,
    pathWidth: PathWidth.WIDE,
    seed: "footsteps-sensor-contact-diagnostic",
  });
  for (const next of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    state = applyFootstepsGameTransition(state, next, Date.now()).state;
  }
  return state;
}

/**
 * Real Follow the Footsteps engine (lib/footsteps) + real display scene
 * (FootstepsPlayingScene), driven by the shared sensor pointer. Only ever
 * ONE spatial target at a time (the engine's own "one target at a time"
 * design — see FootstepsPlayingScene's doc comment), and its canonical
 * action confirmCurrentFootstep takes no target id at all — so the pointer
 * only ever needs to ask "is it inside the one active footprint," never
 * disambiguate between several.
 *
 * Local practice session, same scope caveat as the other sensor-play
 * routes: real scoring/progression/stage-complete, not the production
 * Firebase-backed patient session/history/realtime flow.
 */
export function FollowFootstepsSensorContactDemo() {
  const { pointer, connected } = useSensorRuntime();
  const [session, setSession] = useState<FootstepsSessionState>(createPlayingDemo);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const stage = session.currentStage;
  const currentFootprint = stage.footprints.find((footprint) => footprint.index === stage.currentIndex) ?? null;

  const targets = useMemo(
    () => (currentFootprint ? [{ id: currentFootprint.id, x: currentFootprint.position.x, y: currentFootprint.position.y, radius: CURRENT_FOOTPRINT_HIT_RADIUS }] : []),
    [currentFootprint],
  );

  const active = session.gameState === GameState.PLAYING;
  const { contactCount } = useSensorPointerTargets(
    targets,
    () => {
      const result = confirmCurrentFootstep(sessionRef.current, Date.now());
      setSession(result.state);
    },
    active,
  );

  function reset(): void {
    setSession(createPlayingDemo());
  }

  return (
    <SensorPlayPage eyebrow="RIGHT_HAND · تجربة حساس" title="اتبع الخطوات — تحكم بالحساس">
      {() => (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">التلامس يستدعي confirmCurrentFootstep الحقيقية.</p>
            <button type="button" onClick={reset} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">إعادة الاختبار</button>
          </div>
          <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-950 to-purple-900">
            <FootstepsPlayingScene stage={stage} onEvent={noopDisplayEventListener} />
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
