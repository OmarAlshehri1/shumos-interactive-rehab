import { ringCounts } from '../rings';
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {advanceFlight,boundedTravel,courseAt,flightDefaults,initialFlightPose,normalizeFlightSettings,pointerForHeading} from '../worldFlight';
import {WorldGameplaySimulation as CurrentWorldGameplaySimulation} from '../worldGameplay';
import {WorldChaseCamera} from '../worldCamera';
import {guidancePlacement,nextObjective} from '../objectiveGuidance';
import {isSessionState} from '../sessionContract';
import type {FlightDifficulty} from '../missions';

// Existing R1/R2 two-axis regression scenarios explicitly select ADVANCED.
class WorldGameplaySimulation extends CurrentWorldGameplaySimulation { constructor(options:ConstructorParameters<typeof CurrentWorldGameplaySimulation>[0]={}) {super({...options,accessibility:{mode:'ADVANCED',...options.accessibility}})} }
describe('R2 heading and corridor are independent bounds',()=>{
 it.each([20,35,45,60])('settles at configured %s-degree heading without accumulated spin',headingLimit=>{
  const pose=initialFlightPose(),settings=normalizeFlightSettings({headingLimit,maxTurnRate:75});
  for(let i=0;i<120*4;i++)advanceFlight(pose,{x:1,y:.5},settings,1,1/120);
  expect(pose.yaw).toBeCloseTo(headingLimit*Math.PI/180,8);expect(pose.controlX).toBe(1);
 });
 it.each([-1,1])('holds inside both course profiles on side %s and responds inward immediately',side=>{
  for(const course of [0,1])for(const maxTurnRate of [15,75]){
   const pose=initialFlightPose(),settings=normalizeFlightSettings({course,maxTurnRate,headingLimit:60,horizontalLimit:32,verticalLimit:12});
   for(let i=0;i<120*60;i++){
    const old={...pose};advanceFlight(pose,{x:side>0?1:0,y:side>0?0:1},settings,49.6,1/120);
    expect(Math.abs(pose.x-courseAt(pose.z,settings).x)).toBeLessThanOrEqual(32+1e-9);expect(Math.abs(pose.y)).toBeLessThanOrEqual(12);
    expect(pose.z).toBeLessThan(old.z);expect(Math.hypot(pose.x-old.x,pose.y-old.y,pose.z-old.z)).toBeLessThan(.6);
    expect(Math.abs(pose.yaw-courseAt(pose.z,settings).yaw)).toBeLessThanOrEqual(Math.PI/3+.001);
   }
   const yaw=pose.yaw,y=pose.y;advanceFlight(pose,{x:side>0?0:1,y:side>0?1:0},settings,49.6,1/120);
   expect((pose.yaw-yaw)*side).toBeLessThan(0);expect((pose.y-y)*side).toBeLessThan(0);
  }
 });
 it('uses continuous outward deceleration with full inward freedom, without a wall snap',()=>{
  const limit=32;let x=25;const increments=[];
  for(let i=0;i<100;i++){const old=x;x=boundedTravel(x,15,limit,8,.1);increments.push(x-old);expect(x).toBeLessThan(limit);}
  expect(increments.at(-1)).toBeLessThan(increments[0]);expect(boundedTravel(31,-15,limit,8,.1)).toBe(29.5);
 });
 it('neutral follows the configured course without pulling lateral offset toward objectives',()=>{
  const pose={...initialFlightPose(),x:8},settings=normalizeFlightSettings({course:1});
  for(let i=0;i<120*20;i++)advanceFlight(pose,{x:.5,y:.5},settings,30,1/120);
  expect(pose.x-courseAt(pose.z,settings).x).toBeCloseTo(8,0);expect(pose.y).toBe(0);
 });
 it.each([false,true])('keeps the ship framed and camera heading bounded at corridor edges; reduced=%s',reduced=>{
  const settings=normalizeFlightSettings({headingLimit:60,course:1});
  for(const sign of [-1,1]){
   const pose={...initialFlightPose(),z:-650,x:sign*40,y:sign*12,yaw:sign*Math.PI/3,pitch:sign*.3};
   const rig=new WorldChaseCamera();let view=rig.update(pose,1/60,reduced,settings);
   for(let i=0;i<120;i++)view=rig.update(pose,1/60,reduced,settings);
   expect(Math.abs(view.yaw-courseAt(pose.z,settings).yaw)).toBeLessThanOrEqual(Math.PI/3+1e-9);
   const camera=new THREE.PerspectiveCamera(view.fov,16/9,.1,30000);camera.position.set(view.position.x,view.position.y,view.position.z);camera.lookAt(view.target.x,view.target.y,view.target.z);camera.updateMatrixWorld();
   const projected=new THREE.Vector3(pose.x,pose.y,pose.z).project(camera);expect(Math.abs(projected.x)).toBeLessThan(.5);expect(Math.abs(projected.y)).toBeLessThan(.85);expect(camera.up.toArray()).toEqual([0,1,0]);
  }
 });
});

