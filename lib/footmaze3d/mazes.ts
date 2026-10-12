/**
 * Foot Maze: real maze topology. Each stage is an authored ASCII drawing on a 7 x 4 grid of cells. Corridors connect
 * cells, plain straight cells are compressed away, and what remains is a graph: start, finish, junctions, turns, dead
 * ends, safe waiting zones and rooms. Everything here is pure data + pure functions, so the engine, the Control map and
 * the Display all derive the same facts (and the tests can prove every stage is solvable in every event state).
 *
 * Course units: the floor picture is 16 x 9 units, x right, y up. One grid cell is 2 units.
 * Nothing here knows pixels, centimetres or the child's real position.
 */
export const AREA_W = 16;
export const AREA_H = 9;
export const PITCH = 2;
export const COLS = 7;
export const ROWS = 4;

export type Pt = [number, number];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export type MazeId = 'garden' | 'beach' | 'house' | 'forest' | 'festival' | 'butterfly' | 'crystal' | 'town' | 'palace';
export const MAZE_IDS: readonly MazeId[] = ['garden', 'beach', 'house', 'forest', 'festival', 'butterfly', 'crystal', 'town', 'palace'];

/** Visual flavour of a blocker. Only 'guard' and 'swarm' are friendly characters; 'gate' and 'bridge' are mechanisms. */
export type GuardKind = 'guard' | 'swarm' | 'gate' | 'bridge';
export type CharId = 'robot' | 'fox' | 'duck' | 'bear' | 'toy' | 'butterflies' | 'crystal' | 'none';

export interface GuardDef {
  id: string;
  /** Safe waiting node: the child is confirmed standing here when this starts. */
  at: string;
  /** Corridor it blocks (endpoint node ids). */
  edge: [string, string];
  /** A guardian that moves between two corridors: blocks `edge` first, then slides to `alt`. */
  alt?: [string, string];
  kind: GuardKind;
  char: CharId;
}

/** A route change that happens only while the child stands confirmed at `at`, before anyone enters the affected corridors. */
export interface EventDef {
  id: string;
  at: string;
  kind: 'switch';
  close: [string, string][];
  open: [string, string][];
}

export interface MazeDef {
  id: MazeId;
  /** 7 rows x 13 chars: see LEGEND. Row 2r holds nodes (even columns) and horizontal corridors (odd); row 2r+1 holds vertical corridors. */
  rows: readonly string[];
  mirror?: boolean;
  guards: GuardDef[];
  events: EventDef[];
  /** Corridors that exist but start closed (opened by an event). */
  closedAtStart: [string, string][];
  /** Star node -> event id that must have fired before the star is visible (a collectible that appears). */
  needs: Record<string, string>;
  /** Arabic names for rooms / landmarks, keyed by node id. */
  names: Record<string, string>;
}

/**
 * LEGEND  S start  F finish (always a star)  o plain  * star  W wait zone  A-E labelled wait zone (id = letter)
 *         R room   Q room + star  1-9 labelled plain node (id p1..p9)   - | corridor   . nothing
 */

const mk = (rows: string[]) => rows;

