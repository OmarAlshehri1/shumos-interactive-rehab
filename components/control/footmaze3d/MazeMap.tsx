'use client';
import { dist, edgeKey, type Pt } from '@/lib/footmaze3d/mazes';
import { at, exits, worldOf, type Command, type State } from '@/lib/footmaze3d/engine';
import { nodeNameAr } from '@/lib/footmaze3d/captions';
import styles from './control.module.css';

const GUARD_ICON = { robot: '🤖', fox: '🦊', duck: '🦆', bear: '🐻', toy: '🧸', butterflies: '🦋', crystal: '💎', none: '' } as const;
const KIND_ICON = { gate: '⛩', bridge: '🌉', swarm: '🦋', guard: '' } as const;
const star = (cx: number, cy: number, r: number) => Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.46 : r; return `${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`; }).join(' ');

/**
 * Therapist's map of the maze, laid out exactly as the floor picture is (rotation and mirroring included). While a stage
 * runs, tapping a corridor end that the child can walk to records the child's route choice. It never claims to know where
 * the child really is: the blue marker is only where YOU last confirmed them.
 */
export function MazeMap({ s, send, enabled }: { s: State; send: (c: Command) => void; enabled: boolean }) {
  const w = worldOf(s);
  const { maze, layout } = w;
  const P = (id: string): Pt => [layout.pos[id][0], -layout.pos[id][1]];
  const cur = at(s);
  const ex = enabled && s.status === 'running' && !s.act && s.clock >= s.goAt ? exits(s, w) : [];
  const res = s.stats[s.stage].res;
  const running = s.status === 'running' || s.status === 'paused';
  const hw = w.width / 2;
  return (
    <div className={styles.mapWrap}>
      <svg className={styles.mapSvg} viewBox="-8.4 -4.9 16.8 9.8" role="img" aria-label="خريطة المتاهة" data-testid="fm-map" data-width={w.width} data-scale={layout.scale}>
        <rect x="-8" y="-4.5" width="16" height="9" rx="0.3" fill="#0b2a1a" stroke="#2f8a5c" strokeWidth="0.05" strokeDasharray="0.3 0.2" />
        {maze.edges.map((e) => {
          const a = P(e.a), b = P(e.b), closed = w.closed.has(e.id);
          return (
            <g key={e.id}>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0a1810" strokeWidth={w.width + 0.28} strokeLinecap="round" />
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={closed ? '#6a4a12' : '#c9b98a'} strokeWidth={w.width} strokeLinecap="round" strokeDasharray={closed ? '0.25 0.2' : undefined} data-closed={closed ? '1' : '0'} />
            </g>
          );
        })}
        {maze.guards.map((g) => {
          const far = g.edge[0] === g.at ? g.edge[1] : g.edge[0];
          const a = P(g.at), b = P(far), t = Math.min(0.6, 2.4 / Math.max(0.1, dist(a, b)));
          const icon = g.kind === 'guard' ? GUARD_ICON[g.char] : KIND_ICON[g.kind];
          const running2 = s.act?.id === g.id;
          return (
            <text key={g.id} x={a[0] + (b[0] - a[0]) * t} y={a[1] + (b[1] - a[1]) * t + 0.35} fontSize="1.1" textAnchor="middle" opacity={running2 ? 1 : 0.8} data-testid={`fm-guard-${g.id}`}>{icon}</text>
          );
        })}
        {maze.nodes.map((n) => {
          const p = P(n.id), i = maze.stars.indexOf(n.id);
          const done = i >= 0 && (res[i] === 'confirmed' || res[i] === 'assisted');
          const skipped = i >= 0 && res[i] === 'skipped';
          return (
            <g key={n.id}>
              {n.type === 'wait' && <circle cx={p[0]} cy={p[1]} r={hw * 0.95} fill="none" stroke="#ffb020" strokeWidth="0.1" strokeDasharray="0.22 0.16" />}
              {n.type === 'room' && <rect x={p[0] - hw - 0.2} y={p[1] - hw - 0.2} width={w.width + 0.4} height={w.width + 0.4} rx="0.25" fill="#e8d6aa" opacity="0.35" />}
              {n.type === 'start' && <circle cx={p[0]} cy={p[1]} r={hw * 0.8} fill="#3ddc84" opacity="0.55" />}
              {n.type === 'finish' && <><circle cx={p[0]} cy={p[1]} r={hw * 0.95} fill="#ffd23f" opacity="0.35" /><text x={p[0]} y={p[1] + 0.3} fontSize="0.95" textAnchor="middle">🏁</text></>}
              {i >= 0 && n.type !== 'finish' && <polygon points={star(p[0], p[1], 0.42)} fill={done ? '#ffc42e' : skipped ? '#7b8794' : 'none'} stroke={skipped ? '#7b8794' : '#ffc42e'} strokeWidth="0.09" strokeLinejoin="round" opacity={s.config.events === false || !w.maze.needs[n.id] || s.fired.includes(w.maze.needs[n.id]) ? 1 : 0.35} />}
              {n.deg >= 3 && n.type === 'normal' && <circle cx={p[0]} cy={p[1]} r="0.18" fill="#14243f" opacity="0.7" />}
            </g>
          );
        })}
        {running && cur && <circle cx={P(cur)[0]} cy={P(cur)[1]} r={hw * 0.5} fill="#4aa8ff" stroke="#fff" strokeWidth="0.1" data-testid="fm-marker" />}
        {s.heading && cur && w.maze.adj[cur]?.includes(s.heading) && (
          <line x1={P(cur)[0]} y1={P(cur)[1]} x2={P(s.heading)[0]} y2={P(s.heading)[1]} stroke="#4aa8ff" strokeWidth="0.22" strokeLinecap="round" strokeDasharray="0.3 0.25" data-testid="fm-heading-line" />
        )}
        {ex.map((id) => {
          const p = P(id);
          return (
            <g key={id} className={styles.node} role="button" tabIndex={0} aria-label={`اختيار الطريق إلى ${nodeNameAr(maze, id)}`} data-testid={`fm-node-${id}`} data-chosen={s.heading === id ? '1' : '0'} onClick={() => send({ type: 'choose', to: id })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); send({ type: 'choose', to: id }); } }}>
              <circle className="hit" cx={p[0]} cy={p[1]} r={Math.max(0.6, hw * 0.6)} fill={s.heading === id ? '#4aa8ff' : '#4aa8ff'} opacity={s.heading === id ? 0.7 : 0.28} stroke="#9fd0ff" strokeWidth="0.07" />
            </g>
          );
        })}
        <text x="-7.8" y="-4.1" fontSize="0.42" fill="#8fd8ff" opacity="0.7">{layout.scale < 1 ? `صُغّرت ×${layout.scale.toFixed(2)}` : ''}</text>
      </svg>
    </div>
  );
}
void edgeKey;
