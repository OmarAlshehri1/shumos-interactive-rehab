import { bearingTo, currentMarker, wrapPi, type HoldMode, type State } from './engine';
import { ENVIRONMENTS, STAGES } from './stages';

/** short, calm Arabic instructions for the child's wall display (no dense text) */
export const HOLD_INSTRUCTION: Record<HoldMode, string> = {
    manual: 'اضغط وثبّت قليلًا',
    steering: 'ثبّت المقود بلطف',
    pedal: 'اضغط الدواسة بلطف',
    tap: 'ضغطات قصيرة وهادئة',
};
export function instruction(s: State): { text: string; icon: string } {
    if (s.status === 'ended') return { text: 'أحسنت! رحلة جميلة', icon: '✦' };
    if (s.status === 'stage-complete') return { text: 'أحسنت!', icon: '✦' };
    if (s.phase === 'celebrate') return { text: 'اكتشفت سمكة جديدة!', icon: '✦' };
    if (s.phase === 'encounter') return s.encounterMs < 1800 ? { text: 'سمكة ودودة قادمة', icon: '◌' } : { text: HOLD_INSTRUCTION[s.config.holdMode], icon: '◉' };
    const m = currentMarker(s);
    const diff = wrapPi(bearingTo(s, m) - s.heading);
    if (s.config.autoDrive) return { text: 'القارب يتجه إلى العلامة', icon: '↗' };
    if (diff > 0.35) return { text: 'لف يمينًا نحو العلامة', icon: '↱' };
    if (diff < -0.35) return { text: 'لف يسارًا نحو العلامة', icon: '↰' };
    return { text: 'اتجه إلى العلامة', icon: '↑' };
}
export const stageTitle = (stage: number) => `${ENVIRONMENTS[STAGES[stage].env].nameAr} · المرحلة ${stage % 3 + 1}`;
export const MODE_LABEL = { manual: 'يدوي من المعالج', wheel: 'مقود', pedal: 'دواسة', 'wheel-pedal': 'مقود ودواسة' } as const;
