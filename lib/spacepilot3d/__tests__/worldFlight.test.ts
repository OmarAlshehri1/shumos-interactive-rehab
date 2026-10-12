import { ringCounts } from '../rings';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { advanceFlight, flightDefaults, initialFlightPose, MAX_HEADING, MAX_PITCH, normalizeFlightSettings, pointerForHeading } from '../worldFlight';
import { WorldGameplaySimulation as CurrentWorldGameplaySimulation } from '../worldGameplay';
import { sweptWorldIntersection } from '../worldCollision';
import { WorldChaseCamera } from '../worldCamera';
import type { FlightDifficulty } from '../missions';

// Existing R1/R2 two-axis regression scenarios explicitly select ADVANCED.
class WorldGameplaySimulation extends CurrentWorldGameplaySimulation { constructor(options:ConstructorParameters<typeof CurrentWorldGameplaySimulation>[0]={}) {super({...options,accessibility:{mode:'ADVANCED',...options.accessibility}})} }
const center = { x: .5, y: .5 };
export function routeInput(sim: WorldGameplaySimulation, avoidSide = 1) {
  const object = sim.objects.find(o => o.outcome === 'pending');
  if (!object) return center;
  const depth = Math.max(1, sim.ship.z - object.z);
  const targetY = object.kind === 'ring' ? object.y : object.y + avoidSide * 7;
  return pointerForHeading(Math.atan2(object.x - sim.ship.x,depth),Math.atan2(targetY - sim.ship.y,Math.hypot(depth,object.x - sim.ship.x)),sim.config.flightSettings.sensitivity,sim.config.flightSettings.headingLimit);
}
function complete(sim: WorldGameplaySimulation, fps = 60, avoidSide = 1) {
  for (let i=0;i<fps*150 && sim.status==='running';i++) sim.step(1/fps, routeInput(sim,avoidSide));
  expect(['mission-complete','complete']).toContain(sim.status);
}

