"use client";
import { useEffect, useRef } from "react";
import { decode, type BridgeLiveSession } from "@/lib/balancebridge3d/live";
import { useControlAlive } from "@/lib/liveGame/useControlAlive";
import type { SharedGameDisplayProps } from "../gameDisplayRegistry";
import { BridgeView } from "@/components/balancebridge3d/BridgeView";
export function BridgeDisplayModule({
  session,
  muted,
  onEvent,
}: SharedGameDisplayProps) {
  const live = session as BridgeLiveSession,
    state = decode(live),
    alive = useControlAlive(live.bb3?.heartbeatAt);
  const heard = useRef("");
  const instructionVersion = useRef(0);
  const prior = useRef<{
    key: string;
    confirmed: number;
    feedback: number;
    status: string;
    countdown: number;
  } | null>(null);
  useEffect(() => {
    if (!state || muted || !state.config.audio || !alive) return;
    const key = `${state.sessionId}:${state.run}:${state.stage}:${state.status}:${state.instructions}`;
    if (key === heard.current) return;
    heard.current = key;
    const replay = state.instructions !== instructionVersion.current;
    instructionVersion.current = state.instructions;
    const introduction = replay;
    const text =
      state.status === "stage-complete"
        ? "أحسنت! وصلت إلى نهاية الطريق. انتظر المعالج."
        : state.status === "ended"
          ? "أحسنت يا بطل، انتهت رحلتك."
          : introduction
            ? "امشِ على الطريق المضيء، واتبع العلامات حتى تصل للنهاية."
            : "";
    if (text)
      onEvent({ type: "game_introduction", timestamp: Date.now(), key, text });
  }, [state, muted, alive, onEvent]);
  useEffect(() => {
    if (!state) return;
    const key = `${state.sessionId}:${state.run}:${state.stage}`,
      confirmed = state.checkpoints.filter(
        (c) => c.outcome === "confirmed" || c.outcome === "assisted",
      ).length,
      prev = prior.current;
    prior.current = {
      key,
      confirmed,
      feedback: state.feedback,
      status: state.status,
      countdown: Math.ceil(state.countdown / 1000),
    };
    if (!prev || prev.key !== key || muted || !state.config.audio || !alive)
      return;
    const tick = Math.ceil(state.countdown / 1000);
    if (
      state.status === "running" &&
      (tick !== prev.countdown || prev.status === "ready") &&
      tick > 0
    )
      onEvent({
        type: "game_feedback",
        timestamp: Date.now(),
        text: ["", "واحد", "اثنان", "ثلاثة"][tick],
        milestone: true,
        volume: 0.65,
      });
    const kind =
      state.feedback > prev.feedback
        ? "deviation"
        : state.status === "ended" && prev.status !== "ended"
          ? "final"
          : state.status === "stage-complete" &&
              prev.status !== "stage-complete"
            ? "stage"
            : confirmed > prev.confirmed
              ? "checkpoint"
              : null;
    if (kind)
      onEvent({
        type: "bridge_sound",
        timestamp: Date.now(),
        kind,
        stage: state.stage,
      });
    if (kind === "checkpoint" && confirmed % 3 === 0)
      onEvent({
        type: "game_feedback",
        timestamp: Date.now(),
        text: "أحسنت، تابع الطريق بهدوء.",
        milestone: false,
        volume: 0.65,
      });
  }, [state, muted, alive, onEvent]);
  return state ? <BridgeView state={state} full connected={alive} /> : null;
}
