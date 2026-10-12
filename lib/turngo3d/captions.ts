import { turnAt, type CpKind, type EventKind, type Pt, type TurnDir } from './courses';
import { activeCp, countdownLeft, schedule, stat, type State } from './engine';

export const TURN_AR: Record<TurnDir, string> = { straight: 'امشِ للأمام', left: 'انعطف يسارًا', right: 'انعطف يمينًا' };
export const TURN_THEN_AR: Record<TurnDir, string> = { straight: 'ثم تابع للأمام', left: 'ثم انعطف يسارًا', right: 'ثم انعطف يمينًا' };
export const EVENT_WAIT_AR: Record<EventKind, string> = {
  light: 'انتظر الإشارة الخضراء',
  character: 'صديقنا يقول: انتظر قليلًا',
  gate: 'انتظر، البوابة تُفتح',
  switch: 'انتظر، السهم يغيّر الاتجاه',
  block: 'انتظر، الطريق القديم مغلق',
  altStar: 'انتظر، ظهرت نجمة في مكان آخر',
};

export type Phase = 'ready' | 'countdown' | 'go' | 'wait' | 'hold' | 'complete' | 'ended';

export interface Guide {
  phase: Phase;
  /** Where the child last stood (start marker or the last resolved star) and where they walk to now. */
  origin: Pt;
  target: Pt;
  /** Facing before this segment: the previous segment's direction, or the start-facing direction on the first one. */
  turn: TurnDir;
  /** Turn needed AT the target (what to do once the star is reached), or null on the last one. */
  next: TurnDir | null;
  kind: CpKind;
  cp: number;
  total: number;
  label: string;
  sub: string;
}

/** Position of checkpoint i with the active route variant applied. */
export function cpPos(s: State, i: number): Pt {
  const plan = schedule(s).plan;
  return s.route[String(i)] === 1 && plan.alts[i] ? (plan.alts[i] as Pt) : plan.cps[i];
}

export function guideOf(s: State): Guide {
  const sch = schedule(s);
  const plan = sch.plan;
  const st = stat(s);
  const total = plan.cps.length;
  let cp = st.res.length === total ? activeCp(s) : 0;
  const done = s.status === 'stage-complete' || s.status === 'ended' || (st.res.length === total && cp < 0);
  if (cp < 0) cp = total - 1;
  let originIdx = -1;
  for (let i = cp - 1; i >= 0; i--) if (st.res[i] && st.res[i] !== 'pending') { originIdx = i; break; }
  const origin = originIdx >= 0 ? cpPos(s, originIdx) : plan.start;
  const target = cpPos(s, cp);
  let before: Pt;
  if (originIdx >= 1) before = cpPos(s, originIdx - 1);
  else if (originIdx === 0) before = plan.start;
  else before = [2 * origin[0] - target[0], 2 * origin[1] - target[1]]; // first segment: the child already faces the way of travel
  const turn = turnAt(before, origin, target);
  const next = cp < total - 1 ? turnAt(origin, target, cpPos(s, cp + 1)) : null;
  const kind = sch.kinds[cp];
  let phase: Phase = 'go';
  if (s.status === 'ended') phase = 'ended';
  else if (done) phase = 'complete';
  else if (s.status === 'ready') phase = 'ready';
  else if (s.wait) phase = 'wait';
  else if (s.hold) phase = 'hold';
  else if (countdownLeft(s) > 0) phase = 'countdown';
  const label =
    phase === 'wait' ? EVENT_WAIT_AR[s.wait!.kind]
      : phase === 'hold' ? 'قف مكانك'
        : phase === 'countdown' ? 'استعد'
          : phase === 'complete' || phase === 'ended' ? 'أحسنت!'
            : kind === 'stop' ? `${TURN_AR[turn]}، ثم قف عند العلامة`
              : kind === 'finish' ? `${TURN_AR[turn]} حتى النهاية`
                : TURN_AR[turn];
  const sub = next && phase === 'go' ? TURN_THEN_AR[next] : '';
  return { phase, origin, target, turn, next, kind, cp, total, label, sub };
}
