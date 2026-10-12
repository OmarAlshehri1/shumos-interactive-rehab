/** Arabic instruction text for a step: shared by the child's Display caption and the therapist's Control. */
import { LANES } from './config';
import type { Step } from './engine';
import type { Foot, Target } from './stages';

export const FOOT_AR: Record<Foot, string> = { L: 'القدم اليسرى', R: 'القدم اليمنى', ANY: 'أي قدم', BOTH: 'القدمان معًا' };
export const FOOT_SHORT_AR: Record<Foot, string> = { L: 'يسار', R: 'يمين', ANY: 'أي قدم', BOTH: 'القدمان' };
export const laneName = (lane: number) => LANES[lane]?.nameAr ?? '';
export const laneHex = (lane: number) => LANES[lane]?.hex ?? '#fff';

function partOf(t: Target): string {
  if (t.role === 'stay') return `ثبّت ${FOOT_AR[t.foot]} على ${laneName(t.lane)}`;
  if (t.role === 'hold') return `ثبّت ${FOOT_AR[t.foot]} على ${laneName(t.lane)}`;
  if (t.role === 'jump') return `${FOOT_AR.BOTH} إلى ${laneName(t.lane)}`;
  if (t.foot === 'BOTH') return `${FOOT_AR.BOTH} على ${laneName(t.lane)}`;
  return `${FOOT_AR[t.foot]} إلى ${laneName(t.lane)}`;
}

export function captionOf(step: Pick<Step, 'kind' | 'targets' | 'holdMs'>): string {
  if (step.kind === 'hold') return `${partOf(step.targets[0])} · ${Math.round(step.holdMs / 100) / 10} ث`;
  if (step.kind === 'split') {
    const stay = step.targets.find((t) => t.role === 'stay')!;
    const move = step.targets.find((t) => t.role === 'move')!;
    return `ثبّت ${FOOT_AR[stay.foot]} على ${laneName(stay.lane)} · حرّك ${FOOT_AR[move.foot]} إلى ${laneName(move.lane)}`;
  }
  return step.targets.map(partOf).join(' · ');
}

/** What a step asks, in a form a therapist can scan: kind + lanes. */
export const shortOf = (step: Pick<Step, 'kind' | 'targets'>) => step.targets.map((t) => `${FOOT_SHORT_AR[t.foot]} ${laneName(t.lane)}`).join(' + ');
