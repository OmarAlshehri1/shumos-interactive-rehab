'use client';
import { useGameSwitchFinalizer } from "@/components/control/visits/useGameSwitchFinalizer";
import {useEffect,useRef,useState,useCallback} from 'react';
import {useLiveGameController} from '@/lib/liveGame/useLiveGameController';
import {LiveRecordPublisher} from '@/lib/liveGame/publisher';
import {HistorySaver,type HistoryStatus} from '@/lib/liveGame/historySaver';
import {controlTabId,decideRecovery,isTakenOver,HEARTBEAT_MS} from '@/lib/liveGame/ownership';
import {fetchLiveSession,publishSession,subscribeToLiveSession} from '@/lib/realtime/sessionRepository';
import {saveSessionHistoryOnce} from '@/lib/sessions/sessionHistoryRepository';
import {createState,reduce,type State,type Command} from './engine';
import {GAME_ID,makeLive,reviveCastleLive,recoveredState,type CastleLiveSession} from './live';
import {buildHistory} from './history';
export function useCastleSession(){
 const c=useLiveGameController(),{db,uid,getLive}=c;
 const [state,setState]=useState<State|null>(null),[error,setError]=useState<string|null>(null),[history,setHistory]=useState<HistoryStatus>('not-ended'),[blocked,setBlocked]=useState(false),[force,setForce]=useState(0);
 const op=useRef<(command:Command)=>void>(()=>{}),online=useRef(false),savedState=useRef<State|null>(null);
 useEffect(()=>{online.current=c.connectionStatus==='connected'&&c.isOwner;},[c.connectionStatus,c.isOwner]);
 useEffect(()=>{
 if(c.auth.phase!=='authorized'||!c.isOwner||!uid)return;
 let disposed=false,ready=false,current:State|null=null,bound:string|null=null,dirty=false,lastPublish=0,launched=false;
 const tab=controlTabId(),saver=new HistorySaver();
 const publisher=new LiveRecordPublisher<CastleLiveSession>({write:async w=>{await publishSession(db,{...w,gameId:GAME_ID,lastInteraction:null,patientId:bound});if(!disposed)setError(null);},fetchBaseRevision:async()=> (await fetchLiveSession(db))?.revision??0,now:Date.now,onError:e=>{if(!disposed)setError(String(e));}});publisher.setTabId(tab);
 const save=()=>{if(current?.status!=='ended')return;const snapshot=current;void saver.save(snapshot.sessionId,bound,Date.now(),()=>saveSessionHistoryOnce(bound!,buildHistory(snapshot,bound!,uid))).then(v=>{if(!disposed)setHistory(v);});};
 const publish=()=>{if(!current)return;const snapshot=current;launched=true;publisher.publish(snapshot.sessionId,stamp=>makeLive(snapshot,uid,getLive().childName,stamp));dirty=false;lastPublish=Date.now();};
 const change=(next:State)=>{if(next===current)return;current=next;savedState.current=next;dirty=true;setState(next);save();};
 const stop=subscribeToLiveSession(db,r=>{if(r?.gameId===GAME_ID&&isTakenOver((r.session as CastleLiveSession).castle3,tab)){ready=false;publisher.setEnabled(false);setBlocked(true);}});
 void(async()=>{try{const r=await fetchLiveSession(db);if(disposed)return;bound=getLive().patientId;publisher.setBaseRevision(r?.revision??0);const live=r?.gameId===GAME_ID?reviveCastleLive(r.session):null;const s=live?recoveredState(live):null;
 const decision=decideRecovery({recordSessionId:r?.sessionId??'',recordPatientId:r?.patientId??null,meta:live?.castle3??{ownerId:''},snapshot:s,uid,patientId:bound,tabId:tab,now:Date.now(),force:force>0});
 if(decision.kind==='blocked'){setBlocked(true);return;}
 // A different game's live session is left untouched until explicit launch from this route.
 current=decision.kind==='recover'?decision.snapshot:createState(crypto.randomUUID());if(decision.kind==='recover')publisher.setTakeoverFrom(decision.fromTabId);
 ready=true;setBlocked(false);savedState.current=current;setState(current);if(decision.kind==='recover'){publish();publisher.setEnabled(true);}save();
 }catch(e){if(!disposed)setError(String(e));}})();
 op.current=command=>{if(!ready||!current||!online.current||getLive().patientId!==bound)return;
 const next=reduce(current,command);if(next===current)return;change(next);if(command.type==='new')setHistory('not-ended');publish();publisher.setEnabled(true);
 };
 const timer=setInterval(()=>{if(!ready||!current)return;const now=Date.now();
 if(!online.current||getLive().patientId!==bound){publisher.setEnabled(false);change(reduce(current,{type:'pause'}));if(dirty)publish();return;}
 publisher.setEnabled(launched);
 if(current.status==='running')change(reduce(current,{type:'tick',at:now}));
 if(dirty&&now-lastPublish>=300)publish();publisher.touch(HEARTBEAT_MS);save();
 },100);
 return()=>{disposed=true;ready=false;clearInterval(timer);stop();publisher.dispose();op.current=()=>{};};
 },[c.auth.phase,c.isOwner,db,uid,getLive,force]);
 const send=useCallback((command:Command)=>op.current(command),[]);
  useGameSwitchFinalizer(GAME_ID, state?.sessionId, !!state && c.connectionStatus === "connected" && c.isOwner && !blocked, () => send({ type: "end", at: Date.now() }));
 return {state,send,error,history,blocked,takeover:()=>{c.claimOwnership();setForce(n=>n+1);},connected:c.connectionStatus==='connected'&&c.isOwner,displayConnected:c.displayConnected};
}
