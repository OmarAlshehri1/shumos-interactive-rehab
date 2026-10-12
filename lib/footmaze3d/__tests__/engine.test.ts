import { describe, expect, it } from 'vitest';
import { actPose, at, canMove, COUNTDOWN_MS, createState, ENTER_MS, exits, LEAVE_MS, onward, reduce, routeToFinish, starsCollected, stat, summarize, targetOf, worldOf, type Command, type State } from '../engine';
import { STAGES } from '../stages';

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
let T = 1_000_000;
const tick = (s: State, ms: number) => {
  let n = s;
  for (let left = ms; left > 0; left -= 100) { T += Math.min(100, left); n = reduce(n, { type: 'tick', at: T }); }
  return n;
};
const begin = (stage: number, config: Partial<State['config']> = {}) => {
  let s = createState('sess', 7);
  s = run(s, { type: 'configure', config }, { type: 'selectStage', stage }, { type: 'start', at: T });
  return tick(s, COUNTDOWN_MS + 100);
};
/** Walks the whole stage along the shortest route, confirming every arrival. */
function playThrough(s0: State, assisted = false) {
  let s = s0, guardSteps = 0;
  for (let i = 0; i < 80 && s.status === 'running'; i++) {
    if (s.act) { s = tick(s, s.act.leaveAt + LEAVE_MS - s.clock + 100); guardSteps++; continue; }
    const route = routeToFinish(s);
    expect(route.length, `stage ${s.stage} at ${at(s)}`).toBeGreaterThan(1);
    s = run(s, { type: 'choose', to: route[1] }, { type: 'arrive', assisted });
  }
  return { s, guardSteps };
}

describe('engine: nine stages are playable start to finish', () => {
  STAGES.forEach((st, i) => {
    it(`stage ${i + 1} ${st.nameEn}: completes by walking the route, guard waits included`, () => {
      const { s } = playThrough(begin(i));
      expect(s.status).toBe('stage-complete');
      expect(s.completed).toContain(i);
      expect(stat(s).res.at(-1)).toBe('confirmed'); // the finish star
      const w = worldOf(s);
      expect(stat(s).res).toHaveLength(w.maze.stars.length);
    });
    it(`stage ${i + 1}: also completes in simplified mode and with events and guardians switched off`, () => {
      for (const cfg of [{ simple: true }, { events: false, guards: false }, { simple: true, events: false, guards: false }]) {
        const { s } = playThrough(begin(i, cfg));
        expect(s.status, JSON.stringify(cfg)).toBe('stage-complete');
      }
    });
  });

  it('full 9-stage session ends with all nine completed', () => {
    let s = createState('full', 3);
    for (let i = 0; i < 9; i++) {
      s = run(s, { type: 'start', at: T });
      s = tick(s, COUNTDOWN_MS + 100);
      s = playThrough(s).s;
      expect(s.status).toBe('stage-complete');
      s = run(s, { type: 'next', at: T });
    }
    expect(s.status).toBe('ended');
    expect(s.completed).toHaveLength(9);
    expect(summarize(s.stats).confirmed).toBeGreaterThan(20);
  });
});

