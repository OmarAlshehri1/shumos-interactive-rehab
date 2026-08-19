"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CHASE_COLOR_LABELS_AR,
  colorChasePhaseOwnsTargetVoice,
  createColorChaseVoiceEventGate,
  emitColorChaseTargetOnce,
  GameState,
  type ChaseColor,
  type ColorChaseSessionState,
  type ColorChaseVoiceEventGate,
  type PadId,
} from "@/lib/colorchase";
import type { DisplayEventListener } from "../events";
import { CountdownScene } from "../scenes/CountdownScene";
import { ColorPadGrid } from "../colorchase/ColorPadGrid";
import { CHASE_COLOR_HEX } from "../colorchase/colorPalette";
import { FINAL_ACTION_FAILSAFE_MS, useStageCompletionPresentation } from "../useStageCompletionPresentation";

export interface ColorChaseDisplayProps {
  session: ColorChaseSessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  onSelectBalloon: (id: string) => void;
  onStageCompleteDone: () => void;
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  celebrationReplayToken: string | null;
}

export function ColorChaseDisplay(props: ColorChaseDisplayProps) {
  const { session } = props;
  const stage = session.currentStage;
  const { holdingFinalAction, finishFinalAction } = useStageCompletionPresentation(
    session.gameState,
    `${stage.difficulty}:${stage.stageNumber}:${stage.startedAt ?? "idle"}`,
    FINAL_ACTION_FAILSAFE_MS.colorChase,
  );
  const showPlaying = session.gameState === GameState.PLAYING || holdingFinalAction;
  return (
    <AnimatePresence mode="wait">
      {session.gameState === GameState.WELCOME && <Scene key="welcome"><WelcomeScene childName={session.config.childFirstName} onEvent={props.onEvent} onStart={props.onWelcomeStart} /></Scene>}
      {session.gameState === GameState.START_ZONE && <Scene key={`ready-${session.currentStage.stageNumber}`}><ReadyScene onEvent={props.onEvent} first={session.currentStage.stageNumber === session.config.startingStage && session.results.length === 0} /></Scene>}
      {session.gameState === GameState.INSTRUCTIONS && <Scene key={`instructions-${session.currentStage.stageNumber}`}><InstructionsScene session={session} onEvent={props.onEvent} /></Scene>}
      {session.gameState === GameState.COUNTDOWN && <Scene key="countdown"><CountdownScene onComplete={props.onCountdownComplete} onEvent={props.onEvent} speakCountdownTick={props.speakCountdownTick} /></Scene>}
      {showPlaying && <Scene key={`playing-${session.currentStage.stageNumber}`}><PlayingScene session={session} onEvent={props.onEvent} externalSignal={props.externalIncorrectSignal} onFinalActionSettled={finishFinalAction} /></Scene>}
      {session.gameState === GameState.STAGE_COMPLETE && !holdingFinalAction && <Scene key={`complete-${session.currentStage.stageNumber}`}><StageCompleteScene session={session} onEvent={props.onEvent} /></Scene>}
      {session.gameState === GameState.SESSION_COMPLETE && session.summary && <Scene key={`summary-${props.celebrationReplayToken ?? "initial"}`}><SessionCompleteScene session={session} onEvent={props.onEvent} /></Scene>}
    </AnimatePresence>
  );
}

function Scene({ children }: { children: React.ReactNode }) {
  return <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>{children}</motion.div>;
}

function useVoiceEventGate(): ColorChaseVoiceEventGate {
  const [gate] = useState(createColorChaseVoiceEventGate);
  return gate;
}

function WelcomeScene({ childName, onEvent, onStart }: { childName: string; onEvent: DisplayEventListener; onStart: () => void }) {
  const voiceGate = useVoiceEventGate();
  useEffect(() => {
    if (!voiceGate.claim("welcome")) return;
    onEvent({ type: "color_chase_welcome", timestamp: Date.now(), childName });
  }, [childName, onEvent, voiceGate]);
  return (
    <button type="button" onClick={onStart} className="absolute inset-0 flex flex-col items-center justify-center gap-[2.6vmin] text-white">
      <motion.div className="grid w-[30vmin] grid-cols-3 gap-[1.2vmin]" initial={{ rotateX: 45, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ duration: 0.8 }}>
        {Object.values(CHASE_COLOR_HEX).slice(0, 6).map((color) => <span key={color} className="aspect-square rounded-[1.4vmin] border border-white/30" style={{ background: color, boxShadow: `0 0 2vmin ${color}` }} />)}
      </motion.div>
      <span className="text-[2vmin] font-bold tracking-[.32em] text-cyan-200">COLOR CHASE</span>
      <h1 className="text-[8vmin] font-extrabold">مطاردة الألوان</h1>
      <p className="text-[3.1vmin] font-semibold text-indigo-100">اتبع الألوان واجمعها!</p>
      <span className="mt-[2vmin] rounded-full border border-white/25 bg-white/10 px-[4vmin] py-[1.4vmin] text-[2.3vmin] font-bold">ابدأ المغامرة</span>
    </button>
  );
}

