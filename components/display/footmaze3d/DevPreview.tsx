'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { COUNTDOWN_MS, createState, reduce, routeToFinish, at, type Command, type State } from '@/lib/footmaze3d/engine';
import { FootMazeView } from './FootMazeView';

/**
 * Review harness: runs the real engine locally (no Firebase) and renders the real Display view.
 * ?stage=3&cfg={"simple":true}&script=start,t:3200,w,w  (w=walk the next leg along the route, wa=assisted, g=walk to node name via "to:A",
 * t:ms=advance, s=skip, p=pause, r=release, h=hint, n=next, trig=trigger)
 * `window.__fm.send(command)` drives it from a test script; `window.__fm.state()` reads the current state.
 */
function parse(token: string, now: number, cur: () => State): Command[] {
  const [k, v] = token.split(':');
  switch (k) {
    case 'start': return [{ type: 'start', at: now }];
    case 'w': case 'wa': { const s = cur(); const to = s.heading ?? routeToFinish(s)[1]; return to ? [{ type: 'choose', to }, { type: 'arrive', assisted: k === 'wa' }] : []; }
    case 'to': return [{ type: 'choose', to: v }, { type: 'arrive', assisted: false }];
    case 's': return [{ type: 'skip' }];
    case 'p': return [{ type: 'pause' }];
    case 'r': return [{ type: 'release' }];
    case 'h': return [{ type: 'hint' }];
    case 'trig': return [{ type: 'trigger' }];
    case 'n': return [{ type: 'next', at: now }];
    case 'safety': return [{ type: 'safety' }];
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
      for (const c of parse(tok, now, () => s)) s = reduce(s, c);
      if (tok.startsWith('t:')) now += Number(tok.split(':')[1]) || 0;
    }
    return { s, now };
  }, [q]);
  const [state, setState] = useState<State>(init.s);
  const ref = useRef<State>(init.s);
  useEffect(() => { ref.current = init.s; queueMicrotask(() => setState(init.s)); }, [init]);
  useEffect(() => {
    const w = window as unknown as { __fm?: unknown };
    w.__fm = {
      send: (c: Command) => { ref.current = reduce(ref.current, c); setState(ref.current); return ref.current.status; },
      state: () => ref.current,
      at: () => at(ref.current),
      route: () => routeToFinish(ref.current),
      COUNTDOWN_MS,
    };
    const timer = setInterval(() => { if (ref.current.status === 'running') { ref.current = reduce(ref.current, { type: 'tick', at: Date.now() }); setState(ref.current); } }, 50);
    return () => { clearInterval(timer); delete w.__fm; };
  }, []);
  useEffect(() => { if (ref.current.status === 'running') ref.current = { ...ref.current, lastTick: Date.now() }; }, [init]);
  return <FootMazeView state={state} full connected />;
}
