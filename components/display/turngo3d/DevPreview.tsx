'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { COUNTDOWN_MS, createState, reduce, type Command, type State } from '@/lib/turngo3d/engine';
import { TurnGoView } from './TurnGoView';

/**
 * Review harness: runs the real engine locally (no Firebase) and renders the real Display view.
 * ?stage=3&cfg={"rot":90}&script=start,t:3200,c,c  (c=confirm, a=assisted, t:ms=advance, s=skip, d=deviation, p=pause, n=next, k=continue)
 * `window.__tg.send(command)` drives it from a test script; `window.__tg.state()` reads the current state.
 */
function parse(token: string, now: number): Command[] {
  const [k, v] = token.split(':');
  switch (k) {
    case 'start': return [{ type: 'start', at: now }];
    case 'c': return [{ type: 'confirm', assisted: false }];
    case 'a': return [{ type: 'confirm', assisted: true }];
    case 's': return [{ type: 'skip' }];
    case 'd': return [{ type: 'deviation', cone: false }];
    case 'dc': return [{ type: 'deviation', cone: true }];
    case 'p': return [{ type: 'pause' }];
    case 'k': return [{ type: 'continue' }];
    case 'n': return [{ type: 'next', at: now }];
    case 'safety': return [{ type: 'safety' }];
    case 'hold': return [{ type: 'completeHold', assisted: false }];
    case 't': { const ms = Number(v) || 0; const out: Command[] = []; for (let t = 0; t < ms; t += 50) out.push({ type: 'tick', at: now + t + 50 }); return out; }
    default: return [];
  }
}

export function DevPreview() {
  const q = useSearchParams();
  const init = useMemo(() => {
    let s = createState('dev', 7);
    const stage = Number(q.get('stage') ?? 0);
    s = reduce(s, { type: 'selectStage', stage: Math.max(0, Math.min(8, stage)) });
    try { const cfg = q.get('cfg'); if (cfg) s = reduce(s, { type: 'configure', config: JSON.parse(cfg) }); } catch { /* ignore bad cfg */ }
    let now = 1000;
    for (const tok of (q.get('script') ?? '').split(',').filter(Boolean)) {
      for (const c of parse(tok, now)) s = reduce(s, c);
      if (tok.startsWith('t:')) now += Number(tok.split(':')[1]) || 0;
    }
    return { s, now };
  }, [q]);
  const [state, setState] = useState<State>(init.s);
  const ref = useRef<State>(init.s);
  useEffect(() => { ref.current = init.s; queueMicrotask(() => setState(init.s)); }, [init]);
  useEffect(() => {
    const w = window as unknown as { __tg?: unknown };
    w.__tg = {
      send: (c: Command) => { ref.current = reduce(ref.current, c); setState(ref.current); return ref.current.status; },
      state: () => ref.current,
      COUNTDOWN_MS,
    };
    const timer = setInterval(() => { if (ref.current.status === 'running') { ref.current = reduce(ref.current, { type: 'tick', at: Date.now() }); setState(ref.current); } }, 50);
    return () => { clearInterval(timer); delete w.__tg; };
  }, []);
  // keep lastTick in step with the wall clock when resuming from a scripted state
  useEffect(() => { if (ref.current.status === 'running') ref.current = { ...ref.current, lastTick: Date.now() }; }, [init]);
  return <TurnGoView state={state} full connected />;
}
