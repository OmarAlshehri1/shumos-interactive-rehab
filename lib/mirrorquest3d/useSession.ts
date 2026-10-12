'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLiveGameController } from '@/lib/liveGame/useLiveGameController';
import { LiveRecordPublisher } from '@/lib/liveGame/publisher';
import { HistorySaver, type HistoryStatus } from '@/lib/liveGame/historySaver';
import { controlTabId, decideRecovery, isTakenOver, HEARTBEAT_MS } from '@/lib/liveGame/ownership';
import { fetchLiveSession, publishSession, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { createState, reduce, LIMBS, type Command, type State } from './engine';
import { makeLive, reviveMirrorLive, recoveredState, encode, GAME_ID, type MirrorLiveSession } from './live';
import { buildHistory } from './history';
import { SimulatedLimbAdapter } from './input';
import { neutral } from './engine';
export function useMirrorSession() {
 const c=useLiveGameController(), {db,uid,getLive}=c;
 const [state,setState]=useState<State|null>(null),[error,setError]=useState<string|null>(null),[history,setHistory]=useState<HistoryStatus>('not-ended'),[blocked,setBlocked]=useState(false);
 const op=useRef<(c:Command)=>void>(()=>{}),online=useRef(false);
 useEffect(()=>{online.current=c.connectionStatus==='connected';},[c.connectionStatus]);
 useEffect(()=>{
  if(c.auth.phase!=='authorized'||!c.isOwner||!uid)return;
  let disposed=false,ready=false,current:State|null=null,bound:string|null=null,lastPublish=0,dirty=false,seq=0,holding=false,inputSource: 'manual' | 'simulated' = 'manual';
  const simulator=new SimulatedLimbAdapter();simulator.calibrate(neutral());
  const tab=controlTabId(), saver=new HistorySaver();
  const publisher=new LiveRecordPublisher<MirrorLiveSession>({write:async w=>{await publishSession(db,{...w,gameId:GAME_ID,lastInteraction:null,patientId:bound});if(!disposed)setError(null);},fetchBaseRevision:async()=> (await fetchLiveSession(db))?.revision??0,now:Date.now,onError:e=>{if(!disposed)setError(String(e));}});
  publisher.setTabId(tab);
  const save=()=>{if(current?.status!=='ended')return;const snapshot=current;void saver.save(`${snapshot.sessionId}:${snapshot.run}`,bound,Date.now(),()=>saveSessionHistoryOnce(bound!,buildHistory(snapshot,bound!,uid))).then(v=>{if(!disposed)setHistory(v);});};
  const publish=()=>{if(!current)return;publisher.publish(current.sessionId,stamp=>makeLive(current!,uid,getLive().childName,stamp));lastPublish=Date.now();dirty=false;};
  const change=(next:State)=>{if(!current||next===current)return;dirty ||= encode({...next,sequence:0})!==encode({...current,sequence:0});current=next;setState(next);save();};
  const stop=subscribeToLiveSession(db,record=>{if(record?.gameId===GAME_ID&&isTakenOver((record.session as MirrorLiveSession).mirror3,tab)){ready=false;publisher.setEnabled(false);setBlocked(true);}});
  void (async()=>{
   try {const record=await fetchLiveSession(db);if(disposed)return;bound=getLive().patientId;publisher.setBaseRevision(record?.revision??0);
    const live=record?.gameId===GAME_ID?reviveMirrorLive(record.session):null;
    const snapshot=live?recoveredState(live):null;
    const decision=decideRecovery({recordSessionId:record?.sessionId??'',recordPatientId:record?.patientId??null,meta:live?.mirror3??{ownerId:''},snapshot:snapshot?{sessionId:snapshot.sessionId,state:snapshot}:null,uid,patientId:bound,tabId:tab,now:Date.now()});
    if(decision.kind==='blocked'){setBlocked(true);return;}
    current=decision.kind==='recover'?decision.snapshot.state:createState(crypto.randomUUID());seq=current.sequence;
    if(decision.kind==='recover')publisher.setTakeoverFrom(decision.fromTabId);
    ready=true;setState(current);publish();publisher.setEnabled(true);save();
   }catch(e){if(!disposed)setError(String(e));}
  })();
  op.current=command=>{if(!ready||!current||!online.current)return;
   if(command.type==='input'){
    if(command.source==='simulated') {
      const sample=simulator.sample(command.limb,command.value,Date.now());if(!sample)return;
      command={...command,value:sample.feature};
    }
    holding=true;inputSource=command.source;command={...command,at:Date.now(),sequence:++seq};
   }
   if(command.type==='pause'){simulator.disconnect();}
   if(['configure','resume','start'].includes(command.type)){simulator.calibrate(neutral());}

   if(['pause','repeat','restart','stage','configure','end','next'].includes(command.type))holding=false;
   change(reduce(current,command));
  };
  const timer=setInterval(()=>{
   if(!ready||!current)return;const now=Date.now();
   if(!online.current){holding=false;change(reduce(current,{type:'pause'}));return;}
   if(current.status==='running'){
    if(holding) for(const limb of LIMBS) change(reduce(current,{type:'input',limb,value:current.player[limb],sequence:++seq,at:now,source:inputSource}));
    change(reduce(current,{type:'tick',at:now}));
   }
   if(dirty&&now-lastPublish>=120)publish();publisher.touch(HEARTBEAT_MS);save();
  },50);
  return()=>{disposed=true;ready=false;clearInterval(timer);stop();publisher.dispose();op.current=()=>{};};
 },[c.auth.phase,c.isOwner,db,uid,getLive]);
 const send=useCallback((command:Command)=>op.current(command),[]);
 return {state,send,error,history,blocked,connected:c.connectionStatus==='connected'&&c.isOwner,displayConnected:c.displayConnected};
}
