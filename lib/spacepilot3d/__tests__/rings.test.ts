import {describe,it,expect} from 'vitest';
import {ringCrossing,normalizeAccessibility,openingRadius,ringCounts,type FlightMode} from '../rings';
import {WorldGameplaySimulation} from '../worldGameplay';
import {courseAt,initialFlightPose,pointerForHeading} from '../worldFlight';
import {nextObjective} from '../objectiveGuidance';
import {SessionAuthority} from '../sessionAuthority';
import {isPresentationFrame,isSessionState} from '../sessionContract';
import type {FlightDifficulty} from '../missions';

const ring={x:0,y:0,z:-10,innerRadius:4,normal:{x:0,y:0,z:1}};
const pose=initialFlightPose();
describe('R3 geometric opening, not proximity collection',()=>{
 it('requires crossing the plane with the entire projected capsule envelope inside the opening',()=>{
  expect(ringCrossing(ring,pose,{...pose,z:-9.99})).toBeNull();
  expect(ringCrossing(ring,pose,{...pose,z:-10})).toBe('collected');
  expect(ringCrossing(ring,{...pose,x:2},{...pose,x:2,z:-20})).toBe('missed');
  expect(ringCrossing(ring,{...pose,x:8},{...pose,x:8,z:-20})).toBe('missed');
 });
 it('sweeps high-speed travel and interpolates the actual crossing position',()=>{
  expect(ringCrossing(ring,{...pose,z:100},{...pose,z:-1000})).toBe('collected');
  expect(ringCrossing(ring,{...pose,x:-10,z:0},{...pose,x:10,z:-20})).toBe('collected');
  expect(ringCrossing(ring,{...pose,x:10,z:0},{...pose,x:10,z:-20})).toBe('missed');
 });
 it('uses the oriented plane, rejects parallel/reverse motion and never re-awards an on-plane reference',()=>{
  const oriented={...ring,normal:{x:1,y:0,z:0}};
  expect(ringCrossing(oriented,{...pose,x:10,z:-10},{...pose,x:-10,z:-10})).toBe('collected');
  expect(ringCrossing(oriented,{...pose,x:10,z:0},{...pose,x:-10,z:0})).toBe('missed');
  expect(ringCrossing(oriented,pose,{...pose,z:-20})).toBeNull();
  expect(ringCrossing(ring,{...pose,z:-20},pose)).toBeNull();
  expect(ringCrossing(ring,{...pose,z:-10},{...pose,z:-20})).toBeNull();
 });
 it('accounts for banked/rotated spacecraft and changes the visible opening for accessibility',()=>{
  const narrow={...ring,innerRadius:2.4};
  expect(ringCrossing(narrow,pose,{...pose,z:-20})).toBe('collected');
  expect(ringCrossing(narrow,{...pose,y:1,bank:.28},{...pose,y:1,bank:.28,z:-20})).toBe('missed');
  expect(openingRadius(normalizeAccessibility({mode:'EASY',ringTolerance:1}))).toBe(5.4);
  expect(openingRadius(normalizeAccessibility({mode:'ADVANCED',ringTolerance:0}))).toBe(3.5);
 });
});

