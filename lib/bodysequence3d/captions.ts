import { activeStep, countdownLeft, currentRound, previewLeft, stepNow, type State } from './engine';
import type { Foot, Lane, Step } from './sequence';

export const FOOT_AR: Record<Foot, string> = { R: 'اليمنى', L: 'اليسرى' };
export const FOOT_NOUN_AR: Record<Foot, string> = { R: 'قدمك اليمنى', L: 'قدمك اليسرى' };
export const LANE_AR: Record<Lane, string> = { L: 'الممر الأيسر', C: 'الممر الأوسط', R: 'الممر الأيمن', H: 'وضع الاستعداد' };
export const LANE_SHORT_AR: Record<Lane, string> = { L: 'يسار', C: 'وسط', R: 'يمين', H: 'استعداد' };
/** Directional arrows are drawn from the CHILD'S side: left/right glyphs are never mirrored by the layout. */
export const LANE_ARROW: Record<Lane, string> = { L: '←', C: '↑', R: '→', H: '↓' };

export const INSTRUCTION_INTRO_AR = 'شاهد ترتيب الحركات، وحرّك قدمك اليمنى أو اليسرى حسب العلامة.';
export const INSTRUCTION_MEMORY_AR = 'تذكّر ترتيب الخطوات، ثم نفّذها واحدة واحدة.';

/** The main instruction for one movement, in the child's own words. */
export function stepText(step: Step): string {
  if (step.move === 'stop') return 'قِف ثابتًا';
  if (step.foot === 'any') return 'تحرّك';
  const foot = FOOT_NOUN_AR[step.foot];
  if (step.move === 'return') return `أعد ${foot} إلى وضع الاستعداد`;
  if (step.anchor) return `اثبت بـ${FOOT_NOUN_AR[step.anchor.foot]}، وحرّك ${foot} إلى ${LANE_AR[step.lane]}`;
  return `حرّك ${foot} إلى ${LANE_AR[step.lane]}`;
}

/** Short therapist-facing form. */
export function stepShort(step: Step): string {
  if (step.move === 'stop') return 'توقّف';
  if (step.foot === 'any') return '—';
  if (step.move === 'return') return `${FOOT_AR[step.foot]} ← استعداد`;
  return `${FOOT_AR[step.foot]} ← ${LANE_SHORT_AR[step.lane]}${step.anchor ? ` (و${FOOT_AR[step.anchor.foot]} تثبت)` : ''}`;
}

export type GuidePhase = 'ready' | 'countdown' | 'preview' | 'go' | 'hold' | 'inter' | 'complete' | 'ended';

export interface Guide {
  phase: GuidePhase;
  step: Step | null;
  stepIndex: number;
  /** Which previewed movement is lit right now (memory preview), else -1. */
  previewIndex: number;
  label: string;
  sub: string;
  /** True when the instruction for the active movement is drawn on the floor (otherwise it is hidden for memory recall). */
  revealed: boolean;
}

export function guideOf(s: State): Guide {
  const round = currentRound(s);
  const idx = activeStep(s);
  const step = stepNow(s);
  const total = round.steps.length;
  let previewIndex = -1;
  if (s.phase === 'preview' && s.status === 'running') {
    const elapsed = s.clock - Math.max(s.previewAt, s.goAt);
    previewIndex = elapsed < 600 ? -1 : Math.min(total - 1, Math.floor((elapsed - 600) / 1300));
  }
  let phase: GuidePhase = 'go';
  if (s.status === 'ended') phase = 'ended';
  else if (s.status === 'stage-complete') phase = 'complete';
  else if (s.status === 'ready') phase = 'ready';
  else if (countdownLeft(s) > 0) phase = 'countdown';
  else if (s.inter > 0) phase = 'inter';
  else if (s.phase === 'preview') phase = 'preview';
  else if (s.hold) phase = 'hold';
  const prev = idx > 0 ? round.steps[idx - 1] : null;
  const revealed = round.mode !== 'remember' || s.config.hints || phase !== 'go';
  let label = '';
  let sub = '';
  switch (phase) {
    case 'ready': label = 'جاهز'; break;
    case 'countdown': label = 'استعد'; break;
    case 'preview': label = 'شاهد وتذكّر'; sub = previewLeft(s) > 0 ? INSTRUCTION_MEMORY_AR : ''; break;
    case 'inter': label = 'أحسنت!'; sub = 'اكتمل الترتيب'; break;
    case 'hold': label = step?.move === 'stop' ? 'قِف ثابتًا' : 'اثبت قليلًا'; sub = step?.anchor ? `واصل الثبات بـ${FOOT_NOUN_AR[step.anchor.foot]}` : ''; break;
    case 'complete': case 'ended': label = 'أحسنت!'; break;
    case 'go': {
      if (step) {
        label = revealed ? stepText(step) : `نفّذ من الذاكرة: الحركة ${idx + 1} من ${total}`;
        sub = prev?.move === 'stop' ? 'تابع' : round.showAll || round.mode === 'remember' ? `الحركة ${idx + 1} من ${total}` : '';
      }
      break;
    }
  }
  return { phase, step, stepIndex: idx, previewIndex, label, sub, revealed };
}