describe('R1 physical flight and camera',()=>{
 it('travels continuously through fixed world encounters, with no lateral drift at neutral',()=>{
  const s=new WorldGameplaySimulation();const locations=s.objects.map(o=>[o.x,o.y,o.z]);s.start();for(let i=0;i<60;i++)s.step(1/60,center);
  expect(s.ship.z).toBeCloseTo(-30,8);expect(s.ship.x).toBe(0);expect(s.ship.y).toBe(0);expect(s.objects.map(o=>[o.x,o.y,o.z])).toEqual(locations);
 });
 it.each([[.85,.5,1,0],[.15,.5,-1,0],[.5,.15,0,1],[.5,.85,0,-1]])('steers actual travel direction with input %s,%s',(x,y,sx,sy)=>{
  const s=new WorldGameplaySimulation();s.start();for(let i=0;i<120;i++)s.step(1/60,{x,y});
  if(sx)expect(Math.sign(s.ship.x)).toBe(sx);if(sy)expect(Math.sign(s.ship.y)).toBe(sy);
  expect(s.ship.z).toBeLessThan(-40);expect(Math.abs(s.ship.yaw)).toBeLessThanOrEqual(MAX_HEADING);expect(Math.abs(s.ship.pitch)).toBeLessThanOrEqual(MAX_PITCH);
 });
 it('holds a heading rather than accumulating rotation, rejects small neutral noise and bounds travel',()=>{
  const pose=initialFlightPose(),settings=flightDefaults('MEDIUM');
  for(let i=0;i<120;i++)advanceFlight(pose,{x:.52,y:.48},settings,30,1/120);
  expect(pose.x).toBe(0);expect(pose.y).toBe(0);
  for(let i=0;i<120*120;i++)advanceFlight(pose,{x:1,y:0},settings,30,1/120);
  expect(pose.x).toBeLessThanOrEqual(settings.horizontalLimit);expect(pose.y).toBeLessThanOrEqual(settings.verticalLimit);
  expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(MAX_HEADING);expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(MAX_PITCH);
  for(let i=0;i<240;i++)advanceFlight(pose,center,settings,30,1/120);
  const x=pose.x,y=pose.y;for(let i=0;i<240;i++)advanceFlight(pose,center,settings,30,1/120);
  expect(pose.x).toBe(x);expect(pose.y).toBe(y);expect(pose.yaw).toBe(0);
 });
 it('respects the therapist turn rate without smoothing the accepted control coordinate',()=>{
  const s=new WorldGameplaySimulation({flightSettings:{maxTurnRate:15,sensitivity:2}});s.start();s.step(1/120,{x:1,y:.5});
  expect(s.ship.controlX).toBe(1);expect(s.ship.yaw).toBeCloseTo(15*Math.PI/180/120,10);
 });
 it('is deterministic at 30, 60, 120 and 144 rendering Hz for equal input histories',()=>{
  const results=[30,60,120,144].map(fps=>{const s=new WorldGameplaySimulation();s.start();for(let segment=0;segment<3;segment++)for(let i=0;i<fps;i++)s.step(1/fps,segment===0?{x:.8,y:.35}:segment===1?{x:.25,y:.65}:center);return s;});
  for(const s of results.slice(1)){for(const key of ['x','y','z','yaw','pitch','bank'] as const)expect(s.ship[key]).toBeCloseTo(results[0].ship[key],8);expect(s.stats).toEqual(results[0].stats);expect(s.events).toEqual(results[0].events);}
 });
 it('follows actual heading, keeps world-up, and creates depth-dependent parallax without changing landmarks',()=>{
  const pose=initialFlightPose(),rig=new WorldChaseCamera(),camera=new THREE.PerspectiveCamera(50,16/9,.1,20000);
  const project=()=>{const v=rig.update(pose,1/60);camera.position.set(v.position.x,v.position.y,v.position.z);camera.lookAt(v.target.x,v.target.y,v.target.z);camera.updateMatrixWorld();return [new THREE.Vector3(40,10,-100).project(camera).x,new THREE.Vector3(400,100,-1000).project(camera).x];};
  const original=project();pose.x=20;const translated=project();expect(Math.abs(translated[0]-original[0])).toBeGreaterThan(Math.abs(translated[1]-original[1])*4);
  pose.yaw=.45;for(let i=0;i<120;i++)project();const view=rig.update(pose,1/60);expect(view.yaw).toBeCloseTo(.45,4);expect(view.target.x).toBeGreaterThan(pose.x+6);expect(camera.up.toArray()).toEqual([0,1,0]);
  const snapshot={...pose};rig.update(pose,1/60,true);expect(pose).toEqual(snapshot);
 });
});