export const MAZE_DEFS: Record<MazeId, MazeDef> = {
  garden: {
    id: 'garden',
    rows: mk([
      '............F',
      '............|',
      '............*',
      '............|',
      '......*.....o',
      '......|.....|',
      'S-o-o-*-o-o-*',
    ]),
    guards: [], events: [], closedAtStart: [], needs: {}, names: { n63: 'الزاوية' },
  },
  beach: {
    id: 'beach',
    rows: mk([
      '....o-o-*....',
      '....|........',
      'S-o-o.......F',
      '....|.......|',
      '....o.......o',
      '....|.......|',
      '....*-o-*-o-*',
    ]),
    guards: [], events: [], closedAtStart: [], needs: {}, names: { n40: 'كهف الأصداف' },
  },
  house: {
    id: 'house',
    rows: mk([
      '....Q-o-Q....',
      '....|...|....',
      '....o...o....',
      '....|...|....',
      'S-o-R-o-R-o-F',
      '....|...|....',
      '....*-o-*....',
    ]),
    guards: [], events: [], closedAtStart: [], needs: {},
    names: { n20: 'المطبخ', n40: 'المكتبة', n22: 'الصالة', n42: 'غرفة اللعب', n62: 'غرفة النوم' },
  },
  forest: {
    id: 'forest',
    rows: mk([
      '........*...F',
      '........|...|',
      '*-o-o-o-o.*-o',
      '....|...|...|',
      '....o...o...o',
      '....|...|...|',
      'S-o-*...*-o-o',
    ]),
    guards: [], events: [], closedAtStart: [], needs: {}, names: {},
  },
  festival: {
    id: 'festival',
    rows: mk([
      '....o-o-*-o-F',
      '....|...|....',
      '....o...o....',
      '....|...|....',
      'S-o-A-o-o....',
      '........|....',
      '........*-o-*',
    ]),
    guards: [{ id: 'g1', at: 'A', edge: ['A', 'n42'], kind: 'guard', char: 'robot' }],
    events: [], closedAtStart: [], needs: {}, names: { A: 'منطقة الانتظار' },
  },
  butterfly: {
    id: 'butterfly',
    rows: mk([
      '....o-o-*-o-o',
      '....|...|...|',
      'S-o-o...o-*.o',
      '....|...|...|',
      '....o.*-o...F',
      '....|...|...|',
      '....o-o-A-o-o',
    ]),
    guards: [{ id: 'g1', at: 'A', edge: ['A', 'n63'], kind: 'swarm', char: 'butterflies' }],
    events: [], closedAtStart: [], needs: {}, names: { A: 'ركن الفراشات' },
  },
  crystal: {
    id: 'crystal',
    rows: mk([
      '....C-o-*-o-F',
      '....|.......|',
      '....*-o-B-o-o',
      '........|....',
      '........o....',
      '........|....',
      'S-o-A-o-o-o-*',
    ]),
    guards: [
      { id: 'g1', at: 'A', edge: ['A', 'n43'], kind: 'gate', char: 'none' },
      { id: 'g2', at: 'C', edge: ['C', 'n40'], kind: 'bridge', char: 'none' },
    ],
    events: [{ id: 'e1', at: 'B', kind: 'switch', close: [['B', 'n61']], open: [] }],
    closedAtStart: [], needs: {}, names: { A: 'البوابة البلورية', B: 'مفتاح الكريستال', C: 'جسر الضوء' },
  },
  town: {
    id: 'town',
    rows: mk([
      '....*.......F',
      '....|.......|',
      '*-o-o-o-B-o-o',
      '|...|...|...|',
      'o...o...o...o',
      '|...|...|...|',
      'S-o-A-o-*-o-*',
    ]),
    guards: [
      { id: 'g1', at: 'A', edge: ['A', 'n43'], kind: 'guard', char: 'robot' },
      { id: 'g2', at: 'B', edge: ['B', 'n61'], alt: ['B', 'n43'], kind: 'guard', char: 'duck' },
    ],
    events: [], closedAtStart: [], needs: {}, names: { A: 'ناصية السوق', B: 'مفترق الساحة' },
  },
  palace: {
    id: 'palace',
    mirror: true,
    rows: mk([
      '....*-o-C-o-F',
      '....|...|...|',
      '*-o-o-o-B-o-o',
      '|...|...|...|',
      'o...o...o...o',
      '|...|...|...|',
      'S-o-A-o-*-o-*',
    ]),
    guards: [
      { id: 'g1', at: 'A', edge: ['A', 'n43'], alt: ['A', 'n21'], kind: 'guard', char: 'bear' },
      { id: 'g2', at: 'C', edge: ['C', 'F'], kind: 'bridge', char: 'none' },
    ],
    events: [{ id: 'e1', at: 'B', kind: 'switch', close: [['B', 'n61']], open: [['n21', 'n20']] }],
    closedAtStart: [['n21', 'n20']],
    needs: { n20: 'e1' },
    names: { A: 'بوابة الألوان', B: 'قاعة المفاتيح', C: 'جسر قوس القزح', F: 'عرش الألوان' },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// parsed maze

export type NodeType = 'start' | 'finish' | 'normal' | 'wait' | 'room';

export interface MNode {
  id: string;
  type: NodeType;
  /** Grid cell in the AUTHORED drawing (before mirroring) and base position in course units. */
  c: number;
  r: number;
  p: Pt;
  star: boolean;
  labelled: boolean;
  deg: number;
}

export interface MEdge {
  id: string;
  a: string;
  b: string;
  len: number;
}

export interface Maze {
  id: MazeId;
  nodes: MNode[];
  byId: Record<string, MNode>;
  edges: MEdge[];
  edgeById: Record<string, MEdge>;
  adj: Record<string, string[]>;
  start: string;
  finish: string;
  /** Star node ids, nearest to the start first, finish last. */
  stars: string[];
  guards: GuardDef[];
  events: EventDef[];
  closedAtStart: string[];
  needs: Record<string, string>;
  names: Record<string, string>;
  simple: boolean;
}

export const edgeKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);
const posOf = (c: number, r: number, mirror: boolean): Pt => [((mirror ? COLS - 1 - c : c) - (COLS - 1) / 2) * PITCH, ((ROWS - 1) / 2 - r) * PITCH];

function parseDef(def: MazeDef): { nodes: MNode[]; edges: [string, string][] } {
  const rows = def.rows;
  if (rows.length !== ROWS * 2 - 1 || rows.some((r) => r.length !== COLS * 2 - 1)) throw new Error(`maze ${def.id}: bad drawing size`);
  const nodes: MNode[] = [];
  const at: Record<string, MNode> = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r * 2][c * 2];
      if (ch === '.') continue;
      let type: NodeType = 'normal', star = false, labelled = false, id = `n${c}${r}`;
      if (ch === 'S') type = 'start';
      else if (ch === 'F') { type = 'finish'; star = true; }
      else if (ch === '*') star = true;
      else if (ch === 'W') type = 'wait';
      else if (ch >= 'A' && ch <= 'E') { type = 'wait'; labelled = true; id = ch; }
      else if (ch === 'R') type = 'room';
      else if (ch === 'Q') { type = 'room'; star = true; }
      else if (ch >= '1' && ch <= '9') { labelled = true; id = `p${ch}`; }
      else if (ch !== 'o') throw new Error(`maze ${def.id}: unknown char ${ch}`);
      if (type === 'start') id = 'S';
      if (type === 'finish') id = 'F';
      const n: MNode = { id, type, c, r, p: posOf(c, r, !!def.mirror), star, labelled: labelled || type === 'start' || type === 'finish', deg: 0 };
      nodes.push(n);
      at[`${c},${r}`] = n;
    }
  }
  const edges: [string, string][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c < COLS - 1 && rows[r * 2][c * 2 + 1] === '-') {
        const a = at[`${c},${r}`], b = at[`${c + 1},${r}`];
        if (!a || !b) throw new Error(`maze ${def.id}: dangling corridor at ${c},${r}`);
        edges.push([a.id, b.id]);
      }
      if (r < ROWS - 1 && rows[r * 2 + 1][c * 2] === '|') {
        const a = at[`${c},${r}`], b = at[`${c},${r + 1}`];
        if (!a || !b) throw new Error(`maze ${def.id}: dangling corridor at ${c},${r}`);
        edges.push([a.id, b.id]);
      }
    }
  }
  return { nodes, edges };
}