function ReadyScene({ onEvent, first }: { onEvent: DisplayEventListener; first: boolean }) {
  const voiceGate = useVoiceEventGate();
  useEffect(() => {
    if (!voiceGate.claim("ready")) return;
    onEvent({ type: "color_chase_ready", timestamp: Date.now(), isFirstStage: first });
  }, [first, onEvent, voiceGate]);
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3vmin] text-white"><StartZone /><h2 className="rounded-full bg-slate-950/45 px-[5vmin] py-[1.8vmin] text-[4vmin] font-extrabold">قف في منطقة البداية</h2></div>;
}

function StartZone() {
  return <motion.div className="relative h-[25vmin] w-[25vmin] rounded-[4vmin] border-[.7vmin] border-cyan-200 bg-cyan-400/20 shadow-[0_0_6vmin_rgba(34,211,238,.55)]" animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 2.2, repeat: Infinity }}><span className="absolute inset-0 flex items-center justify-center text-[8vmin] text-cyan-100">◎</span></motion.div>;
}

function InstructionsScene({ session, onEvent }: { session: ColorChaseSessionState; onEvent: DisplayEventListener }) {
  const plan = session.currentStage.plan;
  const voiceGate = useVoiceEventGate();
  useEffect(() => {
    if (!voiceGate.claim(`instruction:${plan.difficulty}:${plan.stageNumber}`)) return;
    onEvent({ type: "color_chase_instruction", timestamp: Date.now(), instruction: plan.instructionAr });
  }, [onEvent, plan.difficulty, plan.instructionAr, plan.stageNumber, voiceGate]);
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4vmin] text-center text-white"><span className="text-[2.2vmin] font-bold tracking-[.24em] text-indigo-200">COLOR MISSION</span><h2 className="text-[6vmin] font-extrabold">{plan.instructionAr}</h2><SequenceBar session={session} large /></div>;
}