describe('engine: route choices', () => {
  it('a wrong branch is gentle: counted as a detour, ends in a dead end, and the way back is automatic', () => {
    let s = begin(1); // beach: two ways at the first junction, one dead end
    const w = worldOf(s);
    const start = at(s)!;
    // walk to the junction first
    expect(onward(s)).toHaveLength(1);
    s = run(s, { type: 'arrive', assisted: false });
    const junction = at(s)!;
    expect(junction).not.toBe(start);
    expect(onward(s).length).toBe(2);
    expect(s.heading).toBeNull(); // a real decision: the game never picks for the therapist
    expect(canMove(s)).toBe(true);
    const wrong = onward(s).find((m) => w.maze.byId[m].deg === 2 && m !== routeToFinish(s)[1])!;
    s = run(s, { type: 'arrive', assisted: false }); // no heading chosen: nothing happens
    expect(at(s)).toBe(junction);
    s = run(s, { type: 'choose', to: wrong }, { type: 'arrive', assisted: false });
    expect(at(s)).toBe(wrong);
    expect(stat(s).choices).toBe(1);
    expect(stat(s).detours).toBe(1);
    expect(stat(s).correct).toBe(0);
    expect(s.status).toBe('running'); // no failure state
    // follow the dead-end branch to its end
    for (let i = 0; i < 4 && onward(s).length; i++) s = run(s, { type: 'choose', to: onward(s)[0] }, { type: 'arrive', assisted: false });
    expect(stat(s).deadEnds).toBe(1);
    expect(s.cue?.kind).toBe('dead');
    expect(s.heading).toBe(s.trail.at(-2)); // the way back is the only way: preselected
    s = run(s, { type: 'arrive', assisted: false });
    // back at the junction: choose the right way this time
    while (onward(s).length < 2 && s.status === 'running') s = run(s, { type: 'arrive', assisted: false });
    const before = stat(s).correct;
    s = run(s, { type: 'choose', to: routeToFinish(s)[1] }, { type: 'arrive', assisted: false });
    expect(stat(s).correct).toBe(before + 1);
  });

  it('only corridors that exist can be chosen; a corridor closed by a route switch cannot', () => {
    let s = begin(6); // crystal: wait at A (gate) first
    s = playToNode(s, 'B');
    // the switch closes B -> n61 the moment the child is confirmed at B
    expect(s.act?.kind).toBe('switch');
    expect(worldOf(s).closed.has('B~n61')).toBe(true);
    s = tick(s, ENTER_MS + s.act!.holdMs + LEAVE_MS + 200);
    expect(exits(s)).not.toContain('n61');
    const sBad = run(s, { type: 'choose', to: 'n61' });
    expect(sBad.heading).not.toBe('n61');
  });
});

function playToNode(s0: State, node: string): State {
  let s = s0;
  for (let i = 0; i < 60 && at(s) !== node; i++) {
    if (s.act) { s = tick(s, s.act.leaveAt + LEAVE_MS - s.clock + 100); continue; }
    const r = routeToFinish({ ...s, trail: s.trail }) ;
    const w = worldOf(s);
    // route to the requested node instead of the finish
    const next = pathTo(s, w, node);
    expect(next, `path to ${node}`).toBeTruthy();
    s = run(s, { type: 'choose', to: next! }, { type: 'arrive', assisted: false });
    void r;
  }
  return s;
}
function pathTo(s: State, w: ReturnType<typeof worldOf>, node: string): string | null {
  const here = at(s)!;
  const q: string[][] = [[here]], seen = new Set([here]);
  while (q.length) {
    const p = q.shift()!, cur = p.at(-1)!;
    if (cur === node) return p[1] ?? null;
    for (const m of w.maze.adj[cur]) if (!seen.has(m) && !w.closed.has(cur < m ? `${cur}~${m}` : `${m}~${cur}`)) { seen.add(m); q.push([...p, m]); }
  }
  return null;
}

