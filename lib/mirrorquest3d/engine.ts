/** Features are normalized intentional movement values, never anatomical joint measurements. */
export const LIMBS = ['RIGHT_HAND', 'LEFT_HAND', 'RIGHT_FOOT', 'LEFT_FOOT'] as const;
export type Limb = typeof LIMBS[number];
export const CHARACTERS = ['lion', 'rabbit', 'bear', 'fox'] as const;
export type Character = typeof CHARACTERS[number];
export type Features = Record<Limb, number>;
export const neutral = (): Features => ({ RIGHT_HAND: 0, LEFT_HAND: 0, RIGHT_FOOT: 0, LEFT_FOOT: 0 });
export interface Pose { id: string; text: string; target: Features; active: Limb[] }
const pose = (id: string, text: string, values: Partial<Features>, active: Limb[]): Pose => ({ id, text, target: { ...neutral(), ...values }, active });
const rh: Limb = 'RIGHT_HAND', lh: Limb = 'LEFT_HAND', rf: Limb = 'RIGHT_FOOT', lf: Limb = 'LEFT_FOOT';
export const STAGES: { name: string; level: number; poses: Pose[] }[] = [
  { name: 'الذراع اليمنى', level: 1, poses: [pose('r1', 'ارفع ذراعك اليمنى قليلًا', { [rh]: .35 }, [rh]), pose('r2', 'افتح ذراعك اليمنى', { [rh]: .65 }, [rh]), pose('r3', 'أعد ذراعك بهدوء', {}, [rh])] },
  { name: 'الذراع اليسرى', level: 1, poses: [pose('l1', 'ارفع ذراعك اليسرى قليلًا', { [lh]: .35 }, [lh]), pose('l2', 'افتح ذراعك اليسرى', { [lh]: .65 }, [lh]), pose('l3', 'أعد ذراعك بهدوء', {}, [lh])] },
  { name: 'الذراعان معًا', level: 1, poses: [pose('b1', 'افتح ذراعيك معًا', { [rh]: .65, [lh]: .65 }, [rh, lh]), pose('b2', 'ارفع ذراعيك معًا', { [rh]: 1, [lh]: 1 }, [rh, lh]), pose('b3', 'أعد ذراعيك بهدوء', {}, [rh, lh])] },
  { name: 'القدم اليمنى', level: 2, poses: [pose('f1', 'حرّك قدمك اليمنى قليلًا', { [rf]: .35 }, [rf]), pose('f2', 'مدّ قدمك اليمنى برفق', { [rf]: .65 }, [rf]), pose('f3', 'أعد قدمك بهدوء', {}, [rf])] },
  { name: 'القدم اليسرى', level: 2, poses: [pose('g1', 'حرّك قدمك اليسرى قليلًا', { [lf]: .35 }, [lf]), pose('g2', 'مدّ قدمك اليسرى برفق', { [lf]: .65 }, [lf]), pose('g3', 'أعد قدمك بهدوء', {}, [lf])] },
  { name: 'القدمان بالتبادل', level: 2, poses: [pose('a1', 'مدّ قدمك اليمنى برفق', { [rf]: .35 }, [rf, lf]), pose('a2', 'والآن قدمك اليسرى', { [lf]: .35 }, [rf, lf]), pose('a3', 'أعد قدميك بهدوء', {}, [rf, lf])] },
  { name: 'ذراع وقدم', level: 3, poses: [pose('c1', 'الذراع اليمنى والقدم اليسرى', { [rh]: .35, [lf]: .35 }, [rh, lf]), pose('c2', 'افتح ذراعك مع قدمك', { [rh]: .65, [lf]: .35 }, [rh, lf]), pose('c3', 'عد إلى وضع الراحة', {}, [rh, lf])] },
  { name: 'حركات بالتبادل', level: 3, poses: [pose('d1', 'الذراع اليمنى والقدم اليسرى', { [rh]: .35, [lf]: .35 }, LIMBS.slice()), pose('d2', 'الذراع اليسرى والقدم اليمنى', { [lh]: .35, [rf]: .35 }, LIMBS.slice()), pose('d3', 'عد إلى وضع الراحة', {}, LIMBS.slice())] },
  { name: 'تحدّي المرآة', level: 3, poses: [pose('e1', 'افتح ذراعيك معًا', { [rh]: .65, [lh]: .65 }, LIMBS.slice()), pose('e2', 'الذراع اليمنى والقدم اليسرى', { [rh]: .35, [lf]: .35 }, LIMBS.slice()), pose('e3', 'الذراع اليسرى والقدم اليمنى', { [lh]: .35, [rf]: .35 }, LIMBS.slice()), pose('e4', 'عد إلى وضع الراحة', {}, LIMBS.slice())] },
];
export interface Config { limbs?: Limb[]; character: Character; tolerance: number; holdMs: number; movementScale: number; presentation: 'seated' | 'standing'; quality: 'low' | 'high'; reducedMotion: boolean; input: 'manual' | 'simulated' }
export interface AcceptedPose { nativePoseId?: string; key: string; stage: number; pose: number; assisted: boolean; skipped: boolean }
export interface State { sessionId: string; demonstration: number; run: number; stage: number; pose: number; status: 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended'; config: Config; player: Features; feedback: 'neutral' | 'near' | 'matched'; hold: number; lastTick: number; lastInput: number; sequence: number; accepted: AcceptedPose[]; completed: number[]; startedAt: number; endedAt: number }
export function createState(sessionId: string): State { return { sessionId, demonstration: 0, run: 0, stage: 0, pose: 0, status: 'ready', config: { limbs: [...LIMBS], character: 'lion', tolerance: .09, holdMs: 1200, movementScale: 1, presentation: 'standing', quality: 'high', reducedMotion: false, input: 'manual' }, player: neutral(), feedback: 'neutral', hold: 0, lastTick: 0, lastInput: 0, sequence: 0, accepted: [], completed: [], startedAt: 0, endedAt: 0 }; }
/** Keep the original stage/attempt slots; choose whole native poses using only selected limbs. Old payloads retain their original curriculum. */
export function stagePoses(s: State): Pose[] {
 const original = STAGES[s.stage].poses;
 if (!s.config.limbs) return original;
 const allowed = (p: Pose) => p.active.every(l => s.config.limbs!.includes(l));
 if (original.every(allowed)) return original;
 const pool = STAGES.flatMap(stage => stage.poses).filter(allowed);
 return original.map((_, i) => pool[i % pool.length]);
}
export function target(s: State): Pose { const p = stagePoses(s)[s.pose]; return { ...p, target: Object.fromEntries(LIMBS.map(l => [l, p.target[l] * s.config.movementScale])) as Features }; }
export function randomCharacter(random: number): Character { return CHARACTERS[Math.min(3, Math.max(0, Math.floor(random * 4)))]; }
export type Command = { type: 'input'; limb: Limb; value: number; sequence: number; at: number; source: 'manual' | 'simulated' } | { type: 'tick'; at: number } | { type: 'configure'; config: Partial<Config> } | { type: 'stage'; stage: number } | { type: 'start' | 'pause' | 'resume' | 'restart' | 'next' | 'repeat' | 'skip' | 'assist' | 'end'; at?: number };
function accept(s: State, assisted = false, skipped = false): State {
  const key = `${s.run}:${s.stage}:${s.pose}`;
  if (s.accepted.some(p => p.key === key)) return s;
  const accepted = [...s.accepted, { key, stage: s.stage, pose: s.pose, assisted, skipped, ...(s.config.limbs ? {nativePoseId:target(s).id} : {}) }];
  const last = s.pose === STAGES[s.stage].poses.length - 1;
  return { ...s, accepted, pose: last ? s.pose : s.pose + 1, status: last ? 'stage-complete' : s.status, completed: last && !accepted.some(p => p.stage === s.stage && p.skipped) ? [...new Set([...s.completed, s.stage])] : s.completed, hold: 0, lastTick: 0, lastInput: 0, feedback: 'neutral' };
}
export function reduce(s: State, c: Command): State {
  if (c.type === 'configure') {
    if (!['ready','paused'].includes(s.status)) return s;
    const config = { ...s.config, ...c.config };
    if (config.limbs !== undefined && (!Array.isArray(config.limbs) || !config.limbs.length || config.limbs.length > 4 || new Set(config.limbs).size !== config.limbs.length || !config.limbs.every(l=>LIMBS.includes(l)))) return s;
    if (!CHARACTERS.includes(config.character) || !Number.isFinite(config.tolerance) || config.tolerance < .02 || config.tolerance > .25 || !Number.isFinite(config.holdMs) || config.holdMs < 200 || config.holdMs > 10000 || !Number.isFinite(config.movementScale) || config.movementScale < .25 || config.movementScale > 1 || !['seated','standing'].includes(config.presentation) || !['low','high'].includes(config.quality) || !['manual','simulated'].includes(config.input) || typeof config.reducedMotion !== 'boolean') return s;
    return { ...s, config, hold: 0, lastTick: 0, lastInput: 0, feedback: 'neutral' };
  }
  if (c.type === 'stage') return ['ready','paused','stage-complete'].includes(s.status) && Number.isInteger(c.stage) && STAGES[c.stage] && !s.accepted.some(p=>p.stage===c.stage) ? { ...s, stage: c.stage, pose: 0, status: 'ready', player: neutral(), hold: 0, lastTick: 0, lastInput: 0, feedback: 'neutral' } : s;
  if (c.type === 'restart') return { ...createState(s.sessionId), run: s.run + 1, config: s.config };
  if (c.type === 'end') return s.status === 'ended' ? s : { ...s, status: 'ended', endedAt: c.at ?? 0, hold: 0 };
  if (c.type === 'start' || c.type === 'resume') return ((c.type === 'start' && s.status === 'ready') || (c.type === 'resume' && s.status === 'paused')) ? { ...s, status: 'running', startedAt: s.startedAt || c.at || 0, hold: 0, lastTick: 0, lastInput: 0 } : s;
  if (c.type === 'pause') return s.status === 'running' ? { ...s, status: 'paused', hold: 0, lastTick: 0, lastInput: 0 } : s;
  if (c.type === 'next') return s.status !== 'stage-complete' ? s : s.stage === 8 ? { ...s, status: 'ended', endedAt: c.at ?? 0 } : { ...s, stage: s.stage + 1, pose: 0, status: 'ready', player: neutral(), lastInput: 0 };
  if (c.type === 'repeat') return s.status === 'running' ? { ...s, demonstration: s.demonstration + 1, hold: 0, lastTick: 0, lastInput: 0 } : s;
  if (s.status !== 'running') return s;
  if (c.type === 'assist' || c.type === 'skip') return accept(s, c.type === 'assist', c.type === 'skip');
  if (c.type === 'input') {
    if (!LIMBS.includes(c.limb) || !Number.isFinite(c.value) || c.value < 0 || c.value > 1 || !Number.isInteger(c.sequence) || c.sequence <= s.sequence || !Number.isFinite(c.at) || c.at < s.lastInput || !['manual','simulated'].includes(c.source) || (c.source === 'simulated' && s.config.input !== 'simulated')) return s;
    return { ...s, player: { ...s.player, [c.limb]: c.value }, sequence: c.sequence, lastInput: c.at };
  }
  if (c.type !== 'tick' || !Number.isFinite(c.at) || c.at <= s.lastTick) return s;
  const fresh = s.lastInput > 0 && c.at >= s.lastInput && c.at - s.lastInput <= 750;
  const desired = target(s).target;
  const error = Math.max(...(s.config.limbs ? target(s).active : LIMBS).map(l => Math.abs(s.player[l] - desired[l])));
  const limit = s.config.tolerance + (s.feedback === 'matched' ? .025 : 0);
  const feedback = !fresh ? 'neutral' : error <= limit + 1e-9 ? 'matched' : error <= limit * 2.5 + (s.feedback === 'near' ? .025 : 0) ? 'near' : 'neutral';
  const gap = s.lastTick ? c.at - s.lastTick : 0;
  const hold = feedback === 'matched' ? s.hold + (s.feedback === 'matched' && gap <= 250 ? gap : 0) : 0;
  const next = { ...s, feedback, hold: gap > 250 ? 0 : hold, lastTick: c.at } as State;
  return next.hold >= s.config.holdMs ? accept(next) : next;
}