/** Removes plain unlabelled straight-through cells so every remaining node is a decision, a turn, a star or a landmark. */
function compress(nodes: MNode[], edges: [string, string][], keep: (n: MNode) => boolean): { nodes: MNode[]; edges: MEdge[] } {
  const byId: Record<string, MNode> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const adj: Record<string, string[]> = {};
  for (const n of nodes) adj[n.id] = [];
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const removable = (n: MNode) => {
    if (keep(n) || n.type !== 'normal' || n.star || n.labelled || adj[n.id].length !== 2) return false;
    const [u, v] = adj[n.id].map((i) => byId[i]);
    return (u.c === n.c && v.c === n.c) || (u.r === n.r && v.r === n.r);
  };
  const dead = new Set(nodes.filter(removable).map((n) => n.id));
  const out: MEdge[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (dead.has(n.id)) continue;
    for (const first of adj[n.id]) {
      let prev = n.id, cur = first, len = dist(n.p, byId[first].p);
      while (dead.has(cur)) {
        const nxt = adj[cur].find((x) => x !== prev)!;
        len += dist(byId[cur].p, byId[nxt].p);
        prev = cur; cur = nxt;
      }
      const id = edgeKey(n.id, cur);
      if (seen.has(id) || cur === n.id) continue;
      seen.add(id);
      out.push({ id, a: n.id < cur ? n.id : cur, b: n.id < cur ? cur : n.id, len: Math.round(len * 100) / 100 });
    }
  }
  return { nodes: nodes.filter((n) => !dead.has(n.id)), edges: out };
}

