import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
it('preserves the original 19 games and registers the three rewards once for a 22-game release',async()=>{
 vi.stubEnv('NODE_ENV','production');vi.resetModules();
 const {GAME_REGISTRY}=await import('../registry');
 const original=['balance-bridge-3d','shumos-castle-legends-3d','harvest-valley-3d','blooming-world-3d','fire-rescue-3d','pearl-voyage-3d','mirror-quest-3d','safe-hex-arena-3d','turn-and-go-3d','foot-maze-3d','rhythm-steps-3d','body-sequence-3d','balloon-quest','follow-the-footsteps','bubble-pop-wall','space-pilot','color-chase','runner-quest-3d','build-quest-3d'];
 const rewards=['achievement-city-3d','achievement-forest-3d','ocean-wonders-3d'];
 expect(GAME_REGISTRY).toHaveLength(22);expect(GAME_REGISTRY.map(g=>g.id).sort()).toEqual([...original,...rewards].sort());
 const {ACTIVITY_CATEGORY_GAMES}=await import('../library/capabilities');expect([...ACTIVITY_CATEGORY_GAMES.INTERACTIVE_REWARDS].sort()).toEqual(rewards.sort());
 expect(GAME_REGISTRY.some(g=>g.id as string==='youtube')).toBe(false);
});
