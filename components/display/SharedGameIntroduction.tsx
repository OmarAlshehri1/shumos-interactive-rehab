"use client";
import { useEffect } from "react";
import { GAME_REGISTRY, type GameId } from "@/lib/games/registry";
import {
  GAME_INSTRUCTIONS,
  participationCue,
} from "@/lib/games/setup/introduction";
import type { AnySessionState } from "@/lib/realtime/types";
import type { DisplayEventListener } from "./events";
import styles from "./introduction.module.css";
export function SharedGameIntroduction({
  gameId,
  session,
  onEvent,
  audioEnabled = true,
  speechKey,
}: {
  gameId: GameId;
  session: AnySessionState;
  onEvent: DisplayEventListener;
  audioEnabled?: boolean;
  speechKey?: string;
}) {
  const copy = GAME_INSTRUCTIONS[gameId],
    input = participationCue(session),
    stage = session.currentStage as {
      stageIndex?: number;
      stageNumber?: number;
    },
    key = speechKey ?? `${gameId}:${session.sessionId}:${stage.stageIndex ?? stage.stageNumber ?? 0}`,
    speech = `${copy.goal} ${input}`;
  useEffect(() => {
    if (!audioEnabled) return;
    onEvent({
      type: "game_introduction",
      key,
      text: speech,
      timestamp: Date.now(),
    });
  }, [onEvent, key, speech, audioEnabled]);
  return (
    <section className={styles.card} dir="rtl" aria-label="تعليمات اللعبة">
      <div className={styles.cue} aria-hidden="true">
        <svg viewBox="0 0 160 64" fill="none">
          <path
            d="M20 32h65m-12-10 12 10-12 10"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {copy.cue === "feet" ? (
            <>
              <ellipse
                cx="110"
                cy="29"
                rx="10"
                ry="18"
                stroke="currentColor"
                strokeWidth="3"
              />
              <ellipse
                cx="139"
                cy="36"
                rx="10"
                ry="18"
                stroke="currentColor"
                strokeWidth="3"
              />
            </>
          ) : copy.cue === "drive" ? (
            <>
              <circle
                cx="123"
                cy="32"
                r="23"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                d="M104 27h38m-19 0v28"
                stroke="currentColor"
                strokeWidth="3"
              />
            </>
          ) : (
            <>
              <circle
                cx="123"
                cy="32"
                r="23"
                stroke="currentColor"
                strokeWidth="3"
              />
              <circle cx="123" cy="32" r="8" fill="currentColor" />
            </>
          )}
        </svg>
      </div>
      <h1>{GAME_REGISTRY.find((g) => g.id === gameId)?.nameAr}</h1>
      <p className={styles.goal}>{copy.goal}</p>
      <p className={styles.input}>{input}</p>
      <footer>
        <span>انتظر إشارة الأخصائي للبدء</span>
        <button
          onClick={() =>
            onEvent({
              type: "game_introduction",
              key: `${key}:replay:${crypto.randomUUID()}`,
              text: speech,
              timestamp: Date.now(),
            })
          }
        >
          إعادة التعليمات ♫
        </button>
      </footer>
    </section>
  );
}
