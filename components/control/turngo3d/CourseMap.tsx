'use client';
import { useRef, useState } from 'react';
import { AREA_H, AREA_W, CONE_R, CONE_SAFE, COURSES, dist, routePoints, sampleSpline, type Plan, type Pt } from '@/lib/turngo3d/courses';
import type { Config } from '@/lib/turngo3d/config';
import { scheduleFor } from '@/lib/turngo3d/stages';
import { cpPos } from '@/lib/turngo3d/captions';
import { activeCp, stat, type State } from '@/lib/turngo3d/engine';
import { cmPerUnit } from '@/lib/turngo3d/projectionProfile';
import styles from './control.module.css';

type Target = { kind: 'cone' | 'cp' | 'start' | 'finish'; i: number };
const EVENT_GLYPH = { light: '🚦', character: '🦊', gate: '🚧', switch: '↔', block: '⛔', altStar: '✨' } as const;

/**
 * The therapist's course map: a flat top-down schematic of the SAME plan the Display draws. While a stage is being
 * set up (status 'ready') cones, stars, the start and the finish can be dragged (or nudged with the arrow keys) to match the
 * real cones on the floor; edits are stored in the base frame, so rotating or mirroring afterwards keeps them. Nothing here
 * measures the floor: positions are course units until the projection has been measured.
 */
