import { SPECIES, STAGES } from '@/lib/pearlvoyage3d/stages';
import type { State } from '@/lib/pearlvoyage3d/engine';
import styles from './control.module.css';

/** live plan view of the current stage for the therapist: islands, reefs, markers, the boat and its route */
export function MiniMap({ state: s }: { state: State }) {
    const def = STAGES[s.stage];
    const pts = [{ x: def.start.x, y: def.start.y, r: 6 }, ...def.islands, ...def.reefs, ...def.markers.map(m => ({ x: m.x, y: m.y, r: s.config.markerRadius })), { x: s.x, y: s.y, r: 6 }];
    let minX = Math.min(...pts.map(p => p.x - p.r)) - 8, maxX = Math.max(...pts.map(p => p.x + p.r)) + 8;
    const minY = Math.min(...pts.map(p => p.y - p.r)) - 8, maxY = Math.max(...pts.map(p => p.y + p.r)) + 8;
    // keep the plan near 4:3 so the water fills the card instead of leaving empty bands
    const wantW = (maxY - minY) * 0.9;
    if (maxX - minX < wantW) { const mid = (minX + maxX) / 2; minX = mid - wantW / 2; maxX = mid + wantW / 2; }
    const target = def.markers[s.marker];
    const done = (i: number) => s.events.find(e => e.key === `${s.stage}:${i}`);
    return <svg className={styles.map} viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="خريطة الرحلة" data-testid="minimap" preserveAspectRatio="xMidYMid meet">
        <defs><linearGradient id="pvm-sea" x2="0" y2="1"><stop stopColor="#8ee9dd" /><stop offset="1" stopColor="#2aa7c4" /></linearGradient></defs>
        <rect x={minX - 400} y={-maxY - 400} width={maxX - minX + 800} height={maxY - minY + 800} fill="url(#pvm-sea)" />
        {def.reefs.map((r, i) => <circle key={`r${i}`} cx={r.x} cy={-r.y} r={r.r} fill="#ff7aa8" opacity=".35" />)}
        {def.islands.map((isl, i) => <g key={`i${i}`}><circle cx={isl.x} cy={-isl.y} r={isl.r * 1.12} fill="#f3e3b5" /><circle cx={isl.x} cy={-isl.y} r={isl.r * 0.72} fill={isl.kind === 'rocky' || isl.kind === 'karst' ? '#9a8a78' : '#5bb55e'} /></g>)}
        {target && s.status !== 'ended' && s.status !== 'stage-complete' && <line x1={s.x} y1={-s.y} x2={target.x} y2={-target.y} stroke="#fff" strokeWidth="1.1" strokeDasharray="3 3" opacity=".85" />}
        {def.markers.map((m, i) => { const ev = done(i); const active = i === s.marker && !ev; return <g key={i}>
            <circle cx={m.x} cy={-m.y} r={s.config.markerRadius} fill={active ? '#ffc83d' : 'none'} fillOpacity=".18" stroke={ev ? (ev.outcome === 'skipped' ? '#9aa3a8' : '#ffc83d') : '#ffc83d'} strokeWidth={active ? 2 : 1.2} strokeDasharray={active ? undefined : '3 2'} opacity={ev ? 0.75 : 1} />
            <circle cx={m.x} cy={-m.y} r="5" fill={ev ? (ev.outcome === 'skipped' ? '#9aa3a8' : '#2a9d6f') : '#ffc83d'} />
            <text x={m.x} y={-m.y + 2.6} fontSize="7" textAnchor="middle" fill="#fff" fontWeight="700">{ev ? (ev.outcome === 'skipped' ? '–' : '✓') : i + 1}</text>
            <title>{SPECIES[m.species].nameAr}</title></g>; })}
        <g transform={`translate(${s.x} ${-s.y}) rotate(${s.heading * 180 / Math.PI})`}><path d="M0 -8 L5.5 7 L0 4 L-5.5 7 Z" fill="#fff" stroke="#14697f" strokeWidth="1.6" strokeLinejoin="round" /></g>
    </svg>;
}
