import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { closedSet, layoutOf, mazeOf, shortestRoute, turnBetween } from '../mazes';
import { STAGES } from '../stages';

/** Generates the stage matrix of the report from the code itself (FM_WRITE_MATRIX=1 writes docs/footmaze3d/stage-matrix.md). */
describe('stage matrix', () => {
  it('describes nine distinct mazes, each with its own mechanics', () => {
    const rows = STAGES.map((st, i) => {
      const m = mazeOf(st.maze, false), simple = mazeOf(st.maze, true);
      const open = closedSet(m, [], { events: false });
      const route = shortestRoute(m, m.start, m.finish, open);
      const pts = layoutOf(m, { rot: 0, mirror: false, width: st.width, inset: 6 });
      const turns = route.slice(2).filter((n, k) => turnBetween(m.byId[route[k]].p, m.byId[route[k + 1]].p, m.byId[n].p) !== 'straight').length;
      const len = route.slice(1).reduce((s, n, k) => s + m.edgeById[route[k] < n ? `${route[k]}~${n}` : `${n}~${route[k]}`].len, 0);
      return {
        no: `${st.level}.${st.stage}`, name: `${st.nameAr} / ${st.nameEn}`, theme: st.theme, nodes: m.nodes.length, corridors: m.edges.length,
        junctions: m.nodes.filter((n) => n.deg >= 3).length, dead: m.nodes.filter((n) => n.deg === 1 && n.type !== 'start' && n.type !== 'finish').length,
        stars: m.stars.length, turns, len: Math.round(len * 10) / 10, simpleNodes: simple.nodes.length,
        guards: m.guards.map((g) => g.kind + (g.alt ? '↔' : '')).join(', ') || '—', events: m.events.length ? `switch×${m.events.length}` : '—',
        closed: m.closedAtStart.length, collect: Object.keys(m.needs).length, hint: st.hint, width: st.width, sep: pts.minSep, scale: pts.scale, i,
      };
    });
    expect(new Set(rows.map((r) => r.theme)).size).toBe(9);
    expect(new Set(rows.map((r) => `${r.nodes}|${r.corridors}|${r.guards}|${r.events}`)).size).toBeGreaterThanOrEqual(8);
    if (process.env.FM_WRITE_MATRIX === '1') {
      const head = '| Stage | Name | Environment | Nodes | Corridors | Junctions | Dead ends | Stars | Turns on main route | Route length | Guardians / mechanisms | Route events | Collectible | Guidance | Default width |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
      const body = rows.map((r) => `| ${r.no} | ${r.name} | ${r.theme} | ${r.nodes} | ${r.corridors} | ${r.junctions} | ${r.dead} | ${r.stars} | ${r.turns} | ${r.len} | ${r.guards} | ${r.events} | ${r.collect ? 'yes' : '—'} | ${r.hint} | ${r.width} |`).join('\n');
      writeFileSync('docs/footmaze3d/stage-matrix.md', head + body + '\n');
    }
  });
});