function PlayingScene({ session, onEvent, externalSignal, onFinalActionSettled }: { session: ColorChaseSessionState; onEvent: DisplayEventListener; externalSignal: { balloonId: string; token: number } | null; onFinalActionSettled: () => void }) {
  const stage = session.currentStage;
  const current = stage.plan.steps[stage.currentStepIndex] ?? null;
  const currentTargetColor = current?.targetColor ?? null;
  const previousIndex = useRef(stage.currentStepIndex);
  const previousIncorrect = useRef(stage.incorrectCount);
  const previousDanger = useRef(stage.dangerPressCount);
  const [successPad, setSuccessPad] = useState<PadId | null>(null);
  const [successColor, setSuccessColor] = useState<ChaseColor | null>(null);
  const [finalSuccess, setFinalSuccess] = useState(false);
  const [feedbackPad, setFeedbackPad] = useState<{ padId: PadId; kind: "wrong" | "danger"; token: number } | null>(null);
  const voiceGate = useVoiceEventGate();

  useEffect(() => {
    onEvent({ type: "color_chase_ambience_start", timestamp: Date.now() });
    return () => onEvent({ type: "color_chase_ambience_stop", timestamp: Date.now() });
  }, [onEvent]);
  useEffect(() => {
    if (!currentTargetColor || !colorChasePhaseOwnsTargetVoice(session.gameState)) return;
    emitColorChaseTargetOnce({
      gate: voiceGate,
      difficulty: stage.difficulty,
      stageNumber: stage.stageNumber,
      stageStartedAt: stage.startedAt,
      stepIndex: stage.currentStepIndex,
      emit: () => {
        onEvent({ type: "color_chase_pad_activation", timestamp: Date.now() });
        onEvent({ type: "color_chase_target", timestamp: Date.now(), color: currentTargetColor });
      },
    });
  }, [currentTargetColor, onEvent, session.gameState, stage.currentStepIndex, stage.difficulty, stage.stageNumber, stage.startedAt, voiceGate]);
  useEffect(() => {
    if (stage.currentStepIndex > previousIndex.current) {
      const padId = stage.plan.steps[stage.currentStepIndex - 1].correctPadId;
      const isFinal = stage.currentStepIndex >= stage.plan.steps.length;
      setSuccessPad(padId);
      setSuccessColor(stage.plan.steps[stage.currentStepIndex - 1].targetColor);
      setFinalSuccess(isFinal);
      onEvent({ type: "color_chase_correct", timestamp: Date.now(), padId, combo: stage.correctCount, final: isFinal });
      const timer = window.setTimeout(() => {
        setSuccessPad(null);
        setSuccessColor(null);
        setFinalSuccess(false);
        if (isFinal) onFinalActionSettled();
      }, isFinal ? 1_000 : 850);
      previousIndex.current = stage.currentStepIndex;
      return () => window.clearTimeout(timer);
    }
    previousIndex.current = stage.currentStepIndex;
  }, [stage.currentStepIndex, stage.correctCount, stage.plan.steps, onEvent, onFinalActionSettled]);
  useEffect(() => {
    if (stage.incorrectCount > previousIncorrect.current && externalSignal) {
      setFeedbackPad({ padId: externalSignal.balloonId as PadId, kind: "wrong", token: externalSignal.token });
      onEvent({ type: "color_chase_incorrect", timestamp: Date.now() });
    }
    if (stage.dangerPressCount > previousDanger.current && externalSignal) {
      setFeedbackPad({ padId: externalSignal.balloonId as PadId, kind: "danger", token: externalSignal.token });
      onEvent({ type: "color_chase_danger", timestamp: Date.now() });
    }
    previousIncorrect.current = stage.incorrectCount;
    previousDanger.current = stage.dangerPressCount;
  }, [stage.incorrectCount, stage.dangerPressCount, externalSignal, onEvent]);
  useEffect(() => { if (stage.pausedAt !== null) onEvent({ type: "paused", timestamp: Date.now() }); }, [stage.pausedAt, onEvent]);

  return (
    <div className="absolute inset-0 text-white">
      <header className="absolute inset-x-0 top-[3%] z-10 flex flex-col items-center gap-[1.2vmin]">
        <h2 className="rounded-full border border-white/15 bg-slate-950/55 px-[4vmin] py-[1.2vmin] text-[3.1vmin] font-extrabold shadow-xl">{current ? `ابحث عن ${CHASE_COLOR_LABELS_AR[current.targetColor]}` : "أحسنت!"}</h2>
        <SequenceBar session={session} />
      </header>
      <ColorPadGrid stage={stage} successPad={successPad} successColor={successColor} finalSuccess={finalSuccess} feedbackPad={feedbackPad} />
      {stage.pausedAt !== null && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-sm"><span className="text-[9vmin]">⏸</span><span className="text-[3vmin] font-bold">توقف مؤقت</span></div>}
    </div>
  );
}

function SequenceBar({ session, large = false }: { session: ColorChaseSessionState; large?: boolean }) {
  const stage = session.currentStage;
  return (
    <div className="flex max-w-[82%] flex-wrap justify-center gap-[1.1vmin] rounded-full bg-slate-950/35 px-[2.5vmin] py-[1vmin]">
      {stage.plan.steps.map((step, index) => (
        <span
          key={index}
          className={`${large ? "h-[5.5vmin] w-[5.5vmin]" : "h-[2.8vmin] w-[2.8vmin]"} rounded-full border-2 transition-all`}
          style={{
            background: CHASE_COLOR_HEX[step.targetColor],
            opacity: index < stage.currentStepIndex ? 0.35 : 1,
            borderColor: index === stage.currentStepIndex ? "white" : "transparent",
            boxShadow: index === stage.currentStepIndex ? `0 0 2vmin ${CHASE_COLOR_HEX[step.targetColor]}` : "none",
          }}
        />
      ))}
    </div>
  );
}

function StageCompleteScene({ session, onEvent }: { session: ColorChaseSessionState; onEvent: DisplayEventListener }) {
  const stageNumber = session.currentStage.stageNumber;
  const childName = session.config.childFirstName;
  const voiceGate = useVoiceEventGate();
  useEffect(() => {
    if (!voiceGate.claim(`stage-complete:${stageNumber}`)) return;
    onEvent({ type: "color_chase_stage_complete", timestamp: Date.now(), childName, stageNumber });
  }, [childName, onEvent, stageNumber, voiceGate]);
  return <div className="absolute inset-0"><div className="absolute inset-0 opacity-55"><ColorPadGrid stage={session.currentStage} successPad={null} feedbackPad={null} /></div><Celebration title="أحسنت!" subtitle={`أكملت المرحلة ${stageNumber}`} /></div>;
}

function SessionCompleteScene({ session, onEvent }: { session: ColorChaseSessionState; onEvent: DisplayEventListener }) {
  const voiceGate = useVoiceEventGate();
  useEffect(() => {
    if (!voiceGate.claim("session-complete")) return;
    onEvent({ type: "color_chase_session_complete", timestamp: Date.now(), childName: session.config.childFirstName });
  }, [session.config.childFirstName, onEvent, voiceGate]);
  return <Celebration title={`رائع يا ${session.config.childFirstName}!`} subtitle="اكتملت مطاردة الألوان" />;
}

function Celebration({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2vmin] overflow-hidden text-white">{Object.values(CHASE_COLOR_HEX).map((color, index) => <motion.span key={color} className="absolute h-[8vmin] w-[8vmin] rounded-[2vmin]" style={{ background: color, left: `${10 + index * 16}%`, top: `${22 + (index % 2) * 42}%`, boxShadow: `0 0 5vmin ${color}` }} animate={{ scale: [0.7, 1.25, 0.8], rotate: [0, 15, -8] }} transition={{ duration: 1.8 + index * .15, repeat: Infinity }} />)}<motion.h2 className="z-10 text-[8vmin] font-extrabold" initial={{ scale: .7 }} animate={{ scale: 1 }}>{title}</motion.h2><p className="z-10 text-[3.2vmin] font-bold text-indigo-100">{subtitle}</p></div>;
}
