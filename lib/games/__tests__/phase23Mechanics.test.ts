import { expect, it } from 'vitest';
import * as dome from '@/lib/bubblepopwall3d/engine';
import {buildHistory as domeHistory} from '@/lib/bubblepopwall3d/history';
import {reviveAnyStoredSession} from '@/lib/sessions/sessionHistoryRepository';
import * as castle from '@/lib/castlelegends3d/engine';
import {validState as validCastle} from '@/lib/castlelegends3d/live';
import * as mirror from '@/lib/mirrorquest3d/engine';
import {validState as validMirror} from '@/lib/mirrorquest3d/live';
import {buildHistory as mirrorHistory,reviveMirrorHistory} from '@/lib/mirrorquest3d/history';
import * as bloom from '@/lib/bloomingworld3d/engine';
import {validState as validBloom,makeLive,decode,recoveredState} from '@/lib/bloomingworld3d/live';
import {WorldGameplaySimulation} from '@/lib/spacepilot3d/worldGameplay';
import {NINE_STAGE_CURRICULUM} from '@/lib/spacepilot3d/curriculum';
it('Castle limits whole native prompts to every nonempty limb combination across nine stages',()=>{
 for(let mask=1;mask<16;mask++){
 const limbs=castle.LIMBS.filter((_,i)=>mask&(1<<i));
 let s=castle.reduce(castle.createState('limbs'),{type:'configure',config:{limbs}});
 expect(castle.exercisePool(s.config).length).toBeGreaterThan(0);
 for(let stage=0;stage<9;stage++){
 s=castle.reduce(s,{type:'stage',stage});expect(validCastle(s)).toBe(true);
 for(let exerciseIndex=0;exerciseIndex<20;exerciseIndex++)expect(castle.exercise({...s,exerciseIndex}).limbs.every(l=>limbs.includes(l))).toBe(true);
 expect(s.maxHealth).toBe(s.config.repetitions*[1,1,2,1,1,2,1,2,3][stage]);
 }
 }
 const old=castle.createState('old');delete old.config.limbSelection;old.config.mode='hands';expect(castle.exercisePool(old.config).every(e=>e.mode==='hands')).toBe(true);expect(validCastle(old)).toBe(true);
});
it('Mirror uses only selected native targets and retains all 28 genuine attempt slots',()=>{
 for(let mask=1;mask<16;mask++){
 const limbs=mirror.LIMBS.filter((_,i)=>mask&(1<<i));let s=mirror.reduce(mirror.createState('mirror'),{type:'configure',config:{limbs}});
 for(let stage=0;stage<9;stage++){
 s=mirror.reduce(s,{type:'stage',stage});s=mirror.reduce(s,{type:'start',at:100});
 while(s.status==='running'){expect(mirror.target(s).active.every(l=>limbs.includes(l))).toBe(true);s=mirror.reduce(s,{type:'assist'});}
 expect(validMirror(s)).toBe(true);
 }
 expect(s.accepted).toHaveLength(28);expect(s.completed).toHaveLength(9);
 s=mirror.reduce(s,{type:'end',at:1000});const h=mirrorHistory(s,'synthetic','staff');expect(reviveMirrorHistory(h)).not.toBeNull();expect(h.participatingLimbs).toEqual(limbs);expect(h.nativePoseIds).toHaveLength(28);
 }
});
it('Mirror validation ignores unselected limbs but still requires a fresh held native movement',()=>{
 let s=mirror.reduce(mirror.createState('match'),{type:'configure',config:{limbs:['RIGHT_HAND'],holdMs:200}});s=mirror.reduce(s,{type:'start',at:100});
 s=mirror.reduce(s,{type:'input',source:'manual',limb:'LEFT_FOOT',value:1,sequence:1,at:100});s=mirror.reduce(s,{type:'input',source:'manual',limb:'RIGHT_HAND',value:mirror.target(s).target.RIGHT_HAND,sequence:2,at:100});
 for(const at of [100,200,300])s=mirror.reduce(s,{type:'tick',at});expect(s.accepted).toHaveLength(1);expect(s.accepted[0].assisted).toBe(false);
 const old=mirror.createState('legacy');delete old.config.limbs;expect(mirror.target({...old,stage:1}).id).toBe('l1');expect(validMirror(old)).toBe(true);
});
const armed=()=>{let s={...bloom.reduce(bloom.createState('garden'),{type:'start'}),startedAt:1};s=bloom.reduce(s,{type:'tick',at:100});return bloom.reduce(s,{type:'bloom',id:0,token:bloom.tokenFor(s,0),assisted:true});};
it('Bloom forces floor defaults and scores exactly once only after two seconds of authoritative ticks',()=>{
 let s=armed();expect(s.config).toMatchObject({projection:'FLOOR',mode:'DUAL_FOOT',repetitions:1,activationMs:2000});expect(s.regions[0].hits).toBe(0);
 const command={type:'bloom' as const,id:0,token:bloom.tokenFor(s,0),assisted:true};expect(bloom.reduce(s,command)).toBe(s);
 for(let at=100;at<2100;at+=100){s=bloom.reduce(s,{type:'tick',at});expect(s.regions[0].hits).toBe(0);expect(validBloom(s)).toBe(true);}
 s=bloom.reduce(s,{type:'tick',at:2100});expect(s.regions[0]).toMatchObject({hits:1,assisted:1});expect(s.active).toBe(1);expect(bloom.reduce(s,command)).toBe(s);expect(validBloom(s)).toBe(true);
});
it('Bloom pause, recovery, tab gaps and end never award an unfinished activation',()=>{
 for(const command of [{type:'pause' as const},{type:'end' as const,at:10000},{type:'tick' as const,at:10000}]){let s=armed();s=bloom.reduce(s,{type:'tick',at:100});s=bloom.reduce(s,command);expect(s.activation).toBeNull();expect(s.regions[0].hits).toBe(0);expect(validBloom(s)).toBe(true);}
 const live=makeLive(armed(),'staff','synthetic',{controlTabId:'tab',heartbeatAt:100});expect(decode(live)).not.toBeNull();expect(recoveredState(live)?.activation).toBeNull();
});
it('legacy Bloom wall sessions retain immediate activation and remain readable',()=>{
 let s=bloom.createState('old');s.config={...bloom.DEFAULT_CONFIG};delete s.activation;s=bloom.reduce(s,{type:'start'});s=bloom.reduce(s,{type:'bloom',id:0,token:bloom.tokenFor(s,0),assisted:false});expect(s.regions[0].hits).toBe(1);expect(s.config.projection).toBe('WALL');expect(validBloom(s)).toBe(true);
 const fresh=bloom.reduce(bloom.createState('floor'),{type:'config',patch:{projection:'WALL',mode:'RIGHT_HAND',repetitions:5,movementRange:.2}});expect(fresh.config).toMatchObject({projection:'FLOOR',mode:'DUAL_FOOT',repetitions:1,movementRange:1});
});
it('Space Pilot actual simulation binds modes to all nine stage preparations',()=>{
 const sim=new WorldGameplaySimulation({curriculumId:NINE_STAGE_CURRICULUM});
 for(let stage=0;stage<9;stage++){expect(sim.selectStage(stage)).toBe(true);expect(sim.config.accessibility.mode).toBe(stage<3?'EASY':stage<6?'MEDIUM':'ADVANCED');expect(sim.objects.length).toBeGreaterThan(0);expect(sim.stats.score).toBe(0);}
 const legacy=new WorldGameplaySimulation({accessibility:{mode:'MEDIUM'}});expect(legacy.config.accessibility.mode).toBe('MEDIUM');
});

it('new Bloom sessions cannot disable the floor contract and final-stage skip cancels a pending fill',()=>{
 let s=bloom.reduce(bloom.createState('fixed-floor'),{type:'config',patch:{activationMs:undefined,projection:'WALL'}});expect(s.config.activationMs).toBe(2000);expect(s.config.projection).toBe('FLOOR');
 s=bloom.reduce(s,{type:'stage',stage:8});s=bloom.reduce(s,{type:'start'});s=bloom.reduce(s,{type:'bloom',id:0,token:bloom.tokenFor(s,0),assisted:false});s=bloom.reduce(s,{type:'skip-stage'});expect(s.activation).toBeNull();expect(s.regions[0].hits).toBe(0);expect(validBloom(s)).toBe(true);
});

it('retired Bubble historical results still revive through the unified patient-history reader',()=>{
 let s=dome.reduce(dome.createState('retired-history'),{type:'start',at:100});s=dome.reduce(s,{type:'assist'});s=dome.reduce(s,{type:'end',at:1000});const history=domeHistory(s,'synthetic','staff');expect(reviveAnyStoredSession(history)).toEqual(history);
});