function finish(def: MazeDef, nodes: MNode[], edges: MEdge[], simple: boolean, extra: Partial<Pick<Maze, 'guards' | 'events' | 'closedAtStart' | 'needs'>> = {}): Maze {
  const byId: Record<string, MNode> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const adj: Record<string, string[]> = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  for (const n of nodes) n.deg = adj[n.id].length;
  const start = nodes.find((n) => n.type === 'start')!.id, fin = nodes.find((n) => n.type === 'finish')!.id;
  // BFS hop distance from the start orders the stars
  const d: Record<string, number> = { [start]: 0 };
  const q = [start];
  for (let i = 0; i < q.length; i++) for (const m of adj[q[i]]) if (d[m] === undefined) { d[m] = d[q[i]] + 1; q.push(m); }
  const stars = nodes.filter((n) => n.star).sort((a, b) => (a.id === fin ? 1 : b.id === fin ? -1 : (d[a.id] ?? 99) - (d[b.id] ?? 99) || a.id.localeCompare(b.id))).map((n) => n.id);
  return {
    id: def.id, nodes, byId, edges, edgeById: Object.fromEntries(edges.map((e) => [e.id, e])), adj, start, finish: fin, stars,
    guards: extra.guards ?? def.guards, events: extra.events ?? def.events, closedAtStart: extra.closedAtStart ?? def.closedAtStart.map(([a, b]) => edgeKey(a, b)),
    needs: extra.needs ?? def.needs, names: def.names, simple,
  };
}

const cache = new Map<string, Maze>();

