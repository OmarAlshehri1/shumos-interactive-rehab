import type { NormalizedPointer } from '@/lib/physicalInput/ContinuousMotionController';
import type { Hand, Point } from './engine';
/** Maps the existing calibrated, gyro-derived 2DOF pointer; never claims anatomical position. */
export class DomeSensorMapper {
  private last=new Map<Hand,number>(); private smoothed=new Map<Hand,Point>();
  reset(){this.last.clear();this.smoothed.clear();}
  push(role:Hand,required:Hand,p:NormalizedPointer|null,centered:boolean,now:number,sensitivity:number):Point|null {
    if(role!==required||!p||!centered||!Number.isFinite(p.timestampMs)||now-p.timestampMs>900||p.timestampMs>now+100||p.confidence<.25)return null;
    if(!Number.isFinite(p.pointer.x)||!Number.isFinite(p.pointer.y)||p.timestampMs<=(this.last.get(role)??-Infinity))return null;
    this.last.set(role,p.timestampMs);
    const axis=(v:number)=>Math.max(0,Math.min(1,.5+(Math.abs(v-.5)<.025?0:(v-.5)*sensitivity)));
    const q={x:axis(p.pointer.x),y:axis(p.pointer.y)},old=this.smoothed.get(role)??q;
    const out={x:old.x+(q.x-old.x)*.4,y:old.y+(q.y-old.y)*.4};this.smoothed.set(role,out);return out;
  }
}
