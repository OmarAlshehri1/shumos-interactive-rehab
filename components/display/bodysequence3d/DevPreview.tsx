'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { COUNTDOWN_MS, INTER_MS, createState, currentRound, reduce, type Command, type State } from '@/lib/bodysequence3d/engine';
import { previewMs } from '@/lib/bodysequence3d/sequence';
import { BodySequenceView } from './BodySequenceView';

/**
 * Review harness: runs the real engine locally (no Firebase) and renders the real Display view.
 * ?stage=3&cfg={"rot":90}&script=start,t:3200,c,c  (c=confirm, a=assisted, t:ms=advance, s=skip, i=incorrect, r=replay,
 * p=pause, n=next, h=complete hold, x=confirm everything left in this stage)
 * `window.__bs.send(command)` drives it from a test script; `window.__bs.state()` reads the current state.
 */
function parse(token: string, now: number, cur: () => State): Command[] {
  const [k, v] = token.split(':');
  switch (k) {
    case 'start': return [{ type: 'start', at: now }];
    case 'c': return [{ type: 'confirm', assisted: false }];
    case 'a': return [{ type: 'confirm', assisted: true }];
    case 's': return [{ type: 'skip' }];
    case 'i': return [{ type: 'incorrect' }];
    case 'r': return [{ type: 'replay' }];
    case 'p': return [{ type: 'pause' }];
    case 'n': return [{ type: 'next', at: now }];
    case 'safety': return [{ type: 'safety' }];
    case 'h': return [{ type: 'completeHold', assisted: false }];
    case 'x': {
      void cur;
      return [];
    }
    case 't': { const ms = Number(v) || 0; const out: Command[] = []; for (let t = 0; t < ms; t += 50) out.push({ type: 'tick', at: now + t + 50 }); return out; }
    default: return [];
  }
}

export function DevPreview() {
  const q = useSearchParams();
  const init = useMemo(() => {
    let s = createState('dev', Number(q.get('seed') ?? 7));
    const stage = Number(q.get('stage') ?? 0);
    s = reduce(s, { type: 'selectStage', stage: Math.max(0, Math.min(8, stage)) });
    try { const cfg = q.get('cfg'); if (cfg) s = reduce(s, { type: 'configure', config: JSON.parse(cfg) }); } catch { /* ignore bad cfg */ }
    let now = 1000;
    for (const tok of (q.get('script') ?? '').split(',').filter(Boolean)) {
      if (tok === 'x') {
        // confirm everything that is left in the current sequence, waiting out previews / holds / pauses
        for (let g = 0; g < 60 && s.status === 'running'; g++) {
          if (s.inter > 0) { for (let t = 0; t < INTER_MS + 100; t += 50) s = reduce(s, { type: 'tick', at: (now += 50) }); continue; }
          if (s.phase === 'preview') { for (let t = 0; t < previewMs(currentRound(s).steps.length) + 100; t += 50) s = reduce(s, { type: 'tick', at: (now += 50) }); continue; }
          if (s.hold) { const ms = s.hold.ms; for (let t = 0; t < ms + 100; t += 50) s = reduce(s, { type: 'tick', at: (now += 50) }); continue; }
          const before = s.roundSeq;
          s = reduce(s, { type: 'confirm', assisted: false });
          if (s.roundSeq !== before) break;
        }
        continue;
      }
      for (const c of parse(tok, now, () => s)) s = reduce(s, c);
      if (tok.startsWith('t:')) now += Number(tok.split(':')[1]) || 0;
    }
    return { s, now };
  }, [q]);
  const [state, setState] = useState<State>(init.s);
  const ref = useRef<State>(init.s);
  useEffect(() => { ref.current = init.s; queueMicrotask(() => setState(init.s)); }, [init]);
  useEffect(() => {
    const w = window as unknown as { __bs?: unknown };
    w.__bs = {
      send: (c: Command) => { ref.current = reduce(ref.current, c); setState(ref.current); return ref.current.status; },
      state: () => ref.current,
      COUNTDOWN_MS,
    };
    const timer = setInterval(() => { if (ref.current.status === 'running') { ref.current = reduce(ref.current, { type: 'tick', at: Date.now() }); setState(ref.current); } }, 50);
    return () => { clearInterval(timer); delete w.__bs; };
  }, []);
  // keep lastTick in step with the wall clock when resuming from a scripted state
  useEffect(() => { if (ref.current.status === 'running') ref.current = { ...ref.current, lastTick: Date.now() }; }, [init]);
  return <BodySequenceView state={state} full connected />;
}