function steer(s:WorldGameplaySimulation){
 const o=nextObjective(s.ship,s.objects,{...s.config.flightSettings,guidance:2},s.config.accessibility);
 if(!o)return {x:.5,y:.5};
 const dz=Math.max(1,s.ship.z-o.z),dx=o.x-s.ship.x;
 return pointerForHeading(Math.atan2(dx,dz)-courseAt(s.ship.z,s.config.flightSettings).yaw,Math.atan2(o.y-s.ship.y,Math.hypot(dx,dz)),s.config.flightSettings.sensitivity,s.config.flightSettings.headingLimit);
}
const combinations=(['EASY','MEDIUM','ADVANCED'] as FlightMode[]).flatMap(mode=>(['LOW','MEDIUM','HIGH'] as FlightDifficulty[]).map(difficulty=>({mode,difficulty})));
describe('R3 modes and all nine complete mission trajectories',()=>{
 it.each(combinations)('$mode / $difficulty has reachable rings, avoidable hazards and correct denominators',({mode,difficulty})=>{
  for(const course of [0,1]){
   const s=new WorldGameplaySimulation({difficulty,accessibility:{mode},flightSettings:{course}}),speed=s.speed;
   s.start();
   for(let mission=0;mission<3;mission++){
    if(mode==='EASY')expect(s.objects.filter(o=>o.kind==='ring').every(o=>o.y===0)).toBe(true);
    expect(s.objects.every(o=>s.ship.z-o.z>=90)).toBe(true);
    for(let i=0;i<60*110&&s.status==='running';i++)s.step(1/60,steer(s));
    expect(s.status).toBe(mission===2?'complete':'mission-complete');expect(s.speed).toBe(speed);
    if(mission<2)s.nextMission();
   }
   const counts=ringCounts(difficulty);
   expect(s.stats).toMatchObject({ringsCollected:counts.rings,ringsPresented:counts.rings,ringsMissed:0,asteroidsAvoided:counts.hazards,asteroidCollisions:0,score:counts.rings*100,resolved:18,collectionAccuracy:1,completedMissions:3,upgradeTier:3});
   expect(new Set(s.events.map(e=>e.objectId)).size).toBe(18);
   const stats={...s.stats};s.step(.1,{x:.5,y:.5});expect(s.stats).toEqual(stats);
  }
 });
 it.each(['EASY','MEDIUM'] as FlightMode[])('%s ignores vertical input without altering raw pickup coordinates',mode=>{
  const a=new WorldGameplaySimulation({accessibility:{mode}}),b=new WorldGameplaySimulation({accessibility:{mode}});a.start();b.start();
  for(let i=0;i<60*8;i++){a.step(1/60,{x:.5,y:0});b.step(1/60,{x:.5,y:1});expect(a.ship.y).toBe(b.ship.y);}
  expect(a.ship.controlY).toBe(0);expect(b.ship.controlY).toBe(1);expect(a.ship.x).toBe(0);
  if(mode==='EASY')expect(a.ship.y).toBe(0);else expect(a.ship.y).toBeGreaterThan(0);
 });
 it('limits assistance speed, pauses it for hazards and never changes horizontal input',()=>{
  const s=new WorldGameplaySimulation({accessibility:{mode:'MEDIUM',altitudeAssistance:.5}});s.start();
  for(let i=0;i<60*11;i++){const y=s.ship.y;s.step(1/60,{x:.5,y:0});expect(Math.abs(s.ship.y-y)).toBeLessThanOrEqual(.5/60+1e-6);expect(s.ship.x).toBe(0);}
  expect(s.objects.find(o=>o.outcome==='pending')?.kind).not.toBe('ring');
  for(let i=0;i<60;i++)s.step(1/60,{x:.5,y:0});const held=s.ship.y;
  for(let i=0;i<60;i++)s.step(1/60,{x:.5,y:0});expect(s.ship.y).toBeCloseTo(held,8);
 });
 it('ADVANCED follows vertical input with no assistance',()=>{
  const s=new WorldGameplaySimulation({accessibility:{mode:'ADVANCED'}});s.start();for(let i=0;i<120;i++)s.step(1/60,{x:.5,y:0});expect(s.ship.y).toBeGreaterThan(5);
 });
 it.each(['LOW','MEDIUM','HIGH'] as FlightDifficulty[])('keeps minimum assisted altitude and precise openings feasible on %s',difficulty=>{
  const s=new WorldGameplaySimulation({difficulty,accessibility:{mode:'MEDIUM',altitudeAssistance:.5,ringTolerance:0},flightSettings:{headingLimit:20,sensitivity:.5,maxTurnRate:15,encounterSpacing:4}});s.start();
  for(let mission=0;mission<3;mission++){for(let i=0;i<60*150&&s.status==='running';i++)s.step(1/60,steer(s));if(mission<2)s.nextMission();}
  expect(s.status).toBe('complete');expect(s.stats.ringsCollected).toBe(ringCounts(difficulty).rings);expect(s.stats.asteroidCollisions).toBe(0);
 });
 it('supports configurable cosmetic milestones, frozen pause and clean restart',()=>{
  const s=new WorldGameplaySimulation({accessibility:{upgrade2:2,upgrade3:5}});s.start();
  for(let i=0;i<60*90&&s.status==='running';i++){s.step(1/60,steer(s));expect(s.stats.upgradeTier).toBe(s.stats.ringsCollected>=5?3:s.stats.ringsCollected>=2?2:1);}
  s.restart();s.pause();const before=JSON.stringify(s.ship);s.step(.2,{x:1,y:0});expect(JSON.stringify(s.ship)).toBe(before);expect(s.stats.score).toBe(0);expect(s.stats.upgradeTier).toBe(1);expect(s.config.accessibility.upgrade2).toBe(2);
 });
 it('is frame-rate independent and does not collect from nearby forward travel',()=>{
  const results=[30,60,120,144].map(fps=>{const s=new WorldGameplaySimulation();s.start();for(let i=0;i<fps*40&&s.status==='running';i++)s.step(1/fps,{x:.7,y:0});return s;});
  for(const s of results.slice(1)){expect(s.ship).toEqual(results[0].ship);expect(s.stats).toEqual(results[0].stats);expect(s.events).toEqual(results[0].events);}
  expect(results[0].stats.ringsMissed).toBeGreaterThan(0);
 });
 it('versions ring data and controls instructions/settings without advancing simulation',()=>{
  const a=new SessionAuthority('room','owner','session');const initial=a.snapshot();
  expect(initial.accessibility.mode).toBe('EASY');expect(initial.instructionsVisible).toBe(true);
  expect(a.command({type:'instructions',value:false},a.revision,a.simulation.runId,0)).toBe(true);
  expect(a.simulation.elapsedSeconds).toBe(0);expect(a.simulation.stats.score).toBe(0);expect(isSessionState(a.snapshot())).toBe(true);
  for(const version of [1,2,3])expect(isSessionState({...a.snapshot(),version})).toBe(false);
  const f=a.frame(0);expect(isPresentationFrame(f)).toBe(true);f.objects[0].ring!.normal={x:0,y:0,z:2};expect(isPresentationFrame(f)).toBe(false);
 });
 it.each(combinations)('$mode / $difficulty keeps keyboard and sensor simulation equivalent through authority',({mode,difficulty})=>{
  const keyboard=new SessionAuthority('room-k','owner-k','session-k',difficulty),sensor=new SessionAuthority('room-s','owner-s','session-s',difficulty);
  let now=0,sequence=0;
  const command=(a:SessionAuthority,action:Parameters<SessionAuthority['command']>[0])=>a.command(action,a.revision,a.simulation.runId,now);
  for(const a of [keyboard,sensor])command(a,{type:'accessibility',value:normalizeAccessibility({mode},difficulty)});
  command(sensor,{type:'input-mode',value:'sensor'});
  const packet=(a:SessionAuthority,type:'ack'|'input',pointer={x:.5,y:.5})=>{const f=a.frame(now);return a.receive({version:4,type,displayId:'display',ownerId:a.ownerId,sessionId:a.sessionId,runId:a.simulation.runId,inputEpoch:a.inputEpoch,frameSequence:f.sequence,sequence:++sequence,visible:true,ready:true,pointer},now)};
  for(const a of [keyboard,sensor]){packet(a,'ack');packet(a,'ack');a.tick(now,{x:.5,y:.5},'tracking');expect(command(a,{type:'start'})).toBe(true);expect(command(a,{type:'accessibility',value:normalizeAccessibility({mode:'EASY'})})).toBe(false);}
  for(let i=0;i<240;i++){
   now+=1000/60;const input={x:.5+Math.sin(i/120)*.12,y:.5-Math.sin(i/120)*.2};
   for(const a of [keyboard,sensor]){packet(a,'ack');if(a===keyboard)packet(a,'input',input);a.tick(now,input,'tracking');}
   expect(sensor.simulation.ship).toEqual(keyboard.simulation.ship);expect(sensor.simulation.stats).toEqual(keyboard.simulation.stats);
  }
  now+=20;packet(sensor,'ack');sensor.tick(now,null,'stale');expect(sensor.lifecycle).toBe('suspended');const held={...sensor.simulation.ship};now+=20;packet(sensor,'ack');sensor.tick(now,null,'stale');expect(sensor.simulation.ship).toEqual(held);
 });
});