/** The authored maze, or its simplified version: only the main route, no dead ends, no side stars, no route-changing events. */
export function mazeOf(id: MazeId, simple = false): Maze {
  const key = `${id}|${simple ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = MAZE_DEFS[id];
  const parsed = parseDef(def);
  const keepWaits = new Set(def.guards.map((g) => g.at).concat(def.events.map((e) => e.at)));
  const full = compress(parsed.nodes, parsed.edges, (n) => keepWaits.has(n.id));
  let result: Maze;
  if (!simple) {
    result = finish(def, full.nodes, full.edges, false);
  } else {
    const base = finish(def, full.nodes.map((n) => ({ ...n })), full.edges, false);
    // main route = shortest start -> finish over every corridor (event closures ignored)
    const prev: Record<string, string | null> = { [base.start]: null };
    const q = [base.start];
    for (let i = 0; i < q.length; i++) for (const m of base.adj[q[i]]) if (!(m in prev)) { prev[m] = q[i]; q.push(m); }
    const route: string[] = [];
    for (let cur: string | null = base.finish; cur; cur = prev[cur] ?? null) route.unshift(cur);
    const onRoute = new Set(route);
    const routeEdges = new Set(route.slice(1).map((n, i) => edgeKey(route[i], n)));
    const nodes = base.nodes.filter((n) => onRoute.has(n.id)).map((n) => ({ ...n, deg: 0 }));
    const edges = base.edges.filter((e) => routeEdges.has(e.id));
    const keep = new Set(def.guards.filter((g) => routeEdges.has(edgeKey(g.edge[0], g.edge[1]))).map((g) => g.at));
    const squeezed = compress(nodes, edges.map((e) => [e.a, e.b] as [string, string]), (n) => keep.has(n.id));
    const guards = def.guards.filter((g) => routeEdges.has(edgeKey(g.edge[0], g.edge[1]))).map((g) => ({ ...g, alt: undefined }));
    // after compress, a guard's edge may span merged corridors: keep only guards whose corridor still exists as written
    const edgeIds = new Set(squeezed.edges.map((e) => e.id));
    const okGuards = guards.filter((g) => edgeIds.has(edgeKey(g.edge[0], g.edge[1])));
    result = finish(def, squeezed.nodes, squeezed.edges, true, { guards: okGuards, events: [], closedAtStart: [], needs: {} });
  }
  cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------
// state-dependent facts (shared by engine, Control and Display)

export interface WorldFlags { events: boolean }

/** Corridors that are closed after the given events fired. With dynamic events off, nothing is ever closed. */
export function closedSet(maze: Maze, fired: readonly string[], flags: WorldFlags): Set<string> {
  const out = new Set<string>();
  if (!flags.events) return out;
  for (const e of maze.closedAtStart) out.add(e);
  for (const ev of maze.events) {
    if (!fired.includes(ev.id)) continue;
    for (const [a, b] of ev.close) out.add(edgeKey(a, b));
    for (const [a, b] of ev.open) out.delete(edgeKey(a, b));
  }
  return out;
}

/** Open neighbours of a node (closed corridors excluded). */
export function openNeighbors(maze: Maze, id: string, closed: ReadonlySet<string>): string[] {
  return (maze.adj[id] ?? []).filter((m) => !closed.has(edgeKey(id, m)));
}

/** Walking length from every node to `target` over open corridors (Dijkstra on a tiny graph). Unreachable nodes are absent. */
export function distancesTo(maze: Maze, target: string, closed: ReadonlySet<string>): Record<string, number> {
  const d: Record<string, number> = { [target]: 0 };
  const todo = new Set<string>([target]);
  while (todo.size) {
    let cur = '', best = Infinity;
    for (const n of todo) if (d[n] < best) { best = d[n]; cur = n; }
    todo.delete(cur);
    for (const m of openNeighbors(maze, cur, closed)) {
      const nd = d[cur] + maze.edgeById[edgeKey(cur, m)].len;
      if (d[m] === undefined || nd < d[m] - 1e-9) { d[m] = nd; todo.add(m); }
    }
  }
  return d;
}

/** A shortest route as node ids (inclusive), or [] if none. Ties break toward lower node ids so it is deterministic. */
export function shortestRoute(maze: Maze, from: string, to: string, closed: ReadonlySet<string>): string[] {
  const d = distancesTo(maze, to, closed);
  if (d[from] === undefined) return [];
  const route = [from];
  let cur = from;
  for (let guard = 0; cur !== to && guard < 80; guard++) {
    const opts = openNeighbors(maze, cur, closed).filter((m) => d[m] !== undefined && Math.abs(d[m] + maze.edgeById[edgeKey(cur, m)].len - d[cur]) < 1e-6).sort();
    if (!opts.length) return [];
    cur = opts[0];
    route.push(cur);
  }
  return cur === to ? route : [];
}

/** All (node, fired events) states a child could be in, following any open corridor. Used to prove solvability. */
export function reachableStates(maze: Maze, flags: WorldFlags): { node: string; fired: string[] }[] {
  const seen = new Set<string>();
  const out: { node: string; fired: string[] }[] = [];
  const todo: { node: string; fired: string[] }[] = [{ node: maze.start, fired: [] }];
  while (todo.length) {
    const s = todo.pop()!;
    const key = `${s.node}|${[...s.fired].sort().join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    const closed = closedSet(maze, s.fired, flags);
    for (const m of openNeighbors(maze, s.node, closed)) {
      let fired = s.fired;
      if (flags.events) for (const ev of maze.events) if (ev.at === m && !fired.includes(ev.id)) fired = [...fired, ev.id];
      todo.push({ node: m, fired });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// geometry / placement

export interface LayoutOptions {
  rot: 0 | 180;
  mirror: boolean;
  width: number;
  /** Safe inset, percent of the picture (from the shared projection profile; 6 when none). */
  inset: number;
}

export interface Layout {
  pos: Record<string, Pt>;
  width: number;
  /** Uniform shrink applied so the maze plus its corridor width stays inside the safe area (1 = none). */
  scale: number;
  /** Smallest centre-to-centre gap between two corridors that do not touch (course units, after scaling). */
  minSep: number;
  warnings: string[];
}

function segDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  // axis-aligned corridors: distance between two segments, by sampling endpoints against the other segment (exact for parallel / perpendicular)
  const pt = (p: Pt, u: Pt, v: Pt) => {
    const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / l2));
    return Math.hypot(p[0] - (u[0] + t * dx), p[1] - (u[1] + t * dy));
  };
  return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
}

