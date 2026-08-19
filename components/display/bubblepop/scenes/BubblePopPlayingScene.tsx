"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { type Bubble, type BubbleColor, currentTargetId, getBubbleStagePlan, type BubblePopStageRuntime, type StationToken } from "@/lib/bubblepop";
import type { DisplayEventListener } from "@/components/display/events";
import { BUBBLE_COLOR_HEX } from "../bubbleColors";
import { bubbleMotionX, elapsedActiveMs } from "../ocean/bubbleMotion";
import { EnergyPulse } from "../ocean/EnergyPulse";
import { MissionPrompt } from "../ocean/MissionPrompt";
import { MovingBubble } from "../ocean/MovingBubble";
import { TreasureChest } from "../ocean/TreasureChest";
import { STATION_SCREEN_Y, stationScreenX } from "../stations/stationLayout";
import { StationDock } from "../stations/StationDock";

interface BubblePopPlayingSceneProps {
  stage: BubblePopStageRuntime;
  childFirstName: string;
  onEvent: DisplayEventListener;
  externalIncorrectSignal?: { color: BubbleColor; token: number } | null;
  isPaused?: boolean;
  onFinalActionSettled?: () => void;
}

interface StageSnapshot {
  bubbles: Bubble[];
  targetStartedAt: number | null;
  targetPausedMs: number;
  pausedAt: number | null;
}

interface PendingPop {
  /** The just-popped mission bubble — kept rendering (still moving) until the pulse impacts it, so it never visually vanishes before the pulse arrives (task Part A). */
  bubble: Bubble;
  /** This bubble's OWN motion anchor, captured from the render right before it popped — NOT the stage's live (already-advanced) timestamps. */
  meta: StageSnapshot;
  correctCount: number;
  totalTargets: number;
  big: boolean;
  treasureFinal: boolean;
}

/** Pulse travel time bounds — task Part A's "~250-450ms depending on distance." */
const PULSE_MIN_MS = 250;
const PULSE_MAX_MS = 450;

/** Finds the on-screen origin of the station that matches `bubble`'s own (color[, shape]) — a fixed palette station for a plain color mission, or this mission's own per-mission candidate token set for a color+shape mission (task Part G). */
function resolveStationOrigin(bubble: Bubble, planStations: readonly BubbleColor[]): { x: number; y: number } {
  if (bubble.requiresShape && bubble.stationTokens.length > 0) {
    const index = bubble.stationTokens.findIndex((t: StationToken) => t.color === bubble.color && t.shape === bubble.shape);
    return { x: stationScreenX(Math.max(0, index), bubble.stationTokens.length), y: STATION_SCREEN_Y };
  }
  const index = planStations.indexOf(bubble.color);
  return { x: stationScreenX(Math.max(0, index), planStations.length), y: STATION_SCREEN_Y };
}

/**
 * THE CORE GAMEPLAY SCREEN (task section 5-13, Phase 2 Part A/B) — station
 * press to energy pulse to pop, in strict causal order: PRESS -> pulse
 * launches immediately -> pulse travels to a PREDICTED impact point on the
 * bubble's own deterministic motion path -> impact -> THEN the bubble pops.
 * The just-confirmed mission bubble is deliberately kept rendered (still
 * moving) via `pendingPop` for the pulse's whole flight — canonical state
 * may have already advanced to the next mission, but the VISUAL commit is
 * held back until the pulse actually arrives, so the bubble can never
 * appear to vanish/pop before the pulse reaches it.
 */
