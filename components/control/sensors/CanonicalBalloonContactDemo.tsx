"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BalloonField } from "@/components/display/balloon/BalloonField";
import {
  Difficulty,
  GameState,
  PlayArea,
  TargetSize,
  TargetSpacing,
  applyGameTransition,
  createSession,
  selectBalloon,
  type SessionState,
} from "@/lib/game";
import type { NormalizedPointer } from "@/lib/physicalInput";
import { SensorHandCursor } from "./SensorHandCursor";
import { useContactTargets } from "./useSensorPointerTargets";

function createPlayingDemo(): SessionState {
  const startedAt = Date.now();
  let state = createSession({
    childFirstName: "اختبار الحساس",
    difficulty: Difficulty.EASY,
    targetSize: TargetSize.LARGE,
    targetSpacing: TargetSpacing.WIDE,
    playArea: PlayArea.FULL,
    seed: "right-hand-contact-diagnostic",
    now: startedAt,
  });
  for (const next of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    state = applyGameTransition(state, next, Date.now()).state;
  }
  return state;
}

/**
 * Real Balloon Quest engine (lib/game) + real display component
 * (BalloonField), driven by whichever pointer/connected the caller passes
 * in — via useContactTargets, the runtime-agnostic core (see its doc
 * comment for why this stays prop-based rather than reading
 * SensorRuntimeProvider's context directly: SensorHandDemoScreen.tsx reuses
 * this same component against its own independent, diagnostic-config
 * controller instance, not the shared play runtime).
 *
 * This session is a local practice session (not the production
 * Firebase-backed patient session/history/realtime flow — see
 * RightHandBalloonPlayable's route doc comment), so scoring, progression,
 * and stage-complete are all real engine behavior; therapist remote control
 * and session history are simply not part of this route.
 */
export function CanonicalBalloonContactDemo({ pointer, connected }: { pointer: NormalizedPointer | null; connected: boolean }) {
  const [session, setSession] = useState<SessionState>(createPlayingDemo);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const targets = useMemo(
    () => session.currentStage.balloons.map((balloon) => ({
      id: balloon.id,
      x: balloon.position.x,
      y: balloon.position.y,
      radius: balloon.size / 2,
      enabled: !balloon.isPopped,
    })),
    [session.currentStage.balloons],
  );

  const { contactCount } = useContactTargets(
    pointer,
    connected,
    targets,
    (targetId) => {
      const result = selectBalloon(sessionRef.current, targetId, Date.now());
      setSession(result.state);
    },
    session.gameState === GameState.PLAYING,
  );

  function therapistSelect(balloonId: string): void {
    const result = selectBalloon(sessionRef.current, balloonId, Date.now());
    setSession(result.state);
  }

  function reset(): void {
    setSession(createPlayingDemo());
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">مغامرة البالونات — تحكم بالحساس</h2>
          <p className="mt-1 text-xs text-slate-500">التلامس يستدعي selectBalloon بالمعرّف الحقيقي؛ ويمكنك النقر كبديل للمعالج.</p>
        </div>
        <button type="button" onClick={reset} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">إعادة الاختبار</button>
      </div>
      <div className="relative aspect-[16/9] min-h-[300px] overflow-hidden rounded-2xl bg-gradient-to-b from-violet-100 to-amber-50">
        <BalloonField
          balloons={session.currentStage.balloons}
          incorrectSignal={null}
          onSelect={therapistSelect}
        />
        <SensorHandCursor pointer={pointer?.pointer ?? null} visible={connected && !!pointer} />
        {session.gameState === GameState.STAGE_COMPLETE && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-emerald-950/25">
            <span className="rounded-full bg-white px-6 py-3 text-xl font-black text-emerald-700 shadow-xl">اكتمل الاختبار ✓</span>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
        <span className="rounded-full bg-slate-100 px-3 py-1.5">تلامسات الحساس: {contactCount}</span>
      </div>
    </section>
  );
}
