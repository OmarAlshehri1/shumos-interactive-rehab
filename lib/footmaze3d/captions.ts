import { turnBetween, type Pt, type Turn } from './mazes';
import { at, CONT_MS, actPose, prevNode, worldOf, type ActKind, type State } from './engine';

export const TURN_AR: Record<Turn, string> = { straight: 'امشِ للأمام', left: 'انعطف يسارًا', right: 'انعطف يمينًا', back: 'ارجع للخلف' };
export const WAIT_AR: Record<ActKind, { enter: string; hold: string; leave: string }> = {
  guard: { enter: 'الحارس قادم، انتظر', hold: 'انتظر هنا', leave: 'الحارس يبتعد' },
  swarm: { enter: 'الفراشات قادمة، انتظر', hold: 'انتظر، الفراشات تعبر', leave: 'الفراشات تبتعد' },
  gate: { enter: 'البوابة تُغلق، انتظر', hold: 'انتظر، البوابة تُفتح', leave: 'البوابة تُفتح' },
  bridge: { enter: 'الجسر يتحرك، انتظر', hold: 'انتظر، الجسر يمتد', leave: 'الجسر جاهز' },
  switch: { enter: 'الطريق يتغيّر، انتظر', hold: 'انتظر، الطريق يتغيّر', leave: 'اختر طريقك من جديد' },
};
export const KIND_LABEL_AR: Record<ActKind, string> = { guard: 'حارس ودود', swarm: 'فراشات تعبر', gate: 'بوابة تُفتح', bridge: 'جسر يمتد', switch: 'الطريق يتغيّر' };

export type Phase = 'ready' | 'countdown' | 'go' | 'choose' | 'wait' | 'continue' | 'complete' | 'ended';

export interface Guide {
  phase: Phase;
  turn: Turn | null;
  /** Turn needed at the corridor end after the heading (not known without a choice there), always null: the maze decides it. */
  label: string;
  sub: string;
}

/** Facing at the child's node: the way they came, or straight along the heading at the very start. */
export function turnOf(s: State, to: string | null = s.heading): Turn | null {
  const cur = at(s);
  if (!cur || !to) return null;
  const w = worldOf(s), pos = w.layout.pos;
  const back = prevNode(s);
  const a: Pt = back ? pos[back] : [pos[cur][0] - (pos[to][0] - pos[cur][0]), pos[cur][1] - (pos[to][1] - pos[cur][1])];
  return turnBetween(a, pos[cur], pos[to]);
}

export function guideOf(s: State): Guide {
  if (s.status === 'ended') return { phase: 'ended', turn: null, label: 'أحسنت!', sub: '' };
  if (s.status === 'stage-complete') return { phase: 'complete', turn: null, label: 'وصلنا!', sub: '' };
  if (s.status === 'ready') return { phase: 'ready', turn: null, label: 'معاينة المتاهة', sub: '' };
  if (s.clock < s.goAt) return { phase: 'countdown', turn: null, label: 'استعد', sub: '' };
  const w = worldOf(s);
  if (s.act) {
    const g = w.maze.guards.find((x) => x.id === s.act!.id);
    const p = actPose(s.act, s.clock, !!g?.alt);
    const t = WAIT_AR[s.act.kind];
    const friendly = s.act.kind === 'guard' || s.act.kind === 'swarm';
    const hold = friendly && s.config.stance && p.phase === 'hold' ? 'قف بثبات، الطريق مشغول' : t.hold;
    return { phase: 'wait', turn: null, label: p.phase === 'enter' ? t.enter : p.phase === 'hold' ? hold : t.leave, sub: friendly ? 'لا تتحرك حتى ترى «تابع»' : 'ننتظر معًا' };
  }
  if (s.contAt >= 0 && s.clock - s.contAt < CONT_MS) return { phase: 'continue', turn: null, label: 'تابع!', sub: 'الطريق مفتوح الآن' };
  if (!s.heading) return { phase: 'choose', turn: null, label: 'اختر الطريق', sub: 'انظر إلى المفترق ثم قرّر' };
  const turn = turnOf(s);
  const back = turn === 'back';
  return { phase: 'go', turn, label: turn ? TURN_AR[turn] : 'امشِ للأمام', sub: back ? 'لا بأس، لنعد خطوة' : '' };
}

/** Arabic name of a node for the therapist (landmarks first, then what kind of place it is). */
export function nodeNameAr(maze: import('./mazes').Maze, id: string): string {
  const n = maze.byId[id];
  if (!n) return id;
  if (maze.names[id]) return maze.names[id];
  if (n.type === 'start') return 'البداية';
  if (n.type === 'finish') return 'الوجهة';
  if (n.type === 'wait') return 'منطقة انتظار آمنة';
  if (n.type === 'room') return n.star ? 'غرفة بنجمة' : 'غرفة';
  if (n.deg >= 3) return n.star ? 'مفترق بنجمة' : 'مفترق';
  if (n.deg === 1) return n.star ? 'نهاية مسدودة بنجمة' : 'نهاية مسدودة';
  return n.star ? 'منعطف بنجمة' : 'منعطف';
}
