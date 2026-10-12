import {afterEach,expect,it,vi} from 'vitest';
import {isLocalFlightControl,spacePilot3DEnabled} from '../releasePolicy';
import {createSpacePilotSession,applySpacePilotGameTransition,resolveSpacePilotStarArrival,endSpacePilotSession,GameState,Difficulty} from '@/lib/spacepilot';
import {reviveSpacePilotSessionState} from '@/lib/realtime/serialization';
import {buildStoredSpacePilotSession} from '@/lib/sessions/buildStoredSpacePilotSession';
import {SessionAuthority} from '../sessionAuthority';
import {recoveredSummary} from '../sessionStorage';

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()});
it('defaults locally to 3D while requiring an explicit production release switch and supporting rollback',()=>{
 expect(spacePilot3DEnabled('development',undefined)).toBe(true);
 for(const env of ['production','test',undefined])expect(spacePilot3DEnabled(env,undefined)).toBe(false);
 expect(spacePilot3DEnabled('production','true')).toBe(true);
 expect(spacePilot3DEnabled('development','false')).toBe(false);
 expect(spacePilot3DEnabled('production','TRUE')).toBe(false);
 expect(spacePilot3DEnabled('production','1')).toBe(false);
});
it('isolates cloud pointer publishing only for local 3D routes and preserves legacy/other-game paths',()=>{
 expect(isLocalFlightControl('/control/space-pilot',true)).toBe(true);
 expect(isLocalFlightControl('/control/space-pilot/',true)).toBe(true);
 expect(isLocalFlightControl('/control/space-pilot/sensor-source',true)).toBe(true);
 expect(isLocalFlightControl('/control/space-pilot/sensor-source',false)).toBe(false);
 expect(isLocalFlightControl('/control/space-pilot',false)).toBe(false);
 expect(isLocalFlightControl('/control/space-pilot-3d-prototype',false)).toBe(true);
 for(const path of ['/control/space-pilot-legacy','/control/balloon-quest','/control/color-chase','/control/space-pilot-other'])expect(isLocalFlightControl(path,true)).toBe(false);
});
it('keeps the existing game ID and route, updates only its library entry, and restores legacy metadata on rollback',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED','false');vi.resetModules();
 const legacy=(await import('@/lib/games/registry')).GAME_REGISTRY;
 vi.stubEnv('NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED','true');vi.resetModules();
 const current=(await import('@/lib/games/registry')).GAME_REGISTRY;
 expect(current.map(g=>g.id)).toEqual(legacy.map(g=>g.id));
 expect(current.filter(g=>g.id!=='space-pilot')).toEqual(legacy.filter(g=>g.id!=='space-pilot'));
 expect(current.find(g=>g.id==='space-pilot')).toMatchObject({id:'space-pilot',route:'/control/space-pilot',nameEn:'Space Pilot 3D',sensorCompatible:true});
 expect(legacy.find(g=>g.id==='space-pilot')?.nameEn).toBe('Space Pilot');
 expect(legacy.find(g=>g.id==='space-pilot')?.sensorCompatible).toBe(false);
});
it('round-trips actual legacy star results without reinterpreting them as rings',()=>{
 let s=createSpacePilotSession({childFirstName:'سارة',difficulty:Difficulty.EASY,now:1000,seed:'legacy-history'});
 for(const phase of [GameState.SETUP,GameState.START_ZONE,GameState.INSTRUCTIONS,GameState.COUNTDOWN,GameState.PLAYING])s=applySpacePilotGameTransition(s,phase,1000).state;
 s=resolveSpacePilotStarArrival(s,0,6000).state;s=resolveSpacePilotStarArrival(s,1,13000).state;
 s=endSpacePilotSession(s,14000).state;
 const revived=reviveSpacePilotSessionState(JSON.parse(JSON.stringify(s)));
 const stored=buildStoredSpacePilotSession({session:revived,patientId:'patient',createdByUid:'staff',gameId:'space-pilot'});
 expect(stored).toMatchObject({gameId:'space-pilot',totalStarsPresented:2,totalStarsCollected:1,collectionRate:.5});
 expect(stored).not.toHaveProperty('ringsCollected');expect(revived.summary).toEqual(s.summary);
 expect(recoveredSummary(JSON.stringify(s))).toBeNull();
 const ringSession=new SessionAuthority('room','owner','session').snapshot();
 expect(()=>reviveSpacePilotSessionState(ringSession)).toThrow();
});