describe('engine: guardians and waiting (stage 5)', () => {
  it('the guardian starts only after the therapist confirms the child at the waiting zone, never mid-corridor', () => {
    let s = begin(4);
    expect(s.act).toBeNull();
    // while walking toward the waiting zone nothing blocks
    s = run(s, { type: 'arrive', assisted: false }); // S -> (plain) -> A? first node reached
    const first = at(s)!;
    if (first !== 'A') { expect(s.act).toBeNull(); s = run(s, { type: 'choose', to: 'A' }, { type: 'arrive', assisted: false }); }
    expect(at(s)).toBe('A');
    expect(s.act?.kind).toBe('guard');
    expect(s.act?.at).toBe('A');
    expect(stat(s).waits).toBe(1);
  });

  it('while the guardian blocks, no move is accepted; the sequence is enter, hold, leave, then CONTINUE and free to go', () => {
    let s = playToNode(begin(4), 'A');
    expect(canMove(s)).toBe(false);
    const target = routeToFinish(s)[1];
    const refused = run(s, { type: 'choose', to: target }, { type: 'arrive', assisted: false });
    expect(at(refused)).toBe('A');
    expect(refused.heading).toBeNull();
    const g = s.act!;
    expect(actPose(g, g.t0 + 10, false).phase).toBe('enter');
    expect(actPose(g, g.t0 + ENTER_MS + 100, false).phase).toBe('hold');
    expect(actPose(g, g.leaveAt + 10, false).phase).toBe('leave');
    s = tick(s, ENTER_MS + 1000);
    expect(s.act).not.toBeNull();
    s = tick(s, g.holdMs + LEAVE_MS);
    expect(s.act).toBeNull();
    expect(s.contAt).toBeGreaterThan(0); // CONTINUE sign anchor
    expect(stat(s).waitsDone).toBe(1);
    expect(canMove(s)).toBe(true);
  });

  it('pause freezes the guardian: the clock and the wait stop together', () => {
    let s = playToNode(begin(4), 'A');
    const before = s.clock;
    s = run(s, { type: 'pause' });
    const frozen = tick(s, 20000);
    expect(frozen.clock).toBe(before);
    expect(frozen.act).not.toBeNull();
    s = run(frozen, { type: 'resume', at: T });
    s = tick(s, s.act!.holdMs + ENTER_MS + LEAVE_MS + 200);
    expect(s.act).toBeNull();
  });

  it('the therapist can release early (counted once), extend the wait, and trigger it again', () => {
    let s = playToNode(begin(4), 'A');
    s = tick(s, ENTER_MS + 200);
    const hold0 = s.act!.holdMs;
    s = run(s, { type: 'extend', ms: 2000 });
    expect(s.act!.holdMs).toBe(hold0 + 2000);
    s = run(s, { type: 'release' }, { type: 'release' });
    expect(stat(s).releases).toBe(1);
    expect(actPose(s.act!, s.clock + 50, false).phase).toBe('leave');
    s = tick(s, LEAVE_MS + 300);
    expect(s.act).toBeNull();
    expect(stat(s).waitsDone).toBe(1);
    // already fired: arriving again does not replay it, a manual trigger does
    const again = run(s, { type: 'trigger' });
    expect(again.act?.id).toBe('g1');
    expect(stat(again).waits).toBe(2);
  });

  it('guardian waits can be turned off, and then nothing blocks', () => {
    const s = playToNode(begin(4, { guards: false }), 'A');
    expect(s.act).toBeNull();
    expect(canMove(s)).toBe(true);
  });

  it('guard wait length is adjustable', () => {
    const s = playToNode(begin(4, { guardMs: 9000 }), 'A');
    expect(s.act!.holdMs).toBe(9000);
  });

  it('a guardian that moves between two corridors blocks the first, slides to the second, then leaves (town)', () => {
    const s = playToNode(begin(7), 'B');
    expect(s.act?.id).toBe('g2');
    const hasAlt = !!worldOf(s).maze.guards.find((g) => g.id === 'g2')!.alt;
    expect(hasAlt).toBe(true);
    const mid = s.act!;
    expect(actPose(mid, mid.t0 + ENTER_MS + mid.holdMs * 0.1, true).side).toBe('edge');
    expect(actPose(mid, mid.t0 + ENTER_MS + mid.holdMs * 0.9, true).side).toBe('alt');
  });
});

describe('engine: dynamic events are safe', () => {
  it('a route switch fires only on arrival at its waiting zone, closes before anyone enters, and cannot be forced mid-leg', () => {
    let s = begin(6);
    expect(worldOf(s).closed.size).toBe(0);
    s = playToNode(s, 'B');
    expect(s.act?.kind).toBe('switch');
    expect(stat(s).events).toBe(1);
    // no move is accepted during the switch
    expect(at(run(s, { type: 'arrive', assisted: false }))).toBe('B');
    // events cannot start while a leg is in progress: configure is blocked once running, and arrive is the only trigger
    expect(reduce(s, { type: 'trigger' })).toBe(s);
  });

  it('structural settings are refused once the stage is running (the maze never changes under a child)', () => {
    const s = begin(3);
    for (const config of [{ simple: true }, { width: 2.4 }, { rot: 180 as const }, { mirror: true }]) {
      expect(reduce(s, { type: 'configure', config }).config).toEqual(s.config);
    }
    expect(reduce(s, { type: 'configure', config: { guardMs: 9000 } }).config.guardMs).toBe(9000);
  });

  it('dynamic events can be disabled, leaving every corridor open', () => {
    const s = playToNode(begin(6, { events: false }), 'B');
    expect(s.act).toBeNull();
    expect(worldOf(s).closed.size).toBe(0);
    expect(stat(s).events).toBe(0);
  });

  it('a collectible appears only after its event (palace) and is then collectable once', () => {
    let s = begin(8);
    const w0 = worldOf(s);
    const idx = w0.maze.stars.indexOf('n20');
    expect(idx).toBeGreaterThanOrEqual(0);
    s = playToNode(s, 'B');
    s = tick(s, s.act!.leaveAt + LEAVE_MS - s.clock + 100);
    s = playToNode(s, 'n20');
    expect(stat(s).res[idx]).toBe('confirmed');
    const stars = starsCollected(s);
    s = run(s, { type: 'repeat', prev: true }, { type: 'choose', to: 'n20' }, { type: 'arrive', assisted: false });
    expect(starsCollected(s)).toBe(stars); // idempotent
  });
});

