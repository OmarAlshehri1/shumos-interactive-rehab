'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createState, reduce, type Command, type State } from '@/lib/achievementforest/engine';
import { AchievementForestView } from './AchievementForestView';

/**
 * Review harness: runs the real engine locally (no Firebase) and renders the real Display view.
 * ?level=1&target=10&script=start,c,c,a,u,k,p,r,next,end   (c=confirm, a=assisted, u=undo, k=skip, p=pause, r=resume, n=continue)
 * Optional: &done=N confirms N times after start, &cfg={"quality":"low"}.
 * `window.__af.send(command)` drives it from a test script; `window.__af.state()` reads the current state.
 */
let clock = 5000;
export function DevPreview() {
  const q = useSearchParams();
  const init = useMemo(() => {
    let s = createState('dev', Number(q.get('seed') ?? 7));
    s = reduce(s, { type: 'selectLevel', level: Number(q.get('level') ?? 0) });
    s = reduce(s, { type: 'setTarget', target: Number(q.get('target') ?? 10) });
    s = reduce(s, { type: 'setExercise', exercise: q.get('exercise') ?? 'الوقوف من الجلوس' });
    try { const cfg = q.get('cfg'); if (cfg) s = reduce(s, { type: 'configure', config: JSON.parse(cfg) }); } catch { /* ignore */ }
    const tok = (q.get('script') ?? '').split(',').filter(Boolean);
    for (const t of tok) {
      clock += 1000;
      const at = clock;
      const c: Command | null = t === 'start' ? { type: 'start', at } : t === 'c' ? { type: 'confirm', at } : t === 'a' ? { type: 'confirm', assisted: true, at } : t === 'u' ? { type: 'undo', at } : t === 'k' ? { type: 'skip', at } : t === 'p' ? { type: 'pause' } : t === 'r' ? { type: 'resume', at } : t === 'n' ? { type: 'continue', at } : t === 'end' ? { type: 'end', at } : null;
      if (c) s = reduce(s, c);
    }
    return s;
  }, [q]);
  const [state, setState] = useState<State>(init);
  useEffect(() => {
    const w = window as unknown as { __af?: unknown };
    w.__af = {
      send: (c: Command) => setState((s) => reduce(s, c.type === 'confirm' || c.type === 'undo' || c.type === 'start' || c.type === 'continue' || c.type === 'end' || c.type === 'resume' ? { ...c, at: (clock += 1000) } as Command : c)),
      state: () => state,
    };
  }, [state]);
  return <AchievementForestView state={state} full connected />;
}