describe('R2 optional guidance and feasible objectives',()=>{
 it('offers a star then a clearance route, with no writes to accepted state or input',()=>{
  const s=new WorldGameplaySimulation(),before=JSON.stringify(s);const objective=nextObjective(s.ship,s.objects,s.config.flightSettings)!;
  expect(objective.kind).toBe('ring');expect(JSON.stringify(s)).toBe(before);
  expect(nextObjective(s.ship,s.objects,{...s.config.flightSettings,guidance:0})).toBeNull();
  s.objects[0].outcome='missed';s.objects[1].outcome='missed';s.ship.z=s.objects[2].z+80;
  const route=nextObjective(s.ship,s.objects,s.config.flightSettings)!;expect(route.kind).toBe('route');expect(Math.abs(route.y-s.objects[2].y)).toBeGreaterThan(s.objects[2].radius+2.5);
  expect(nextObjective(s.ship,s.objects,{...s.config.flightSettings,guidance:1})).toBeNull();
 });
 it('keeps offscreen guidance away from ship/HUD and handles behind-camera targets',()=>{
  for(const [x,y,behind] of [[5,2,false],[-5,-2,false],[2,1,true]] as const){const g=guidancePlacement(x,y,behind);expect(g.offscreen).toBe(true);expect(Math.abs(g.x)).toBeLessThanOrEqual(.78);expect(g.y).toBeLessThanOrEqual(.38);expect(g.y).toBeGreaterThanOrEqual(-.08);}
  expect(guidancePlacement(.2,.2).offscreen).toBe(false);
 });
 it('keeps a clamped avoidance cue and its label clear of a projected asteroid',()=>{
  const obstacle={x:0,y:.4,halfWidth:.12,halfHeight:.22};
  const g=guidancePlacement(0,.7,false,obstacle);
  expect(g.offscreen).toBe(true);expect(g.obscured).toBe(false);
  expect(Math.abs(g.x-obstacle.x)>=obstacle.halfWidth||Math.abs(g.y-obstacle.y)>=obstacle.halfHeight-1e-10).toBe(true);
  expect(g.angle).toBeLessThan(0);
  expect(guidancePlacement(0,.2,false,{x:0,y:.2,halfWidth:2,halfHeight:2}).obscured).toBe(true);
 });
 it.each(['LOW','MEDIUM','HIGH'] as FlightDifficulty[])('completes guided %s missions on straight and curved courses at minimum steering range',difficulty=>{
  for(const course of [0,1]){
   const s=new WorldGameplaySimulation({difficulty,flightSettings:{guidance:2,course,headingLimit:20,sensitivity:.5,maxTurnRate:15,horizontalLimit:32,verticalLimit:12}});s.start();
   for(let mission=0;mission<3;mission++){
    for(let i=0;i<60*180&&s.status==='running';i++){
     const objective=nextObjective(s.ship,s.objects,s.config.flightSettings);let input={x:.5,y:.5};
     if(objective){const depth=Math.max(1,s.ship.z-objective.z);input=pointerForHeading(Math.atan2(objective.x-s.ship.x,depth)-courseAt(s.ship.z,s.config.flightSettings).yaw,Math.atan2(objective.y-s.ship.y,Math.hypot(depth,objective.x-s.ship.x)),s.config.flightSettings.sensitivity,s.config.flightSettings.headingLimit);}
     s.step(1/60,input);
    }
    expect(['mission-complete','complete']).toContain(s.status);if(mission<2)s.nextMission();
   }
   expect(s.stats).toMatchObject({ringsCollected:ringCounts(difficulty).rings,asteroidCollisions:0,asteroidsAvoided:ringCounts(difficulty).hazards,score:ringCounts(difficulty).rings*100,upgradeTier:3});
  }
 });
 it('locks configuration to bounded enums and rejects the previous contract',()=>{
  const settings=normalizeFlightSettings({headingLimit:200,guidance:99,course:4,reducedCamera:-1});expect(settings).toMatchObject({headingLimit:60,guidance:2,course:1,reducedCamera:0});
  expect(isSessionState({version:2,flightSettings:flightDefaults('LOW')})).toBe(false);
 });
 it('preserves deterministic trajectories across rendering rates at boundaries',()=>{
  const results=[30,60,120,144].map(fps=>{const s=new WorldGameplaySimulation({flightSettings:{headingLimit:60,course:1}});s.start();for(let i=0;i<fps*20;i++)s.step(1/fps,{x:1,y:0});return s;});
  for(const s of results.slice(1)){expect(s.ship).toEqual(results[0].ship);expect(s.stats).toEqual(results[0].stats);}
 });
});

it.each([-1,1])('keeps the first objective and following missions reachable after arriving at corridor edge %s',side=>{
 const s=new WorldGameplaySimulation({difficulty:'LOW',flightSettings:{headingLimit:20,sensitivity:.5,maxTurnRate:15,horizontalLimit:64,verticalLimit:28,encounterSpacing:4}});
 s.start();
 for(let mission=0;mission<3;mission++){
  for(let i=0;i<60*180&&s.status==='running';i++){
   const o=nextObjective(s.ship,s.objects,s.config.flightSettings);let input={x:.5,y:.5};
   if(o){const depth=Math.max(1,s.ship.z-o.z);input=pointerForHeading(Math.atan2(o.x-s.ship.x,depth),Math.atan2(o.y-s.ship.y,Math.hypot(depth,o.x-s.ship.x)),s.config.flightSettings.sensitivity,s.config.flightSettings.headingLimit);}
   s.step(1/60,input);
  }
  if(mission<2){if(mission===0){s.ship.x=side*63;s.ship.y=side*27;}s.nextMission();}
 }
 expect(s.stats).toMatchObject({ringsCollected:15,asteroidCollisions:0,asteroidsAvoided:3});
});
