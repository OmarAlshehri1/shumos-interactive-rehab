'use client';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Soft chimes for the Enchanted Forest: a gentle rising pair on a confirmed step (peak gain 0.06, sine, no sudden onset).
 * A browser only lets sound start after a user gesture on the page, so the audio context is created at the first
 * pointer / key press (for example the Display's own "enable sound" tap). Until then the game is simply silent.
 * Never throws; sound is optional.
 */
export function useChime(enabled: boolean): () => void {
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    const unlock = () => {
      try {
        ctxRef.current ??= new AudioContext();
        if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
      } catch {
        /* sound is optional */
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);
  return useCallback(() => {
    if (!enabledRef.current) return;
    try {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      for (const [freq, at, dur] of [[587, 0, 0.5], [784, 0.16, 0.7], [988, 0.34, 0.8]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + at);
        gain.gain.exponentialRampToValueAtTime(0.06, t + at + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + at);
        osc.stop(t + at + dur + 0.05);
      }
    } catch {
      /* sound is optional */
    }
  }, []);
}