describe('R1 world collision and mission rules',()=>{
 it('sweeps high-speed crossings, rejects distant near misses, and handles rotated hull capsules',()=>{
  const a=initialFlightPose(),b={...a,z:-100};
  expect(sweptWorldIntersection({x:0,y:0,z:-50},.5,a,b)).toBe(true);
  expect(sweptWorldIntersection({x:4,y:0,z:-50},.5,a,b)).toBe(false);
  const rotated={...a,yaw:.6};const nose={x:Math.sin(.6)*1.5,y:0,z:-Math.cos(.6)*1.5};
  expect(sweptWorldIntersection(nose,.1,rotated,rotated)).toBe(true);
  expect(sweptWorldIntersection({x:0,y:3,z:-1},.1,rotated,rotated)).toBe(false);
 });
 it('pauses on gaps and missing input; pickup changes heading without teleporting through objects',()=>{
  const s=new WorldGameplaySimulation();s.start();s.step(1/60,center);const before={...s.ship};s.step(.5,center);expect(s.status).toBe('paused');expect(s.ship).toEqual(before);
  s.resume();s.step(1/60,null);expect(s.ship).toEqual(before);expect(s.status).toBe('paused');
  s.resume();s.invalidateInput();s.step(1/120,{x:1,y:0});expect(Math.abs(s.ship.x-before.x)).toBeLessThan(.01);expect(s.events).toHaveLength(0);
 });
 it.each(['LOW','MEDIUM','HIGH'] as FlightDifficulty[])('distributes wide reachable stars and avoidable rocks across all %s missions',(difficulty)=>{
  const s=new WorldGameplaySimulation({difficulty});expect(Math.max(...s.objects.map(o=>o.x))-Math.min(...s.objects.map(o=>o.x))).toBeGreaterThan(15);expect(Math.min(...s.objects.map(o=>-o.z))).toBeGreaterThanOrEqual(90);
  s.start();for(let mission=0;mission<3;mission++){complete(s);if(mission<2){const held={...s.ship};s.nextMission();expect(s.ship).toEqual(held);}}
  expect(s.stats).toMatchObject({ringsCollected:ringCounts(difficulty).rings,score:ringCounts(difficulty).rings*100,asteroidsAvoided:ringCounts(difficulty).hazards,asteroidCollisions:0,upgradeTier:3,resolved:18,completedMissions:3});
  expect(new Set(s.events.map(e=>e.objectId)).size).toBe(18);const stats={...s.stats};s.step(.2,center);expect(s.stats).toEqual(stats);
  const run=s.runId;s.restart();expect(s.ship).toEqual(initialFlightPose());expect(s.stats.score).toBe(0);s.step(.2,center,run);expect(s.ship.z).toBe(0);
 });
 it.each([-1,1])('supports alternative asteroid avoidance routes on side %s',side=>{const s=new WorldGameplaySimulation();s.start();complete(s,60,side);expect(s.stats.asteroidCollisions).toBe(0);expect(s.stats.ringsCollected).toBe(5);});
 it.each([[.5,15,4],[.5,15,10],[2,75,4],[2,15,4],[.5,75,4]])('keeps encounters feasible at accessibility settings %s/%s/%s',(sensitivity,maxTurnRate,encounterSpacing)=>{
  const s=new WorldGameplaySimulation({flightSettings:{sensitivity,maxTurnRate,encounterSpacing,horizontalLimit:32,verticalLimit:12}});s.start();for(let m=0;m<3;m++){complete(s);if(m<2)s.nextMission();}expect(s.stats.ringsCollected).toBe(13);expect(s.stats.asteroidCollisions).toBe(0);
 });
 it('counts exactly-once rocky and fiery impacts and missed stars geometrically',()=>{
  const s=new WorldGameplaySimulation();s.start();
  for(let m=0;m<3;m++){
   for(let i=0;i<12000&&s.status==='running';i++){
    const o=s.objects.find(o=>o.outcome==='pending')!;const depth=Math.max(1,s.ship.z-o.z);
    s.step(1/60,pointerForHeading(Math.atan2(o.x-s.ship.x,depth),Math.atan2(o.y-s.ship.y,Math.hypot(depth,o.x-s.ship.x)),s.config.flightSettings.sensitivity,s.config.flightSettings.headingLimit));
   }
   if(m<2)s.nextMission();
  }
  expect(s.stats.asteroidCollisions).toBe(5);expect(s.stats.ringsCollected).toBe(13);expect(s.events.filter(e=>e.outcome==='collision')).toHaveLength(5);
  const misses=new WorldGameplaySimulation();misses.start();for(let i=0;i<10000&&misses.status==='running';i++)misses.step(1/60,{x:1,y:1});expect(misses.stats.ringsMissed).toBeGreaterThan(0);expect(misses.stats.score).toBeLessThan(500);
 });
 it('normalizes only bounded game settings',()=>{expect(normalizeFlightSettings({sensitivity:100,maxTurnRate:NaN,encounterSpacing:0,verticalLimit:0})).toMatchObject({sensitivity:2,maxTurnRate:45,encounterSpacing:4,verticalLimit:12});});
});

it('sweeps a wing through an angular arc even when neither endpoint overlaps', () => {
  const before={...initialFlightPose(),yaw:-.6},after={...initialFlightPose(),yaw:.6},point={x:2.2,y:-.08,z:.8};
  expect(sweptWorldIntersection(point,.02,before,before)).toBe(false);expect(sweptWorldIntersection(point,.02,after,after)).toBe(false);
  expect(sweptWorldIntersection(point,.02,before,after)).toBe(true);
});
it('resolves identical three-mission outcomes at different render rates', () => {
  const results=[30,60,120,144].map(fps=>{const s=new WorldGameplaySimulation();s.start();for(let m=0;m<3;m++){for(let i=0;i<fps*100&&s.status==='running';i++)s.step(1/fps,center);if(m<2)s.nextMission();}return s;});
  for(const s of results.slice(1)){expect(s.stats).toEqual(results[0].stats);expect(s.events).toEqual(results[0].events);expect(s.ship).toEqual(results[0].ship);expect(s.status).toBe('complete');}
});