describe('engine: checkpoints and assistance', () => {
  it('a star is awarded once per star, confirmed vs assisted is recorded, and walking back and forth never doubles it', () => {
    let s = begin(0);
    const w = worldOf(s);
    s = run(s, { type: 'arrive', assisted: true });
    const first = w.maze.stars.indexOf(at(s)!);
    expect(stat(s).res[first]).toBe('assisted');
    expect(s.starSeq).toBe(1);
    s = run(s, { type: 'repeat', prev: true }, { type: 'arrive', assisted: false });
    expect(stat(s).res[first]).toBe('assisted'); // not re-awarded, not upgraded
    expect(s.starSeq).toBe(1);
    expect(stat(s).repeats).toBe(1);
    expect(stat(s).assistedMoves).toBe(1);
  });

  it('skip marks the next star skipped (never the finish); a skipped star can still be collected later', () => {
    let s = begin(0);
    const w = worldOf(s);
    const tgt = targetOf(s, w)!;
    expect(tgt.finish).toBe(false);
    s = run(s, { type: 'skip' });
    const idx = w.maze.stars.indexOf(tgt.node);
    expect(stat(s).res[idx]).toBe('skipped');
    s = run(s, { type: 'arrive', assisted: false });
    expect(at(s)).toBe(tgt.node);
    expect(stat(s).res[idx]).toBe('confirmed');
    // the finish itself cannot be skipped
    let f = begin(0);
    for (let i = 0; i < 10 && targetOf(f)!.finish === false; i++) f = run(f, { type: 'skip' });
    const resBefore = stat(f).res.slice();
    expect(stat(run(f, { type: 'skip' })).res).toEqual(resBefore);
  });

  it('nothing is accepted during the countdown, while paused, or after the end', () => {
    let s = createState('x', 1);
    s = run(s, { type: 'start', at: T });
    expect(canMove(s)).toBe(false);
    expect(run(s, { type: 'arrive', assisted: false })).toBe(s);
    s = tick(s, COUNTDOWN_MS + 100);
    const paused = run(s, { type: 'pause' });
    expect(run(paused, { type: 'arrive', assisted: false })).toBe(paused);
    const ended = run(s, { type: 'end', at: T });
    expect(run(ended, { type: 'arrive', assisted: false })).toBe(ended);
  });

  it('hint shows guidance for a limited time and is counted', () => {
    let s = begin(6);
    s = run(s, { type: 'hint' });
    expect(s.hintUntil).toBeGreaterThan(s.clock);
    expect(stat(s).hints).toBe(1);
  });

  it('restart stage clears the stage; skip stage records it as skipped and moves on', () => {
    let s = begin(2);
    s = run(s, { type: 'arrive', assisted: false });
    const skipped = run(s, { type: 'skipStage', at: T });
    expect(skipped.stage).toBe(3);
    expect(skipped.skipped).toContain(2);
    expect(skipped.stats[2].res.every((r) => r !== 'pending')).toBe(true);
    const re = run(s, { type: 'restartStage' });
    expect(re.status).toBe('ready');
    expect(re.stats[2].res).toEqual([]);
  });

  it('restart run starts a fresh session record and keeps the therapist settings', () => {
    let s = begin(0, { guardMs: 9000 });
    s = run(s, { type: 'restart' });
    expect(s.run).toBe(1);
    expect(s.config.guardMs).toBe(9000);
    expect(s.stats.every((t) => t.res.length === 0)).toBe(true);
  });
});

describe('engine: sensors can only hint', () => {
  it('a foot movement never moves the child, awards a star or ends a wait; during a wait it only raises a therapist banner', () => {
    let s = playToNode(begin(4), 'A');
    const trailBefore = s.trail.slice();
    const act = s.act;
    s = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', at: 1, seq: 1 });
    expect(s.trail).toEqual(trailBefore);
    expect(s.act).toEqual(act);
    expect(s.sensor.pending).toBe(true);
    expect(s.sensor.movements).toBe(1);
    // a stale / replayed event is ignored
    const dup = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', at: 2, seq: 1 });
    expect(dup.sensor.movements).toBe(1);
  });
});
