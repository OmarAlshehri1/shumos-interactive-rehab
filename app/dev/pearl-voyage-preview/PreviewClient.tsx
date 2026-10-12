'use client';
import { useEffect, useRef, useState } from 'react';
import { PearlVoyageView } from '@/components/display/pearlvoyage3d/PearlVoyageView';
import { createState, reduce, type Command, type State } from '@/lib/pearlvoyage3d/engine';
import { SPECIES, SPECIES_ORDER } from '@/lib/pearlvoyage3d/stages';
import { fishPortraits } from '@/lib/pearlvoyage3d/render/portraits';

declare global { interface Window { __pv?: { dispatch: (c: Command) => void; get: () => State; set: (s: State) => void } } }
/** query: ?stage=0..8&quality=high|medium|low&auto=1&reduced=1&contrast=1&sound=1&start=1 */
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element -- dev-only harness that seeds state from the URL */
export function PreviewClient() {
    const [state, setState] = useState<State>(() => createState('preview'));
    const ref = useRef(state);
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        let s = createState('preview');
        s = reduce(s, { type: 'config', patch: { quality: (q.get('quality') as 'high') || 'high', autoDrive: q.get('auto') === '1', autoHold: q.get('autohold') === '1', reducedMotion: q.get('reduced') === '1', highContrast: q.get('contrast') === '1', sound: q.get('sound') === '1', holdSeconds: Number(q.get('hold') || 3) } });
        s = reduce(s, { type: 'stage', stage: Number(q.get('stage') || 0) });
        if (q.get('start') === '1') s = reduce(s, { type: 'start', at: Date.now() });
        ref.current = s;
        setState(s);
        const push = (n: State) => { ref.current = n; setState(n); };
        window.__pv = { dispatch: c => push(reduce(ref.current, c)), get: () => ref.current, set: push };
        const timer = setInterval(() => { if (ref.current.status === 'running') push(reduce(ref.current, { type: 'tick', at: Date.now() })); }, 50);
        return () => { clearInterval(timer); delete window.__pv; };
    }, []);
    const [sheet, setSheet] = useState<Record<string, string> | null>(null);
    useEffect(() => { if (new URLSearchParams(location.search).get('fish') === '1') setSheet(fishPortraits(SPECIES_ORDER)); }, []);
    if (sheet) return <div data-testid="pv-view" style={{ position: 'fixed', inset: 0, background: 'linear-gradient(#5fc8e8,#1a8fb8)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 12, direction: 'rtl', color: '#fff' }}>{SPECIES_ORDER.map(id => <div key={id} style={{ textAlign: 'center' }}><img src={sheet[id]} alt={id} style={{ width: '100%' }} /><b>{SPECIES[id].nameAr}</b></div>)}</div>;
    return <div style={{ position: 'fixed', inset: 0 }}><PearlVoyageView state={state} full connected muted={false} /></div>;
}
