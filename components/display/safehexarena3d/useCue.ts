'use client';
import { useEffect, useRef } from 'react';

/** One soft, short sine tone (peak gain 0.05). Silent unless the browser already allows audio; never throws. */
function tone(ctx: AudioContext, freq: number, at: number, dur: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.05, at + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Optional gentle cues: warning start (two rising notes), tiles dim (one low note), round done (soft pair). */
export function useCue(enabled: boolean, key: string) {
  const ctxRef = useRef<AudioContext | null>(null);
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current) return;
    last.current = key;
    if (!enabled) return;
    try {
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === 'suspended') void ctx.resume();
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      if (key.endsWith(':warning')) { tone(ctx, 523, t, 0.35); tone(ctx, 659, t + 0.22, 0.4); }
      else if (key.endsWith(':inactive')) tone(ctx, 392, t, 0.5);
      else if (key.endsWith(':restoring')) { tone(ctx, 659, t, 0.3); tone(ctx, 784, t + 0.2, 0.4); }
    } catch {
      /* audio is optional */
    }
  }, [enabled, key]);
  useEffect(() => () => void ctxRef.current?.close().catch(() => {}), []);
}
