'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CONFIG, createState, reduce, stepCount, targetOf, type Command, type Config, type State } from '@/lib/colorchase3d/engine';
import { GardenView } from './GardenView';

/**
 * Development-only visual harness (404 in production): renders the garden from the real engine, with no Firebase. Query:
 * stage, done (objectives already completed), q (quality), cap, hc, rm, sym, assist, view, grid, play (seconds per auto step),
 * status (ready|stage-complete). Used for visual iteration and screenshots; the shipped path is the shared liveSession.
 */
export function GardenPrototype() {
  const q = useSearchParams();
  const stage = Number(q.get('stage') ?? 0);
  const done = Number(q.get('done') ?? 0);
  const play = Number(q.get('play') ?? 0);
  const status = q.get('status');
  const config = useMemo<Partial<Config>>(() => ({
    quality: (q.get('q') as Config['quality']) ?? 'high',
    maxColors: Number(q.get('cap') ?? 5),
    highContrast: q.get('hc') === '1',
    reducedMotion: q.get('rm') === '1',
    symbols: q.get('sym') !== '0',
    assist: q.get('assist') === 'high' ? 'high' : 'standard',
    view: q.get('view') === 'cinematic' ? 'cinematic' : 'floor',
    grid: q.get('grid') === '1',
    zoneScale: Number(q.get('zs') ?? DEFAULT_CONFIG.zoneScale),
    spacing: Number(q.get('sp') ?? DEFAULT_CONFIG.spacing),
    reach: Number(q.get('rc') ?? DEFAULT_CONFIG.reach),
    sound: false,
  }), [q]);
  const build = (n: number): State => {
    let s = createState('prototype', config);
    s = reduce(s, { type: 'stage', stage });
    s = reduce(s, { type: 'start', at: 1000 });
    for (let i = 0; i < n && s.status === 'running'; i++) {
      const t = targetOf(s)!;
      s = reduce(s, { type: 'select', stage: s.stage, step: s.step, color: t.color } as Command);
    }
    if (status === 'ready') s = { ...s, status: 'ready' };
    return s;
  };
  const [n, setN] = useState(done);
  useEffect(() => {
    if (!play) return;
    const total = stepCount(createState('x', {}), stage);
    const id = setInterval(() => setN((v) => (v >= total ? 0 : v + 1)), play * 1000);
    return () => clearInterval(id);
  }, [play, stage]);
  const state = useMemo(() => build(play ? n : done), [n, done, play, stage, config, status]); // eslint-disable-line react-hooks/exhaustive-deps
  return <GardenView state={state} full connected />;
}
