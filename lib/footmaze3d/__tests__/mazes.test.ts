import { describe, expect, it } from 'vitest';
import { baseSeparation, closedSet, distancesTo, edgeKey, layoutOf, MAZE_DEFS, MAZE_IDS, mazeOf, openNeighbors, reachableStates, shortestRoute, turnBetween } from '../mazes';
import { STAGES } from '../stages';

describe('maze topology', () => {
  for (const id of MAZE_IDS) {
    for (const simple of [false, true]) {
      it(`${id}${simple ? ' (simplified)' : ''}: well-formed graph with axis-aligned corridors`, () => {
        const m = mazeOf(id, simple);
        expect(m.nodes.filter((n) => n.type === 'start')).toHaveLength(1);
        expect(m.nodes.filter((n) => n.type === 'finish')).toHaveLength(1);
        for (const e of m.edges) {
          const a = m.byId[e.a].p, b = m.byId[e.b].p;
          expect(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9).toBe(true);
          expect(e.len).toBeGreaterThan(0.5);
        }
        // no two corridors share the same endpoints, and every node is connected to the start
        expect(new Set(m.edges.map((e) => e.id)).size).toBe(m.edges.length);
        const seen = new Set([m.start]);
        const q = [m.start];
        for (let i = 0; i < q.length; i++) for (const n of m.adj[q[i]]) if (!seen.has(n)) { seen.add(n); q.push(n); }
        expect(seen.size).toBe(m.nodes.length);
        // no pass-through filler survives: every plain node is a decision, a turn or a dead end
        for (const n of m.nodes) if (n.type === 'normal' && !n.star && !n.labelled && n.deg === 2) {
          const [u, v] = m.adj[n.id].map((x) => m.byId[x].p);
          expect(Math.abs(u[0] - v[0]) < 1e-9 || Math.abs(u[1] - v[1]) < 1e-9 ? 'straight' : 'turn').toBe('turn');
        }
      });
    }
  }

  it('corridors never cross except at a node', () => {
    for (const id of MAZE_IDS) {
      const m = mazeOf(id, false);
      for (let i = 0; i < m.edges.length; i++) for (let j = i + 1; j < m.edges.length; j++) {
        const e = m.edges[i], f = m.edges[j];
        if ([e.a, e.b].some((x) => x === f.a || x === f.b)) continue;
        const [a, b, c, d] = [m.byId[e.a].p, m.byId[e.b].p, m.byId[f.a].p, m.byId[f.b].p];
        const horizE = a[1] === b[1], horizF = c[1] === d[1];
        if (horizE === horizF) continue; // parallel corridors cannot cross
        const [h0, h1, v0, v1] = horizE ? [a, b, c, d] : [c, d, a, b];
        const x = v0[0], y = h0[1];
        const crosses = x >= Math.min(h0[0], h1[0]) - 1e-9 && x <= Math.max(h0[0], h1[0]) + 1e-9 && y >= Math.min(v0[1], v1[1]) - 1e-9 && y <= Math.max(v0[1], v1[1]) + 1e-9;
        expect(crosses, `${id}: ${e.id} x ${f.id}`).toBe(false);
      }
    }
  });

  it('every guard, gate and route event is anchored on a real waiting zone and corridor', () => {
    for (const id of MAZE_IDS) {
      const m = mazeOf(id, false);
      for (const g of m.guards) {
        expect(m.byId[g.at]?.type, `${id}/${g.id}`).toBe('wait');
        expect(m.edgeById[edgeKey(...g.edge)], `${id}/${g.id} edge`).toBeDefined();
        expect(g.edge.includes(g.at), `${id}/${g.id} starts at its waiting zone`).toBe(true);
        if (g.alt) { expect(m.edgeById[edgeKey(...g.alt)]).toBeDefined(); expect(g.alt.includes(g.at)).toBe(true); }
      }
      for (const e of m.events) {
        expect(m.byId[e.at]?.type).toBe('wait');
        for (const [a, b] of [...e.close, ...e.open]) expect(m.edgeById[edgeKey(a, b)], `${id}/${e.id} ${a}-${b}`).toBeDefined();
      }
      for (const e of m.closedAtStart) expect(m.edgeById[e]).toBeDefined();
      for (const [node, ev] of Object.entries(m.needs)) { expect(m.byId[node].star).toBe(true); expect(m.events.some((e) => e.id === ev)).toBe(true); }
    }
  });

  it('is solvable from EVERY state a child can reach, with dynamic events on and off, full and simplified', () => {
    for (const id of MAZE_IDS) for (const simple of [false, true]) for (const events of [true, false]) {
      const m = mazeOf(id, simple);
      const states = reachableStates(m, { events });
      expect(states.length).toBeGreaterThan(3);
      for (const s of states) {
        const closed = closedSet(m, s.fired, { events });
        expect(distancesTo(m, m.finish, closed)[s.node], `${id} simple=${simple} events=${events} at ${s.node} fired=${s.fired}`).toBeDefined();
      }
    }
  });

  it('a route event never leaves the child standing in a closed-off pocket (the corridor they stand in always has a way out)', () => {
    for (const id of MAZE_IDS) {
      const m = mazeOf(id, false);
      for (const s of reachableStates(m, { events: true })) {
        const closed = closedSet(m, s.fired, { events: true });
        expect(openNeighbors(m, s.node, closed).length, `${id} at ${s.node}`).toBeGreaterThan(0);
      }
    }
  });

  it('every stage has a real route-solving challenge (junctions with a wrong way), except none is a single straight corridor', () => {
    const rows = STAGES.map((st) => {
      const m = mazeOf(st.maze, false);
      const junctions = m.nodes.filter((n) => n.deg >= 3).length;
      const dead = m.nodes.filter((n) => n.deg === 1 && n.type === 'normal').length;
      const route = shortestRoute(m, m.start, m.finish, closedSet(m, [], { events: false }));
      const turns = route.slice(2).filter((n, i) => turnBetween(m.byId[route[i]].p, m.byId[route[i + 1]].p, m.byId[n].p) !== 'straight').length;
      return { id: st.maze, junctions, dead, turns, stars: m.stars.length, guards: m.guards.length, events: m.events.length };
    });
    for (const r of rows) { expect(r.junctions, r.id).toBeGreaterThanOrEqual(1); expect(r.stars, r.id).toBeGreaterThanOrEqual(4); }
    expect(rows.filter((r) => r.dead > 0).length).toBeGreaterThanOrEqual(5);
    // difficulty rises by route complexity: later levels never have fewer junctions than the first level's average
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(rows.slice(6).map((r) => r.junctions))).toBeGreaterThan(avg(rows.slice(0, 3).map((r) => r.junctions)));
    expect(rows[4].guards).toBe(1);
    expect(rows[7].guards).toBe(2);
    expect(rows[8].guards).toBeGreaterThanOrEqual(2);
    expect(rows[8].events).toBe(1);
  });

  it('every stage keeps safe walls at its default corridor width, inside the safe margin', () => {
    for (const st of STAGES) for (const simple of [false, true]) {
      const m = mazeOf(st.maze, simple);
      const width = simple ? Math.min(2.6, st.width + 0.4) : st.width;
      const lay = layoutOf(m, { rot: 0, mirror: false, width, inset: 6 });
      expect(lay.warnings.filter((w) => w.includes('متقاربة')), `${st.maze} simple=${simple} minSep=${lay.minSep}`).toEqual([]);
      for (const n of m.nodes) {
        const [x, y] = lay.pos[n.id];
        expect(Math.abs(x) + width / 2).toBeLessThanOrEqual(8 * 0.94 + 1e-6);
        expect(Math.abs(y) + width / 2).toBeLessThanOrEqual(4.5 * 0.94 + 1e-6);
      }
    }
  });

  it('rotation by 180 and mirroring keep the topology and turn directions consistent with the child\'s own frame', () => {
    const m = mazeOf('butterfly', false);
    const a = layoutOf(m, { rot: 0, mirror: false, width: 1.6, inset: 6 });
    const b = layoutOf(m, { rot: 180, mirror: false, width: 1.6, inset: 6 });
    const route = shortestRoute(m, m.start, m.finish, new Set());
    for (let i = 2; i < route.length; i++) {
      const t0 = turnBetween(a.pos[route[i - 2]], a.pos[route[i - 1]], a.pos[route[i]]);
      const t1 = turnBetween(b.pos[route[i - 2]], b.pos[route[i - 1]], b.pos[route[i]]);
      expect(t1).toBe(t0); // a half-turn of the picture does not change what the child must do
    }
    const c = layoutOf(m, { rot: 0, mirror: true, width: 1.6, inset: 6 });
    const flips = route.slice(2).map((n, i) => [turnBetween(a.pos[route[i]], a.pos[route[i + 1]], a.pos[n]), turnBetween(c.pos[route[i]], c.pos[route[i + 1]], c.pos[n])]);
    for (const [x, y] of flips) expect(y).toBe(x === 'left' ? 'right' : x === 'right' ? 'left' : x);
  });

  it('simplified mazes have no decisions at all: a single main route', () => {
    for (const id of MAZE_IDS) {
      const m = mazeOf(id, true);
      expect(m.nodes.every((n) => n.deg <= 2), id).toBe(true);
      expect(m.events).toHaveLength(0);
      expect(m.closedAtStart).toHaveLength(0);
    }
  });

  it('every stage keeps room for a wider corridor than its default (base separation)', () => {
    for (const st of STAGES) expect(baseSeparation(mazeOf(st.maze, false))).toBeGreaterThanOrEqual(st.width + 0.22);
  });

  it('authored drawings are exactly 7 x 13 characters', () => {
    for (const d of Object.values(MAZE_DEFS)) { expect(d.rows).toHaveLength(7); for (const r of d.rows) expect(r).toHaveLength(13); }
  });
});
