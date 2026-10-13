import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVELS, worldTargets } from '../milestones';
import { createState, reduce, done } from '../engine';
import { buildHistory } from '../history';
import { makeLive } from '../live';
import { decode } from '../live';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('Forest native integration', () => {
 it('offers exactly three levels, grows on every count, preserves prior scenery', () => {
  expect(LEVELS).toHaveLength(3);
  for(const target of [6,10,15,30])for(let level=0;level<3;level++) {
   let previous = JSON.stringify(worldTargets({level,done:0,target,complete:false}));
   for(let d=1;d<=target;d++) {const w=worldTargets({level,done:d,target,complete:false});expect(JSON.stringify(w)).not.toBe(previous);previous=JSON.stringify(w);for(let l=0;l<level;l++)expect(w[l].every(v=>v===1)).toBe(true);}
  }
 });
 it('direct level three displays prior areas without inventing achievements or history', () => {
  let s=reduce(createState('direct'),{type:'selectLevel',level:2});s=reduce(s,{type:'start',at:1000});s=reduce(s,{type:'confirm',at:2000});s=reduce(s,{type:'end',at:3000});
  const h=buildHistory(s,'synthetic','staff');expect(h.levelResults.map(r=>r.level)).toEqual([3]);expect(h.confirmedAchievements).toBe(1);expect(done(s)).toBe(1);
 });
 it('round trips through the shared canonical live parser', () => {
  const s=createState('forest');const raw={gameId:'achievement-forest-3d',sessionId:s.sessionId,revision:1,updatedAt:1000,session:makeLive(s,'staff','طفل',{controlTabId:'tab',heartbeatAt:1000})};
  expect(decode(raw.session)?.sessionId).toBe('forest');
 });
 it('keeps 22 games and places City and Forest together in the existing rewards category', async () => {
  vi.stubEnv('NODE_ENV','development');vi.resetModules();const {GAME_REGISTRY}=await import('@/lib/games/registry');const {filteredGames}=await import('@/lib/games/library/filters');
  expect(GAME_REGISTRY).toHaveLength(22);expect(new Set(GAME_REGISTRY.map(g=>g.id)).size).toBe(22);
  expect(filteredGames(GAME_REGISTRY,'INTERACTIVE_REWARDS').map(g=>g.id)).toEqual(['achievement-forest-3d','achievement-city-3d','ocean-wonders-3d']);
  for(const filter of ['HAND','FOOT','JOYSTICK','DRIVING'] as const)expect(filteredGames(GAME_REGISTRY,filter).some(g=>g.id==='achievement-forest-3d')).toBe(false);
 });
});