export function layoutOf(maze: Maze, o: LayoutOptions): Layout {
  const inset = Math.max(3, Math.min(20, o.inset));
  const extX = Math.max(1, ...maze.nodes.map((n) => Math.abs(n.p[0]))), extY = Math.max(1, ...maze.nodes.map((n) => Math.abs(n.p[1])));
  const room = maze.nodes.some((n) => n.type === 'room') ? 0.35 : 0;
  const halfW = (AREA_W / 2) * (1 - inset / 100) - o.width / 2 - room;
  const halfH = (AREA_H / 2) * (1 - inset / 100) - o.width / 2 - room;
  const scale = Math.max(0.5, Math.min(1, halfW / extX, halfH / extY));
  const sign = o.rot === 180 ? -1 : 1;
  const pos: Record<string, Pt> = {};
  for (const n of maze.nodes) {
    let x = n.p[0] * scale;
    const y = n.p[1] * scale;
    if (o.mirror) x = -x;
    pos[n.id] = [Math.round(x * sign * 1000) / 1000 + 0, Math.round(y * sign * 1000) / 1000 + 0];
  }
  let minSep = Infinity;
  for (let i = 0; i < maze.edges.length; i++) {
    for (let j = i + 1; j < maze.edges.length; j++) {
      const e = maze.edges[i], f = maze.edges[j];
      if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
      const d = segDist(pos[e.a], pos[e.b], pos[f.a], pos[f.b]);
      // two corridors whose nearest points are the two ends of a third corridor (an L / U bend) need no wall between them
      const bridged = maze.edges.some((g) => ((g.a === e.a || g.a === e.b) && (g.b === f.a || g.b === f.b || false)) || ((g.b === e.a || g.b === e.b) && (g.a === f.a || g.a === f.b)));
      if (bridged && d >= 0.99 * Math.min(...maze.edges.filter((g) => ((g.a === e.a || g.a === e.b) && (g.b === f.a || g.b === f.b)) || ((g.b === e.a || g.b === e.b) && (g.a === f.a || g.a === f.b))).map((g) => dist(pos[g.a], pos[g.b])))) continue;
      minSep = Math.min(minSep, d);
    }
  }
  const warnings: string[] = [];
  if (Number.isFinite(minSep) && minSep - o.width < 0.22) warnings.push('المسارات متقاربة: قلّل عرض الممر أو فعّل المسار المبسّط');
  if (scale < 1) warnings.push('صُغّرت المتاهة لتبقى داخل الهامش الآمن للعرض');
  return { pos, width: o.width, scale, minSep: Number.isFinite(minSep) ? Math.round(minSep * 100) / 100 : 99, warnings };
}

/** Smallest centre gap (base layout, no scaling) of non-touching corridors: a stage can never use a corridor wider than this minus a wall. */
export function baseSeparation(maze: Maze): number {
  return layoutOf(maze, { rot: 0, mirror: false, width: 0, inset: 3 }).minSep;
}

export type Turn = 'straight' | 'left' | 'right' | 'back';

/** Turn needed to go from heading `from->at` to `at->to`, in the child's own frame (left/right as the child sees them, y up). */
export function turnBetween(from: Pt, at: Pt, to: Pt): Turn {
  const ax = at[0] - from[0], ay = at[1] - from[1], bx = to[0] - at[0], by = to[1] - at[1];
  const cross = ax * by - ay * bx, dot = ax * bx + ay * by;
  if (Math.abs(cross) < 1e-6) return dot > 0 ? 'straight' : 'back';
  return cross > 0 ? 'left' : 'right';
}
