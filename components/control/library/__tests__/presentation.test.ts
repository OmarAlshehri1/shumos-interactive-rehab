import {describe,it,expect,vi,afterEach} from 'vitest';
import {librarySections,projectionLabel,projectionNotice,hardwareNotice} from '../presentation';
import {DEVICE_GAMES,launchHref,requestedInput,handModeReady,drivingDeviceReady} from '@/lib/games/library/capabilities';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
describe('Final library device membership and canonical identity',()=>{
 it('shows exact owner membership in four sections while reusing the 20 canonical registrations',async()=>{
  vi.stubEnv('NODE_ENV','development');vi.resetModules();const {GAME_REGISTRY}=await import('@/lib/games/registry');
  const sections=librarySections(GAME_REGISTRY);expect(sections).toHaveLength(4);expect(sections.map(s=>s.games.length)).toEqual([7,13,6,3]);
  expect(new Set(GAME_REGISTRY.map(g=>g.id)).size).toBe(20);
  for(const s of sections){expect(s.games.map(g=>g.id)).toEqual(DEVICE_GAMES[s.input]);for(const game of s.games)expect(game).toBe(GAME_REGISTRY.find(g=>g.id===game.id));}
  expect(sections.flatMap(s=>s.games).filter(g=>g.id==='balloon-quest')).toHaveLength(3);
 });
 it('filters every section by enabled registry entries without manufacturing duplicate registrations',async()=>{
  vi.stubEnv('NODE_ENV','production');for(const flag of ['NEXT_PUBLIC_MIRROR_QUEST_3D','NEXT_PUBLIC_SAFE_HEX_ARENA_3D','NEXT_PUBLIC_RUNNER_QUEST_3D','NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED'])vi.stubEnv(flag,'false');vi.resetModules();
  const {GAME_REGISTRY}=await import('@/lib/games/registry');const cards=librarySections(GAME_REGISTRY).flatMap(s=>s.games);
  expect(cards.some(g=>['mirror-quest-3d','safe-hex-arena-3d','runner-quest-3d','build-quest-3d'].includes(g.id))).toBe(false);expect(cards.filter(g=>g.id==='balloon-quest')).toHaveLength(3);
 });
 it('preserves Runner numeric production flag and canonical control route',async()=>{vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_RUNNER_QUEST_3D','1');vi.resetModules();const {GAME_REGISTRY}=await import('@/lib/games/registry');const g=librarySections(GAME_REGISTRY)[1].games.find(g=>g.id==='runner-quest-3d');expect(g?.route).toBe('/control/runner-quest-3d');});
 it('separates implemented projection from BOTH targets and pending hardware',()=>{
  expect(projectionNotice({id:'balloon-quest',surfaceType:'FLOOR'})).toContain('الجداري');expect(projectionNotice({id:'runner-quest-3d',surfaceType:'WALL'})).toContain('الأرضي');expect(projectionNotice({id:'blooming-world-3d',surfaceType:'BOTH'})).toBeNull();
  expect(projectionLabel('BOTH')).toBe('جداري وأرضي');expect(projectionLabel(undefined)).toBe('العرض غير محدد');expect(hardwareNotice({id:'mirror-quest-3d'})).toContain('بانتظار التحقق');expect(hardwareNotice({id:'balloon-quest'},'JOYSTICK')).toContain('غير متاح');
 });
});
describe('Typed launch preference and physical input isolation',()=>{
 it('carries input preference on one canonical route and sanitizes unknown modes',()=>{expect(launchHref('/control/balloon-quest','FOOT')).toBe('/control/balloon-quest?input=FOOT');for(const s of [null,'foot','__proto__','constructor'])expect(requestedInput(s)).toBe('MANUAL');expect(requestedInput('HAND')).toBe('HAND');});
 it('rejects stale, disconnected, uncalibrated, wrong-role and duplicate-device hand inputs',()=>{
  const good={connected:true,centered:true,pointerAt:900,deviceId:'right'},left={...good,deviceId:'left'};
  expect(handModeReady('RIGHT_HAND',good,{...left,connected:false},1000)).toBe(true);expect(handModeReady('LEFT_HAND',{...good,connected:false},left,1000)).toBe(true);expect(handModeReady('DUAL_HAND',good,left,1000)).toBe(true);
  for(const bad of [{...good,pointerAt:700},{...good,pointerAt:1100},{...good,pointerAt:NaN},{...good,connected:false},{...good,centered:false},{...good,deviceId:null}])expect(handModeReady('RIGHT_HAND',bad,left,1000)).toBe(false);
  expect(handModeReady('DUAL_HAND',good,good,1000)).toBe(false);expect(handModeReady('RIGHT_FOOT',good,left,1000)).toBe(false);
 });
 it('requires fresh Gamepad samples and assigned finite axes, not merely a connected controller',()=>{const p={connected:true,timestamp:900,axes:[0,.2]};expect(drivingDeviceReady(p,[0,1],1000)).toBe(true);for(const pad of [null,{...p,connected:false},{...p,timestamp:0},{...p,timestamp:400},{...p,timestamp:1100}])expect(drivingDeviceReady(pad,[0],1000)).toBe(false);expect(drivingDeviceReady(p,[-1],1000)).toBe(false);expect(drivingDeviceReady(p,[2],1000)).toBe(false);expect(drivingDeviceReady({...p,axes:[NaN]},[0],1000)).toBe(false);});
});