export function BubblePopPlayingScene({ stage, childFirstName, onEvent, externalIncorrectSignal, isPaused = false, onFinalActionSettled }: BubblePopPlayingSceneProps) {
  const plan = useMemo(() => getBubbleStagePlan(stage.difficulty, stage.stageNumber), [stage.difficulty, stage.stageNumber]);
  const canonicalTargetId = currentTargetId(stage);
  const canonicalTargetBubble = stage.bubbles.find((b) => b.id === canonicalTargetId) ?? null;
  // SEQUENCE MISSIONS (task Part G's "المهمة المزدوجة"): on the FIRST bubble
  // of a two-step pair, the SECOND bubble is just the very next mission in
  // the ordered list — no separate runtime concept needed, see
  // stagePlans.ts's `sequenceLength` doc comment.
  const sequenceNextBubble =
    canonicalTargetBubble && plan.sequenceLength === 2 && canonicalTargetBubble.index % 2 === 0
      ? (stage.bubbles[canonicalTargetBubble.index + 1] ?? null)
      : null;

  const snapshotRef = useRef<StageSnapshot>({
    bubbles: stage.bubbles,
    targetStartedAt: stage.targetStartedAt,
    targetPausedMs: stage.targetPausedMs,
    pausedAt: stage.pausedAt,
  });
  const pendingPopDataRef = useRef<PendingPop | null>(null);
  const pulseArrivalRef = useRef<{ x: number; y: number } | null>(null);

  const [pendingPop, setPendingPop] = useState<PendingPop | null>(null);
  const [pulse, setPulse] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; hex: string; token: number; durationMs: number } | null>(
    null,
  );
  const [pulsingColor, setPulsingColor] = useState<BubbleColor | null>(null);
  const [poppedFx, setPoppedFx] = useState<{ token: number; big: boolean; position: { x: number; y: number } } | null>(null);
  const [treasureOpenedToken, setTreasureOpenedToken] = useState<string | null>(null);

  // POP DETECTION (task Part A) — compares this render's bubbles against the
  // PREVIOUS render's snapshot. The just-finished mission's OWN motion
  // timestamps are captured from that SAME previous snapshot (canonical
  // state has already advanced past them by the time this effect runs) and
  // held in `pendingPop` so the bubble keeps animating normally, uninterrupted,
  // right up until the pulse impacts it.
  useEffect(() => {
    const previous = snapshotRef.current;
    const newlyPopped = stage.bubbles.find((b) => b.isPopped && !previous.bubbles.find((p) => p.id === b.id)?.isPopped);
    const meta = previous;
    snapshotRef.current = { bubbles: stage.bubbles, targetStartedAt: stage.targetStartedAt, targetPausedMs: stage.targetPausedMs, pausedAt: stage.pausedAt };
    if (!newlyPopped) return;

    const elapsedAtPress = elapsedActiveMs(Date.now(), meta.targetStartedAt, meta.targetPausedMs, meta.pausedAt);
    const from = resolveStationOrigin(newlyPopped, plan.stations);

    // PREDICT THE IMPACT POINT (task Part A: "predict the bubble's arrival
    // position using the deterministic motion function") — two passes: a
    // nominal duration locates roughly where the bubble will be, then the
    // real station-to-bubble distance re-scales the duration within
    // [PULSE_MIN_MS, PULSE_MAX_MS], and the impact point is re-predicted at
    // that final duration. Fully exact — no interpolation/drift, since
    // bubble motion is a pure function of elapsed time.
    const nominalMs = (PULSE_MIN_MS + PULSE_MAX_MS) / 2;
    const nominalTo = { x: bubbleMotionX(newlyPopped.direction, newlyPopped.travelMs, elapsedAtPress + nominalMs), y: newlyPopped.lane };
    const distance = Math.hypot(nominalTo.x - from.x, nominalTo.y - from.y);
    const durationMs = Math.round(Math.min(PULSE_MAX_MS, Math.max(PULSE_MIN_MS, PULSE_MIN_MS + distance * (PULSE_MAX_MS - PULSE_MIN_MS))));
    const to = { x: bubbleMotionX(newlyPopped.direction, newlyPopped.travelMs, elapsedAtPress + durationMs), y: newlyPopped.lane };

    const isFinalPop = stage.currentTargetIndex >= stage.targetSequence.length;
    const pending: PendingPop = {
      bubble: newlyPopped,
      meta,
      correctCount: stage.currentTargetIndex,
      totalTargets: stage.targetSequence.length,
      big: isFinalPop,
      treasureFinal: plan.features.treasure && isFinalPop,
    };
    pendingPopDataRef.current = pending;
    pulseArrivalRef.current = to;
    setPendingPop(pending);
    setPulsingColor(newlyPopped.color);
    setPulse({ from, to, hex: BUBBLE_COLOR_HEX[newlyPopped.color], token: Date.now(), durationMs });
    const clearGlow = setTimeout(() => setPulsingColor(null), durationMs + 200);
    return () => clearTimeout(clearGlow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.bubbles]);

  // THE ACTUAL POP (task Part A's non-negotiable hand-off) — fires ONLY when
  // the energy pulse visually arrives. Everything downstream — the burst,
  // the pop sound, revealing the NEXT mission bubble (by clearing
  // `pendingPop`, which switches rendering back to the canonical target) —
  // happens exactly here, never earlier.
  const handlePulseArrive = useCallback(() => {
    const pending = pendingPopDataRef.current;
    const position = pulseArrivalRef.current;
    pendingPopDataRef.current = null;
    pulseArrivalRef.current = null;
    setPulse(null);
    setPendingPop(null);
    if (!pending || !position) return;
    setPoppedFx({ token: Date.now(), big: pending.big, position });
    onEvent({ type: "bubblepop_pop", timestamp: Date.now() });
    onEvent({ type: "bubblepop_correct", timestamp: Date.now(), correctCount: pending.correctCount, totalTargets: pending.totalTargets });
    if (pending.treasureFinal) setTreasureOpenedToken(`treasure-${Date.now()}`);
  }, [onEvent]);

  const handlePopDone = useCallback(() => {
    const wasFinal = poppedFx?.big === true;
    setPoppedFx(null);
    if (wasFinal) onFinalActionSettled?.();
  }, [onFinalActionSettled, poppedFx?.big]);

  // Announces the CURRENT mission (task section 3/4/32, Phase 2 Part C's
  // short spoken cue) — fires once when this stage's first target becomes
  // active and again every time currentTargetIndex advances. The FIRST
  // bubble of a two-step sequence announces BOTH steps together
  // (bubblepop_sequence_request, task Part G); every other mission —
  // including the sequence's own second step — announces normally.
  const announcedTargetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!canonicalTargetId || canonicalTargetId === announcedTargetIdRef.current) return;
    announcedTargetIdRef.current = canonicalTargetId;
    const target = stage.bubbles.find((b) => b.id === canonicalTargetId);
    if (!target) return;

    if (sequenceNextBubble) {
      onEvent({
        type: "bubblepop_sequence_request",
        timestamp: Date.now(),
        firstColor: target.color,
        firstShape: target.shape,
        announceFirstShape: target.requiresShape,
        secondColor: sequenceNextBubble.color,
        secondShape: sequenceNextBubble.shape,
        announceSecondShape: sequenceNextBubble.requiresShape,
      });
      return;
    }
    onEvent({
      type: "bubblepop_target_request",
      timestamp: Date.now(),
      childName: childFirstName,
      color: target.color,
      shape: target.shape,
      announceShape: target.requiresShape,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalTargetId, stage.bubbles]);

  const lastSeenIncorrectSignalRef = useRef(externalIncorrectSignal ?? null);
  useEffect(() => {
    if (!externalIncorrectSignal || externalIncorrectSignal === lastSeenIncorrectSignalRef.current) return;
    lastSeenIncorrectSignalRef.current = externalIncorrectSignal;
    onEvent({ type: "bubblepop_incorrect", timestamp: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalIncorrectSignal]);

  // VOICE COVERAGE: the "توقف مؤقت" overlay below is visible Arabic text the
  // child can't be expected to read — speak it once on the false->true
  // transition, never on every render.
  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) onEvent({ type: "paused", timestamp: Date.now() });
    wasPausedRef.current = isPaused;
  }, [isPaused, onEvent]);

  // RENDER TARGET (task Part A): while a pop is pending (pulse in flight),
  // keep showing/moving the OLD bubble using ITS OWN captured motion anchor
  // — the LIVE `stage.pausedAt` is still used so pausing still freezes it,
  // same as the canonical bubble.
  const displayedBubble = pendingPop ? pendingPop.bubble : canonicalTargetBubble;
  const motionAnchor = pendingPop
    ? { targetStartedAt: pendingPop.meta.targetStartedAt, targetPausedMs: pendingPop.meta.targetPausedMs }
    : { targetStartedAt: stage.targetStartedAt, targetPausedMs: stage.targetPausedMs };
  const promptBubble = pendingPop ? canonicalTargetBubble ?? pendingPop.bubble : canonicalTargetBubble;
  // The pending-pop window only ever holds the FIRST step's own bubble, never a mid-sequence
  // gap — sequenceNextBubble (derived from the CANONICAL target above) still applies as-is.
  const promptNext = promptBubble?.id === canonicalTargetBubble?.id ? sequenceNextBubble : null;

  return (
    <div className="relative h-full w-full">
      {promptBubble && (
        <MissionPrompt
          color={promptBubble.color}
          shape={promptBubble.requiresShape ? promptBubble.shape : null}
          next={promptNext ? { color: promptNext.color, shape: promptNext.requiresShape ? promptNext.shape : null } : null}
        />
      )}

      {plan.features.treasure && (
        <TreasureChest completed={stage.treasureProgress} total={stage.bubbles.length} openedToken={treasureOpenedToken} currency={plan.treasureMode} />
      )}

      {displayedBubble && <MovingBubble bubble={displayedBubble} targetStartedAt={motionAnchor.targetStartedAt} targetPausedMs={motionAnchor.targetPausedMs} pausedAt={stage.pausedAt} />}

      {pulse && <EnergyPulse key={pulse.token} from={pulse.from} to={pulse.to} hex={pulse.hex} durationMs={pulse.durationMs} onArrive={handlePulseArrive} />}

      {poppedFx && <BubblePopFx key={poppedFx.token} position={poppedFx.position} big={poppedFx.big} onDone={handlePopDone} />}

      <StationDock
        stations={plan.stations}
        stationTokens={canonicalTargetBubble?.requiresShape ? canonicalTargetBubble.stationTokens : null}
        pulsingColor={pulsingColor}
        wobblingColor={externalIncorrectSignal?.color ?? null}
      />

      {isPaused && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-[2vmin] bg-cyan-950/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-[10vmin]" aria-hidden="true">
            ⏸
          </span>
          <span className="text-[3.4vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(6,40,61,0.4)]">توقف مؤقت</span>
        </motion.div>
      )}
    </div>
  );
}