export function CourseMap({ s, editable, onConfigure }: { s: State; editable: boolean; onConfigure: (patch: Partial<Config>) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ t: Target; pos: Pt } | null>(null);
  const [draft, setDraft] = useState<Partial<Config> | null>(null);
  const cfg: Config = draft ? { ...s.config, ...draft } : s.config;
  const sch = scheduleFor(s.stage, cfg);
  const plan: Plan = sch.plan;
  const st = stat(s);
  const act = s.status === 'running' || s.status === 'paused' ? activeCp(s) : -1;
  const route = routePoints(plan, s.route);
  const spline = sampleSpline(route, 12);
  const cm = cmPerUnit(cfg.proj);
  const d = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)} ${(-p[1]).toFixed(3)}`).join(' ');
  const def = COURSES[sch.course];

  /** Base-frame index of the course checkpoint behind final checkpoint i (null for inserted midpoints). */
  const baseIndexOf = (i: number): number | null => { const b = plan.baseToFinal.indexOf(i); return b >= 0 ? b : null; };

  const toCourse = (e: React.PointerEvent): Pt => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = el.getScreenCTM()!.inverse();
    const q = pt.matrixTransform(m);
    return [Math.max(-AREA_W / 2, Math.min(AREA_W / 2, q.x)), Math.max(-AREA_H / 2, Math.min(AREA_H / 2, -q.y))];
  };

  const patchFor = (t: Target, finalPos: Pt): Partial<Config> | null => {
    const base = plan.frame.toBase(finalPos);
    const r = (v: number) => Math.round(v * 100) / 100;
    const b: Pt = [r(base[0]), r(base[1])];
    if (t.kind === 'cone') return { cones: { ...cfg.cones, [String(t.i)]: b } };
    if (t.kind === 'start') return { start: b };
    if (t.kind === 'finish') return { finish: b };
    const bi = baseIndexOf(t.i);
    return bi === null ? null : { cpPos: { ...cfg.cpPos, [String(bi)]: b } };
  };

  const targetOf = (el: Element): Target | null => {
    const raw = el.closest('[data-target]')?.getAttribute('data-target');
    if (!raw) return null;
    const [kind, i] = raw.split(':');
    return { kind: kind as Target['kind'], i: Number(i) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!editable) return;
    const t = targetOf(e.currentTarget);
    if (!t) return;
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* the drag still works without capture (e.g. a synthetic pointer) */ }
    drag.current = { t, pos: toCourse(e) };
  };
  const move = (e: React.PointerEvent) => {
    const dr = drag.current;
    if (!dr) return;
    dr.pos = toCourse(e);
    const p = patchFor(dr.t, dr.pos);
    if (p) setDraft(p);
  };
  const end = () => {
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    const p = patchFor(dr.t, dr.pos);
    setDraft(null);
    if (p) onConfigure(p);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!editable) return;
    const t = targetOf(e.currentTarget);
    const at = e.currentTarget.getAttribute('data-at')?.split(',').map(Number);
    if (!t || !at || at.length !== 2) return;
    const cur: Pt = [at[0], at[1]];
    const step = e.shiftKey ? 0.5 : 0.1;
    const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0, dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const p = patchFor(t, [Math.max(-AREA_W / 2, Math.min(AREA_W / 2, cur[0] + dx)), Math.max(-AREA_H / 2, Math.min(AREA_H / 2, cur[1] + dy))]);
    if (p) onConfigure(p);
  };

  const heading = Math.atan2(route[1][1] - route[0][1], route[1][0] - route[0][0]);
  const startPos = plan.start;
  const starPath = (r: number) => Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.46 : r; return `${(Math.cos(a) * rr).toFixed(3)},${(Math.sin(a) * rr).toFixed(3)}`; }).join(' ');
  const inset = cfg.proj.inset;

  return (
    <div className={styles.mapWrap} data-testid="tg-map" data-editable={editable ? '1' : '0'}>
      <svg ref={svg} className={styles.mapSvg} viewBox={`${-AREA_W / 2 - 0.3} ${-AREA_H / 2 - 0.3} ${AREA_W + 0.6} ${AREA_H + 0.6}`} role="img" aria-label="خريطة المسار: الأقماع والنجوم ونقطة البداية" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <rect x={-AREA_W / 2} y={-AREA_H / 2} width={AREA_W} height={AREA_H} rx="0.25" fill="#0b2a22" stroke="#2f8a6c" strokeWidth="0.06" />
        {Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} x1={-AREA_W / 2 + i + 1} x2={-AREA_W / 2 + i + 1} y1={-AREA_H / 2} y2={AREA_H / 2} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="0.03" />)}
        {Array.from({ length: 8 }, (_, i) => <line key={`h${i}`} y1={-AREA_H / 2 + i + 1} y2={-AREA_H / 2 + i + 1} x1={-AREA_W / 2} x2={AREA_W / 2} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="0.03" />)}
        <rect x={-AREA_W / 2 + (AREA_W * inset) / 100} y={-AREA_H / 2 + (AREA_H * inset) / 100} width={AREA_W * (1 - (2 * inset) / 100)} height={AREA_H * (1 - (2 * inset) / 100)} fill="none" stroke="#ffd23f" strokeOpacity="0.45" strokeWidth="0.04" strokeDasharray="0.25 0.2" />

        <path d={d(spline)} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth={plan.width + 0.2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={d(spline)} fill="none" stroke="#c9b894" strokeOpacity="0.55" strokeWidth={plan.width} strokeLinecap="round" strokeLinejoin="round" />
        <path d={d(spline)} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.06" strokeDasharray="0.2 0.25" />

        {plan.alts.map((alt, i) => (alt && sch.events[i - 1] && ['switch', 'block', 'altStar'].includes(sch.events[i - 1] as string)) ? <g key={`alt${i}`}><circle cx={alt[0]} cy={-alt[1]} r="0.32" fill="none" stroke="#7ff4ff" strokeWidth="0.06" strokeDasharray="0.12 0.1" /><text x={alt[0]} y={-alt[1] + 0.12} fontSize="0.4" textAnchor="middle" fill="#7ff4ff">?</text></g> : null)}

        {plan.cones.map((c, i) => (
          <g key={`cone${i}`}>
            <circle cx={c[0]} cy={-c[1]} r={CONE_SAFE} fill="#ffc233" fillOpacity="0.08" stroke="#ffc233" strokeOpacity="0.55" strokeWidth="0.04" strokeDasharray="0.15 0.12" />
            <g className={styles.handle} tabIndex={editable ? 0 : -1} role="button" aria-label={`المخروط ${i + 1}`} data-testid={`tg-handle-cone-${i}`} data-target={`cone:${i}`} data-at={`${c[0]},${c[1]}`} onPointerDown={onDown} onKeyDown={onKey} style={{ cursor: editable ? 'grab' : 'default' }}>
              <circle className="hit" cx={c[0]} cy={-c[1]} r="0.62" fill="transparent" />
              <circle cx={c[0]} cy={-c[1]} r={CONE_R * 1.9} fill={['#ff6a1a', '#e63946', '#2f80ed', '#ffc233', '#2fbf71'][i % 5]} stroke="#fff" strokeWidth="0.07" />
              <circle cx={c[0]} cy={-c[1]} r={CONE_R * 1.0} fill="#fff" />
              <text x={c[0] + 0.55} y={-c[1] - 0.45} fontSize="0.55" fontWeight="700" fill="#fff" stroke="#000" strokeWidth="0.05" paintOrder="stroke">{i + 1}</text>
            </g>
          </g>
        ))}

        <g className={styles.handle} tabIndex={editable ? 0 : -1} role="button" aria-label="نقطة البداية" data-testid="tg-handle-start" data-target="start:0" data-at={`${startPos[0]},${startPos[1]}`} onPointerDown={onDown} onKeyDown={onKey} style={{ cursor: editable ? 'grab' : 'default' }}>
          <circle className="hit" cx={startPos[0]} cy={-startPos[1]} r="0.9" fill="transparent" />
          <circle cx={startPos[0]} cy={-startPos[1]} r="0.7" fill="#3ddc84" fillOpacity="0.35" stroke="#3ddc84" strokeWidth="0.1" />
          <g transform={`translate(${startPos[0]} ${-startPos[1]}) rotate(${(-heading * 180) / Math.PI})`}><path d="M-0.35 0.28 L0.45 0 L-0.35 -0.28 Z" fill="#fff" /></g>
          <text x={startPos[0]} y={-startPos[1] + 1.25} fontSize="0.42" textAnchor="middle" fill="#bff7d8">البداية</text>
        </g>

        {plan.cps.map((_, i) => {
          const p = cpPos(s, i), r = st.res[i];
          const draggable = i === plan.cps.length - 1 || baseIndexOf(i) !== null;
          const kind = sch.kinds[i], isAct = i === act;
          const col = r === 'confirmed' || r === 'assisted' ? '#ffd23f' : r === 'skipped' ? '#7a8a90' : isAct ? '#fff3a0' : '#ffc42e';
          const tgt = i === plan.cps.length - 1 ? `finish:${i}` : `cp:${i}`;
          const ev = sch.events[i];
          return (
            <g key={`cp${i}`} className={styles.handle} tabIndex={editable && draggable ? 0 : -1} role="button" aria-label={`النجمة ${i + 1}`} data-testid={`tg-handle-cp-${i}`} data-status={r ?? 'pending'} data-target={tgt} data-at={`${p[0]},${p[1]}`} onPointerDown={draggable ? onDown : undefined} onKeyDown={draggable ? onKey : undefined} style={{ cursor: editable && draggable ? 'grab' : 'default' }}>
              <circle className="hit" cx={p[0]} cy={-p[1]} r="0.7" fill="transparent" />
              {kind === 'stop' && <polygon points={Array.from({ length: 8 }, (_, k) => { const a = (Math.PI / 4) * k + Math.PI / 8; return `${(p[0] + Math.cos(a) * 0.85).toFixed(3)},${(-p[1] + Math.sin(a) * 0.85).toFixed(3)}`; }).join(' ')} fill="#e63946" fillOpacity="0.85" stroke="#fff" strokeWidth="0.06" />}
              {isAct && <circle cx={p[0]} cy={-p[1]} r="0.95" fill="none" stroke="#fff" strokeWidth="0.07" strokeDasharray="0.2 0.14" />}
              <polygon transform={`translate(${p[0]} ${-p[1]})`} points={starPath(0.55)} fill={col} stroke="#7a4b00" strokeWidth="0.05" strokeLinejoin="round" opacity={r === 'skipped' ? 0.55 : 1} />
              <text x={p[0]} y={-p[1] + 0.17} fontSize="0.46" fontWeight="800" textAnchor="middle" fill="#3a2500">{i + 1}</text>
              {kind === 'finish' && <text x={p[0] + 0.7} y={-p[1] - 0.55} fontSize="0.55">🏁</text>}
              {ev && <text x={p[0] - 0.95} y={-p[1] - 0.5} fontSize="0.55">{EVENT_GLYPH[ev]}</text>}
            </g>
          );
        })}
        {cm && plan.cones.length > 1 && plan.cones.slice(1).map((c, i) => { const a = plan.cones[i]; const mid: Pt = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; return <text key={`m${i}`} x={mid[0]} y={-mid[1] - 0.15} fontSize="0.38" textAnchor="middle" fill="#bdeaff">≈{Math.round(dist(a, c) * cm)} سم</text>; })}
        <text x={AREA_W / 2 - 0.2} y={-AREA_H / 2 + 0.55} fontSize="0.4" textAnchor="end" fill="#fff" opacity="0.5">{def.nameAr}</text>
      </svg>
    </div>
  );
}
