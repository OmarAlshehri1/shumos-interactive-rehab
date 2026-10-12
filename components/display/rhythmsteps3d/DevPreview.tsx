'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { sanitizeConfig, type Config } from '@/lib/rhythmsteps3d/config';
import { createState, currentStep, reduce, type Command, type State } from '@/lib/rhythmsteps3d/engine';
import { RhythmView } from './RhythmView';

/**
 * Development-only harness: runs the pure engine locally (no Firebase, no auth) and renders the real Display view.
 * Used for visual review, screenshots and frame-time measurements. `window.__rs` lets a test drive it.
 * Query: stage=0..8, cfg=<json partial config>, auto=1 (a simulated therapist confirms targets as they arrive), start=0 to stay in ready.
 */
export function DevPreview() {
  const q = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const ref = useRef<State | null>(null);
  const autoRef = useRef(q.get('auto') === '1');
  useEffect(() => {
    let cfg: Partial<Config> = {};
    try {
      cfg = JSON.parse(q.get('cfg') ?? '{}');
    } catch {
      /* ignore bad query */
    }
    let s = createState('dev-preview');
    s = reduce(s, { type: 'configure', config: sanitizeConfig(cfg) });
    const stage = Number(q.get('stage') ?? 0);
    if (stage > 0 && stage < 9) s = reduce(s, { type: 'stage', stage });
    if (q.get('start') !== '0') s = reduce(s, { type: 'start', at: Date.now() });
    // optional: skip ahead on the gameplay clock so a screenshot has targets in flight
    const jump = Number(q.get('clock') ?? 0);
    if (jump > 0 && s.status === 'running') for (let t = 0; t < jump; t += 200) s = reduce(s, { type: 'tick', at: s.lastTick + 250 });
    ref.current = s;
    const timer = setInterval(() => {
      let cur = ref.current!;
      if (cur.status === 'running') cur = reduce(cur, { type: 'tick', at: Date.now() });
      if (autoRef.current && cur.status === 'running') {
        const st = currentStep(cur);
        if (st && cur.clock >= st.arrival + 500) {
          if (st.kind === 'hold') cur = st.holdAt < 0 ? reduce(cur, { type: 'startHold', id: st.id }) : cur;
          else cur = reduce(cur, { type: 'confirm', id: st.id, assisted: false });
        }
      }
      if (autoRef.current && cur.status === 'stage-complete') cur = reduce(cur, { type: 'next', at: Date.now() });
      if (autoRef.current && cur.status === 'ready' && cur.stage > 0) cur = reduce(cur, { type: 'start', at: Date.now() });
      if (cur !== ref.current) {
        ref.current = cur;
        setState(cur);
      }
    }, 50);
    queueMicrotask(() => setState(s));
    (window as unknown as { __rs?: unknown }).__rs = {
      send: (c: Command) => {
        ref.current = reduce(ref.current!, c);
        setState(ref.current);
      },
      get: () => ref.current,
      auto: (on: boolean) => (autoRef.current = on),
    };
    return () => {
      clearInterval(timer);
      delete (window as unknown as { __rs?: unknown }).__rs;
    };
  }, [q]);
  return state ? <RhythmView state={state} full connected={q.get('conn') !== '0'} /> : null;
}