/**
 * How long BubblePopFx stays mounted before clearing itself — task Part B's
 * "roughly 700-1000ms." Comfortably ahead of every sub-animation's own
 * duration below so the burst is never torn off mid-flight.
 */
const POP_BURST_DURATION_MS = 1000;

/**
 * THE WATER POP effect (task Part B — "make the pop MUCH clearer"): a quick
 * squash, a bright impact flash, TWO expanding rings, 18-28 mini
 * bubbles/droplets, and a few larger bubbles rising away. `big` (the final
 * mission pop) scales every layer up further. Reads clearly from a
 * projector at 1920x1080 down to 1024x768 — everything sized in vmin, never
 * a fixed pixel count.
 */
function BubblePopFx({ position, big = false, onDone }: { position: { x: number; y: number }; big?: boolean; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, POP_BURST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  const dropletCount = big ? 16 : 12;
  const bubbleCount = big ? 12 : 10;
  const droplets = Array.from({ length: dropletCount }, (_, i) => i);
  const risingBubbles = Array.from({ length: bubbleCount }, (_, i) => i);
  const ringSize = big ? "22vmin" : "17vmin";
  const ring2Size = big ? "14vmin" : "10.5vmin";

  return (
    <div className="pointer-events-none absolute" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}>
      {/* 1. Quick squash/compress cue right at impact. */}
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90"
        initial={{ width: "9vmin", height: "9vmin", opacity: 0.9 }}
        animate={{ width: ["9vmin", "3vmin", "0vmin"], height: ["6vmin", "9vmin", "0vmin"], opacity: [0.9, 0.7, 0] }}
        transition={{ duration: 0.14, ease: "easeIn" }}
      />
      {/* 2. Bright aqua/white impact flash. */}
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(210,245,255,0.6) 45%, rgba(210,245,255,0) 75%)" }}
        initial={{ width: 2, height: 2, opacity: 1 }}
        animate={{ width: big ? "12vmin" : "9vmin", height: big ? "12vmin" : "9vmin", opacity: 0 }}
        transition={{ duration: 0.32, ease: "easeOut", delay: 0.05 }}
      />
      {/* 3. Expanding water ring. */}
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80"
        initial={{ width: 4, height: 4, opacity: 0.95 }}
        animate={{ width: ringSize, height: ringSize, opacity: 0 }}
        transition={{ duration: 0.75, ease: "easeOut", delay: 0.04 }}
      />
      {/* 4. A second, softer trailing ring. */}
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/70"
        initial={{ width: 4, height: 4, opacity: 0.7 }}
        animate={{ width: ring2Size, height: ring2Size, opacity: 0 }}
        transition={{ duration: 0.55, ease: "easeOut", delay: 0.16 }}
      />
      {/* 5. Mini droplets flicking outward. */}
      {droplets.map((i) => {
        const angle = (i / droplets.length) * Math.PI * 2;
        const spread = 34 + (i % 3) * 10;
        return (
          <motion.span
            key={`droplet-${i}`}
            className="absolute h-[0.9vmin] w-[0.9vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-100"
            style={{ boxShadow: "0 0 0.5vmin rgba(255,255,255,0.6)" }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: Math.cos(angle) * spread, y: Math.sin(angle) * spread - 22, opacity: 0 }}
            transition={{ duration: 0.65, ease: "easeOut", delay: 0.03 }}
          />
        );
      })}
      {/* 6. Glassy sparkles. */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const spread = 16 + (i % 2) * 10;
        return (
          <motion.span
            key={`sparkle-${i}`}
            className="absolute h-[0.5vmin] w-[0.5vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{ boxShadow: "0 0 0.9vmin rgba(255,255,255,0.95)" }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{ x: Math.cos(angle) * spread, y: Math.sin(angle) * spread, opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
          />
        );
      })}
      {/* 7. A few larger bubbles rising upward. */}
      {risingBubbles.map((i) => {
        const angle = (i / risingBubbles.length) * Math.PI * 2 + Math.PI / risingBubbles.length;
        const spread = 22 + (i % 3) * 8;
        return (
          <motion.span
            key={`bubble-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
            style={{ boxShadow: "0 0 0.6vmin rgba(255,255,255,0.5)" }}
            initial={{ x: 0, y: 0, width: "0.6vmin", height: "0.6vmin", opacity: 0.95 }}
            animate={{ x: Math.cos(angle) * spread, y: Math.sin(angle) * spread - 50, width: "1.8vmin", height: "1.8vmin", opacity: 0 }}
            transition={{ duration: 0.85 + (i % 3) * 0.05, ease: "easeOut", delay: 0.05 }}
          />
        );
      })}
    </div>
  );
}
