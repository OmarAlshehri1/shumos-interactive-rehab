import type { AccessibilitySettings } from './rings';
import type { GameplayObject } from './gameplay';
import { courseAt, type FlightSettings, type WorldFlightPose } from './worldFlight';
export interface FlightObjective { id: string; kind: 'ring'|'route'; x: number; y: number; z: number; distance: number }
/** Presentation-only advice. Never changes pose, input, encounters or scores. */
export function nextObjective(ship: WorldFlightPose, objects: readonly GameplayObject[], settings: FlightSettings, accessibility?: AccessibilitySettings): FlightObjective | null {
  if (!settings.guidance) return null;
  const object = objects.find(o=>o.outcome==='pending' && ship.z-o.z >= -o.radius);
  if (!object || ship.z-object.z>400) return null;
  let x=object.x,y=object.y;
  if(object.kind!=='ring') {
    if(settings.guidance===1)return null;
    // Guide around the next hazard, never into its collision sphere. Both sides
    // stay available; the cue selects the side nearest the current ship height.
    const clearance=object.radius+3, sign=ship.y>=object.y?1:-1;
    y=object.y+sign*clearance;
    if(Math.abs(y)>settings.verticalLimit-2)y=object.y-sign*clearance;
    const course=courseAt(object.z,settings);
    if(accessibility && accessibility.mode!=='ADVANCED'){
      const sign=ship.x>=object.x?1:-1;
      x=object.x+sign*(object.radius+4);y=accessibility.mode==='EASY'?0:ship.y;
      if(Math.abs(x-course.x)>settings.horizontalLimit-4)x=object.x-sign*(object.radius+4);
    }
    x=Math.max(course.x-settings.horizontalLimit+4,Math.min(course.x+settings.horizontalLimit-4,x));
  }
  return {id:object.id,kind:object.kind==='ring'?'ring':'route',x,y,z:object.z,distance:Math.hypot(x-ship.x,y-ship.y,object.z-ship.z)};
}
/** NDC placement stays clear of the HUD and lower-center spacecraft. */
export function guidancePlacement(x: number,y: number,behind=false, obstacle?: {x:number;y:number;halfWidth:number;halfHeight:number}) {
  const safeX=.78,safeTop=.38,safeBottom=-.08;
  const outside=behind||Math.abs(x)>safeX||y>safeTop||y<safeBottom;
  let px=Math.max(-safeX,Math.min(safeX,behind?-x:x)),py=Math.max(safeBottom,Math.min(safeTop,behind?-y:y));
  let displaced=false,obscured=false;
  if(obstacle && Math.abs(px-obstacle.x)<obstacle.halfWidth && Math.abs(py-obstacle.y)<obstacle.halfHeight){
    // The caller includes the marker/label footprint in these exclusion bounds.
    // Pick the nearest comfortable position outside the projected hazard.
    const candidates=[{x:px,y:obstacle.y-obstacle.halfHeight},{x:px,y:obstacle.y+obstacle.halfHeight},{x:obstacle.x-obstacle.halfWidth,y:py},{x:obstacle.x+obstacle.halfWidth,y:py}]
      .filter(p=>Math.abs(p.x)<=safeX&&p.y>=safeBottom&&p.y<=safeTop)
      .sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));
    if(candidates[0]){px=candidates[0].x;py=candidates[0].y;displaced=true;}else obscured=true;
  }
  return { x:px, y:py, obscured, offscreen:outside||displaced, angle:Math.atan2(-(y-py), (behind?-x:x)-px)*180/Math.PI };
}
