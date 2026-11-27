'use client';
import { useGameSwitchFinalizer } from "@/components/control/visits/useGameSwitchFinalizer";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveGameController } from '@/lib/liveGame/useLiveGameController';
import { LiveRecordPublisher } from '@/lib/liveGame/publisher';
import { HistorySaver, type HistoryStatus } from '@/lib/liveGame/historySaver';
import { controlTabId, decideRecovery, isTakenOver, HEARTBEAT_MS } from '@/lib/liveGame/ownership';
import { fetchLiveSession, publishSession, subscribeToLiveSession } from '@/lib/realtime/sessionRepository';
import { saveSessionHistoryOnce } from '@/lib/sessions/sessionHistoryRepository';
import { useDualSensorRuntime } from '@/components/control/sensors/SensorRuntimeProvider';
import { activeHand, reduce, type Command, type State } from './engine';
import { GAME_ID, encode, makeLive, recoveredState, reviveDomeLive, type DomeLiveSession } from './live';
import { buildHistory } from './history';
import { DomeSensorMapper } from './sensorInput';

export function useDomeSession() {
  const c=useLiveGameController(),dual=useDualSensorRuntime();
  const {db,uid,getLive}=c;
  const [state,setState]=useState<State|null>(null),[error,setError]=useState<string|null>(null),[history,setHistory]=useState<HistoryStatus>('not-ended'),[blocked,setBlocked]=useState(false);
  const op=useRef<(cmd:Command)=>void>(()=>{}),sensors=useRef(dual),stats=useRef({writes:0});
  useEffect(()=>{sensors.current=dual;},[dual]);
  useEffect(()=>{
    if(c.auth.phase!=='authorized'||!c.isOwner||!uid)return;
    let disposed=false,ready=false,current:State|null=null,bound:string|null=null,dirty=false,lastPublish=0,seq=0,lastManualSeq=0;
    const tab=controlTabId(),saver=new HistorySaver(),mapper=new DomeSensorMapper();
    const publisher=new LiveRecordPublisher<DomeLiveSession>({
      write:async w=>{await publishSession(db,{...w,gameId:GAME_ID,lastInteraction:null,patientId:bound});stats.current.writes++;if(!disposed)setError(null);},
      fetchBaseRevision:async()=>(await fetchLiveSession(db))?.revision??0,now:Date.now,onError:e=>{if(!disposed)setError(String(e));}
    });publisher.setTabId(tab);
    const save=()=>{if(current?.status!=='ended'||!current.startedAt)return;const snapshot=current;
      void saver.save(`${snapshot.sessionId}:${snapshot.run}`,bound,Date.now(),()=>saveSessionHistoryOnce(bound!,buildHistory(snapshot,bound!,uid))).then(v=>{if(!disposed)setHistory(v);});};
    const publish=()=>{if(!current)return;const snapshot=current;publisher.publish(snapshot.sessionId,stamp=>makeLive(snapshot,uid,getLive().childName,stamp));lastPublish=Date.now();dirty=false;};
    const change=(next:State)=>{if(next===current)return;const visible=!current||encode(next)!==encode(current);current=next;seq=Math.max(seq,next.seq);if(visible){dirty=true;setState(next);save();}};
    const stop=subscribeToLiveSession(db,record=>{
      if(!ready||!current||!record)return;
      const live=record.session as DomeLiveSession;
      if(record.gameId!==GAME_ID||record.sessionId!==current.sessionId||isTakenOver(live.dome3,tab)){
        ready=false;publisher.setEnabled(false);setBlocked(true);
      }
    });
    void(async()=>{try{
      const record=await fetchLiveSession(db);if(disposed)return;
      bound=getLive().patientId;publisher.setBaseRevision(record?.revision??0);
      const live=record?.gameId===GAME_ID?reviveDomeLive(record.session):null;
      // Do not replace another running activity when navigating into this game.
      if(record && !live && !['SESSION_COMPLETE','WELCOME'].includes(record.session.gameState)){
        setBlocked(true);setError('أنهِ النشاط الحالي قبل بدء قبة العجائب.');return;
      }
      const snapshot=live?recoveredState(live):null;
      if(live&&live.dome3.ownerId!==uid&&snapshot?.status!=='ended'){setBlocked(true);setError('الجلسة الحالية تخص معالجًا آخر؛ يلزم إنهاؤها من حسابه أولًا.');return;}
      const decision=decideRecovery({recordSessionId:record?.sessionId??'',recordPatientId:record?.patientId??null,meta:live?.dome3??{ownerId:''},snapshot,uid,patientId:bound,tabId:tab,now:Date.now()});
      if(decision.kind!=='recover'){setBlocked(true);setError('هذا النشاط متوقف للأنشطة الجديدة.');return;}
      current=decision.snapshot;
      if(decision.kind==='recover')publisher.setTakeoverFrom(decision.fromTabId);
      seq=current.seq;setState(current);publish();publisher.setEnabled(true);ready=true;save();
    }catch(e){if(!disposed)setError(String(e));}})();
    op.current=cmd=>{if(!ready||!current||!getLive().ready)return;
      if(cmd.type==='move'&&cmd.source==='manual'){if(cmd.seq<=lastManualSeq)return;lastManualSeq=cmd.seq;}
      if(cmd.type==='move'&&cmd.key!==undefined&&cmd.key!==`${current.run}:${current.stage}:${current.objective}`)return;
      if(cmd.type==='sensorMode'){const r=activeHand(current)==='RIGHT_HAND'?sensors.current.right:sensors.current.left;
        if(!r.connected||!r.centered||!r.pointer||performance.now()-r.pointer.timestampMs>900){setError('انتظر حساسًا معايرًا ومتصلًا؛ التحكم اليدوي متاح.');return;}
        mapper.reset();
      }
      if(cmd.type==='restart'&&!saver.isDone(`${current.sessionId}:${current.run}`)&&current.startedAt){setError('أنهِ الجلسة وانتظر حفظها قبل إعادة البدء.');return;}
      change(reduce(current,cmd.type==='move'?{...cmd,seq:++seq}:cmd));
    };
    const timer=setInterval(()=>{
      if(!ready||!current)return;const now=Date.now();
      publisher.setEnabled(getLive().ready);
      if(!getLive().ready){if(current.status==='running')change(reduce(current,{type:'pause'}));return;}
      if(current.status==='running'&&current.input==='sensor'){
        const hand=activeHand(current),runtime=hand==='RIGHT_HAND'?sensors.current.right:sensors.current.left;
        if(!runtime.connected||!runtime.centered||!runtime.pointer||performance.now()-runtime.pointer.timestampMs>900){change(reduce(current,{type:'sensorLost'}));}
        else{const point=mapper.push(hand,hand,runtime.pointer,runtime.centered,performance.now(),current.config.sensitivity);
          if(point)change(reduce(current,{type:'move',point,seq:++seq,source:'sensor',hand}));}
      }
      if(current.status==='running')change(reduce(current,{type:'tick',at:now}));
      if(dirty&&now-lastPublish>=150)publish();publisher.touch(HEARTBEAT_MS);save();
    },50);
    return()=>{disposed=true;ready=false;clearInterval(timer);stop();publisher.dispose();op.current=()=>{};};
  },[c.auth.phase,c.isOwner,db,uid,getLive]);
  const send=useCallback((cmd:Command)=>op.current(cmd),[]);
  useGameSwitchFinalizer(GAME_ID, state?.sessionId, !!state && c.connectionStatus === "connected" && c.isOwner && !blocked, () => send({ type: "end", at: Date.now() }));
  return {state,send,error,history,blocked,connected:c.connectionStatus==='connected'&&c.isOwner,displayConnected:c.displayConnected,claimOwnership:c.claimOwnership,stats};
}
