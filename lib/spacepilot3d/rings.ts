import { Euler, Quaternion, Vector3 } from 'three';
import { SHIP_CAPSULES, type Point3 } from './collision';
import type { WorldFlightPose } from './worldFlight';
import type { FlightDifficulty } from './missions';

export type FlightMode = 'EASY' | 'MEDIUM' | 'ADVANCED';
export interface AccessibilitySettings { mode: FlightMode; altitudeAssistance: number; ringTolerance: number; upgrade2: number; upgrade3: number }
export interface RingOpening { innerRadius: number; normal: Point3 }
export const flightModeArabic: Record<FlightMode,string> = { EASY:'سهل · يمين ويسار فقط (البداية الموصى بها)', MEDIUM:'متوسط · يمين ويسار مع مساعدة الارتفاع', ADVANCED:'متقدم · تحكم بالاتجاه والارتفاع' };
export function normalizeAccessibility(patch: Partial<AccessibilitySettings> = {}, difficulty: FlightDifficulty = 'MEDIUM'): AccessibilitySettings {
  const bounded=(v:number|undefined,f:number,a:number,b:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
  const upgrade2=Math.round(bounded(patch.upgrade2,3,2,6));
  return { mode:patch.mode==='MEDIUM'||patch.mode==='ADVANCED'?patch.mode:'EASY', altitudeAssistance:bounded(patch.altitudeAssistance,1.5,.5,3), ringTolerance:bounded(patch.ringTolerance,difficulty==='LOW'?.8:difficulty==='HIGH'?.25:.5,0,1), upgrade2, upgrade3:Math.round(bounded(patch.upgrade3,7,upgrade2+1,10)) };
}
export function isAccessibility(v: unknown): v is AccessibilitySettings {
  if(!v||typeof v!=='object')return false;
  const a=v as AccessibilitySettings,n=normalizeAccessibility(a);
  return ['EASY','MEDIUM','ADVANCED'].includes(a.mode)&&(['altitudeAssistance','ringTolerance','upgrade2','upgrade3'] as const).every(k=>a[k]===n[k]);
}
export function openingRadius(a:AccessibilitySettings){return (a.mode==='EASY'?4.4:a.mode==='MEDIUM'?3.9:3.5)+a.ringTolerance;}
export function ringCounts(difficulty:FlightDifficulty){return difficulty==='LOW'?{rings:15,hazards:3}:difficulty==='MEDIUM'?{rings:13,hazards:5}:{rings:11,hazards:7};}

/** Forward swept reference-plane crossing. Capsule projections erode the visible
 * opening, so a nearby wing or nose cannot award a ring. The tolerance enlarges
 * the rendered opening itself; it never awards passes through invisible space.
 * Orientation is interpolated at the crossing, using the renderer's YXZ order. */
export function ringCrossing(ring:Point3 & RingOpening,before:WorldFlightPose,after:WorldFlightPose): 'collected'|'missed'|null {
  const normal=ring.normal;
  const da=(before.x-ring.x)*normal.x+(before.y-ring.y)*normal.y+(before.z-ring.z)*normal.z;
  const db=(after.x-ring.x)*normal.x+(after.y-ring.y)*normal.y+(after.z-ring.z)*normal.z;
  if(da<=0||db>0||da-db<1e-12)return null;
  const n=new Vector3(normal.x,normal.y,normal.z).normalize();
  const t=da/(da-db),center=new Vector3(before.x-ring.x+(after.x-before.x)*t,before.y-ring.y+(after.y-before.y)*t,before.z-ring.z+(after.z-before.z)*t);
  const q=new Quaternion().setFromEuler(new Euler(before.pitch+(after.pitch-before.pitch)*t,-(before.yaw+(after.yaw-before.yaw)*t),before.bank+(after.bank-before.bank)*t,'YXZ'));
  const point=new Vector3();
  for(const c of SHIP_CAPSULES)for(const end of ['a','b'] as const){
    point.set(c[`${end}x`],c[`${end}y`],c[`${end}z`]).applyQuaternion(q).add(center);
    point.addScaledVector(n,-point.dot(n));
    if(point.length()+c.radius>ring.innerRadius+1e-9)return 'missed';
  }
  return 'collected';
}
