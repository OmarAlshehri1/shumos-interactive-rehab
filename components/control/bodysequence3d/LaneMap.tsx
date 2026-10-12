'use client';
import { stepShort } from '@/lib/bodysequence3d/captions';
import { activeStep, currentRound, type State } from '@/lib/bodysequence3d/engine';
import { LANE_H, layoutOf } from '@/lib/bodysequence3d/layout';
import type { Lane } from '@/lib/bodysequence3d/sequence';
import { STAGES } from '@/lib/bodysequence3d/stages';
import styles from './control.module.css';

/**
 * The therapist's view of the floor layout from the CHILD'S side (child at the bottom, facing up), whatever the room
 * rotation is. Layout units, not centimetres: the picture never claims to match the real floor.
 */
export function LaneMap({ s }: { s: State }) {
  const def = STAGES[s.stage];
  const l = layoutOf(def.lanes, s.config.spacing, s.config.mirror);
  const live = s.status === 'running' || s.status === 'paused';
  const round = currentRound(s);
  const step = live ? round.steps[activeStep(s)] : undefined;
  const W = 14, H = 8.6, cx = W / 2, top = 0.9;
  const X = (x: number) => cx + x;
  const Y = (y: number) => top + (LANE_H / 2 + 0.2 - y) ; // child y (forward) to svg y (down)
  const boxes: [Lane, { x: number; y: number; w: number; h: number }][] = [...(['L', 'C', 'R'] as const).flatMap((k) => (l.boxes[k] ? [[k, l.boxes[k]!] as [Lane, NonNullable<typeof l.boxes.L>]] : [])), ['H', l.home]];
  const name: Record<Lane, string> = { L: 'يسار', C: 'وسط', R: 'يمين', H: 'استعداد' };
  const isTarget = (k: Lane) => !!step && step.move !== 'stop' && step.lane === k;
  const isAnchor = (k: Lane) => !!step?.anchor && step.anchor.lane === k;
  const stop = !!step && step.move === 'stop';
  return (
    <svg className={styles.laneMap} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`مخطط الممرّات: ${def.lanes} ممرّات من جهة الطفل`} data-testid="bs-lanemap" data-lanes={def.lanes} data-target={step?.lane ?? ''} data-foot={step?.foot ?? ''}>
      <text x={0.3} y={0.6} fontSize={0.52} fill="#7fb7c4">مخطط من جهة الطفل (الأمام للأعلى) · وحدات تخطيط لا سنتيمترات</text>
      {boxes.map(([k, b]) => {
        const t = isTarget(k), a = isAnchor(k);
        const color = stop ? '#ff6b73' : t ? '#ff9a1f' : a ? '#38d9ff' : '#2c6572';
        return (
          <g key={k} data-lane={k} data-active={t ? '1' : '0'}>
            <rect x={X(b.x - b.w / 2)} y={Y(b.y + b.h / 2) * 1} width={b.w} height={b.h} rx={0.35} fill={t ? 'rgba(255,154,31,0.22)' : a ? 'rgba(56,217,255,0.15)' : 'rgba(255,255,255,0.03)'} stroke={color} strokeWidth={t || a || stop ? 0.12 : 0.07} />
            <text x={X(b.x)} y={Y(b.y) + (k === 'H' ? 0.18 : 0.9)} fontSize={k === 'H' ? 0.5 : 0.62} textAnchor="middle" fill="#cfe9ee">{name[k]}</text>
            {t && step && step.foot !== 'any' && <text x={X(b.x)} y={Y(b.y) - 0.35} fontSize={0.78} fontWeight={700} textAnchor="middle" fill="#ffb347">{step.foot === 'R' ? 'القدم اليمنى' : 'القدم اليسرى'}</text>}
            {a && step?.anchor && <text x={X(b.x)} y={Y(b.y) - 0.35} fontSize={0.62} fontWeight={700} textAnchor="middle" fill="#7fe9ff">{step.anchor.foot === 'R' ? 'اليمنى تثبت' : 'اليسرى تثبت'}</text>}
          </g>
        );
      })}
      {stop && <text x={cx} y={Y(0) - 0.4} fontSize={0.9} fontWeight={700} textAnchor="middle" fill="#ff9aa0">قِف ثابتًا</text>}
      <text x={cx} y={H - 0.25} fontSize={0.5} textAnchor="middle" fill="#7fb7c4">▲ الطفل يقف هنا · {step ? stepShort(step) : 'لا توجد حركة حالية'}</text>
    </svg>
  );
}
