import { describe,expect,it } from 'vitest';
import { assertFirebaseSafeValue } from '@/lib/dataIntegrity/numeric';
import { activeHand,createState,kindOf,pathPoint,reduce,summary,targetOf,type State } from '../engine';
import { decode,makeLive,recoveredState } from '../live';
import { buildHistory,reviveDomeHistory } from '../history';
import { suggestResumePoint } from '@/lib/sessions/resumeSuggestion';
import { DomeSensorMapper } from '../sensorInput';
import type { NormalizedPointer } from '@/lib/physicalInput/ContinuousMotionController';
let time=1000;
function play(s:State):State {
  const objective=s.objective;
  for(let n=0;n<600&&s.status==='running'&&s.objective===objective;n++){
    const p=kindOf(s)==='guide'?pathPoint(s,Math.min(1,s.pathProgress+.05)):targetOf(s);
    s=reduce(s,{type:'move',point:p,seq:s.seq+1,source:'manual',hand:activeHand(s)});
    s=reduce(s,{type:'tick',at:time+=50});
  }
  return s;
}
describe('Wonder Dome authoritative interactions',()=>{
  it('never completes an outward reach without deliberate input, even with maximum tolerance and minimum range',()=>{
    for(const range of [.25,.8,1]){
      let s=reduce(createState('no-auto'),{type:'configure',config:{range,targetSize:.2,tolerance:.15}});s=reduce(s,{type:'start',at:1000});
      for(let at=1050;at<11000;at+=50)s=reduce(s,{type:'tick',at});
      expect(s.events).toHaveLength(0);expect(s.cursor).toEqual({x:.5,y:.5});
    }
  });
  it('completes all nine stages through actual reach, guide, hold and neutral cursor input without sensors',()=>{
    let s=createState('nine');
    for(let stage=0;stage<9;stage++){
      expect(s.stage).toBe(stage);s=reduce(s,{type:'start',at:time+=50});
      while(s.status==='running'){const before=s.events.length;s=play(s);expect(s.events.length).toBeGreaterThan(before);}
      expect(s.status).toBe('stage-complete');s=reduce(s,{type:'next',at:time+=50});
    }
    expect(s.status).toBe('ended');expect(summary(s)).toEqual({completed:16,assisted:0,repeats:0,stages:9,complete:true});
    expect(s.events.filter(e=>e.stage===7).map(e=>e.hand)).toEqual(['RIGHT_HAND','LEFT_HAND']);
    expect(reviveDomeHistory(JSON.parse(JSON.stringify(buildHistory(s,'patient','staff'))))?.accuracy).toBeNull();
    expect(suggestResumePoint(buildHistory(s,'patient','staff')).startingStage).toBe(3);
  });
  it('does not complete a corridor by jumping to its endpoint at minimum target size',()=>{
    let s=reduce(createState('path'),{type:'stage',stage:4});s=reduce(s,{type:'configure',config:{targetSize:.08,tolerance:.03,assistance:0}});s=reduce(s,{type:'start',at:time});
    s=reduce(s,{type:'move',point:targetOf(s),seq:1,source:'manual',hand:activeHand(s)});
    for(let i=0;i<150;i++)s=reduce(s,{type:'tick',at:time+=50});
    expect(s.pathProgress).toBeLessThan(1);expect(s.events).toHaveLength(0);
  });
  it('freezes pause, rejects stale and wrong-role input, preserves held progress on deviation',()=>{
    let s=reduce(createState('hold'),{type:'stage',stage:5});s=reduce(s,{type:'start',at:time});s=play(s);
    expect(kindOf(s)).toBe('hold');s=reduce(s,{type:'tick',at:time+=50});const progress=s.hold;
    const paused=reduce(s,{type:'pause'});expect(reduce(paused,{type:'tick',at:time+=5000})).toBe(paused);
    expect(reduce(s,{type:'move',point:{x:0,y:0},seq:s.seq,source:'manual',hand:activeHand(s)})).toBe(s);
    expect(reduce(s,{type:'move',point:{x:0,y:0},seq:s.seq+1,source:'manual',hand:activeHand(s),key:'previous-objective'})).toBe(s);
    expect(reduce(s,{type:'move',point:{x:0,y:0},seq:s.seq+1,source:'sensor',hand:'LEFT_HAND'})).toBe(s);
    s=reduce(s,{type:'move',point:{x:0,y:0},seq:s.seq+1,source:'manual',hand:activeHand(s)});s=reduce(s,{type:'tick',at:time+=50});expect(s.hold).toBeGreaterThanOrEqual(progress);
  });
  it('recovers paused; rejects malformed wire data, duplicate results and excessive configs',()=>{
    let s=reduce(createState('wire'),{type:'start',at:1000});const live=makeLive(s,'staff','ليلى',{heartbeatAt:2000,controlTabId:'tab',takeoverFrom:undefined});
    expect(()=>assertFirebaseSafeValue(live)).not.toThrow();
    expect(decode(live)).toEqual({...s,lastTick:0});expect(recoveredState(live)?.status).toBe('paused');
    expect(decode({...live,sessionId:'other'})).toBeNull();expect(decode({...live,dome3:{...live.dome3,payload:'{"stage":99}'}})).toBeNull();
    s=play(s);expect(reduce(s,{type:'tick',at:time+=50})).toBe(s);
    expect(reduce(s,{type:'configure',config:{range:Infinity,targetSize:5}}).config.targetSize).toBe(.2);
  });
  it('tracks assist, skip, repeats and explicit manual takeover without fabricated completion',()=>{
    let s=reduce(createState('assisted'),{type:'start',at:time});s=reduce(s,{type:'repeat'});s=reduce(s,{type:'assist'});s=play(s);
    expect(summary(s).assisted).toBe(1);expect(s.repeats).toBe(1);
    s=reduce(s,{type:'next',at:time});s=reduce(s,{type:'start',at:time});s=reduce(s,{type:'skipObjective'});s=reduce(s,{type:'skipObjective'});
    expect(s.completed).toEqual([0]);expect(s.skipped).toEqual([1]);
    expect(reduce({...s,input:'sensor'},{type:'sensorLost'}).input).toBe('manual');
  });
});
const pointer=(x:number,at:number)=>({pointer:{x,y:.5},confidence:1,timestampMs:at}) as NormalizedPointer;
describe('existing calibrated sensor pointer adapter',()=>{
  it('isolates role, freshness and duplicates; bounds and smooths sensor input',()=>{
    const m=new DomeSensorMapper();expect(m.push('LEFT_HAND','RIGHT_HAND',pointer(.7,10),true,10,1)).toBeNull();
    expect(m.push('RIGHT_HAND','RIGHT_HAND',pointer(.7,10),false,10,1)).toBeNull();
    expect(m.push('RIGHT_HAND','RIGHT_HAND',pointer(.7,10),true,1000,1)).toBeNull();
    expect(m.push('RIGHT_HAND','RIGHT_HAND',pointer(.7,10),true,10,1)?.x).toBe(.7);
    expect(m.push('RIGHT_HAND','RIGHT_HAND',pointer(.7,10),true,10,1)).toBeNull();
    expect(m.push('RIGHT_HAND','RIGHT_HAND',pointer(20,20),true,20,2)?.x).toBeCloseTo(.82);
    m.reset();expect(m.push('RIGHT_HAND','RIGHT_HAND',pointer(.51,20),true,20,2)?.x).toBe(.5);
  });
});
