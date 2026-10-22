import { expect, it, vi } from 'vitest';
vi.hoisted(() => vi.stubEnv('NEXT_PUBLIC_BALANCE_BRIDGE_3D', 'true'));
import { createState } from '@/lib/balancebridge3d/engine';
import { makeLive } from '@/lib/balancebridge3d/live';
import type { LiveSessionRecord } from '@/lib/realtime/types';
import { displaySession, previewExpiresAt } from '../sessionPresentation';

const record = (): LiveSessionRecord => ({gameId:'balance-bridge-3d',sessionId:'synthetic-preview',revision:4,updatedAt:1000,session:makeLive(createState('synthetic-preview'),'staff','Synthetic',{controlTabId:'old',heartbeatAt:1}),patientId:null,lastInteraction:null,celebrationReplay:null});

it('shows idle for an abandoned native preview without mutating or deleting its recovery record', () => {
  const old=record(), original=JSON.stringify(old);
  expect(displaySession(old, 20000)).toBeNull();
  expect(JSON.stringify(old)).toBe(original);
  expect(displaySession({...old,revision:5,controllerUid:'staff'} as LiveSessionRecord,20000)).toBeNull();
});
it('shows a freshly selected preview and expires only when its controller stops publishing', () => {
  const current=record();
  expect(displaySession(current,15000)).toBe(current);
  expect(previewExpiresAt(current)).toBe(16000);
  expect(displaySession(current,16000)).toBeNull();
  const renewed={...current,revision:5,updatedAt:15000};
  expect(displaySession(renewed,16000)).toBe(renewed);
});
it('preserves paused, running and ambiguous unsaved gameplay regardless of age', () => {
  for(const status of ['running','paused','stage-complete'] as const){
    const state=createState('synthetic-preview');state.status=status;state.startedAt=500;
    const progress={...record(),session:makeLive(state,'staff','Synthetic')};
    expect(displaySession(progress,Number.MAX_SAFE_INTEGER)).toBe(progress);
    expect(previewExpiresAt(progress)).toBeNull();
  }
  const unknown={...record(),session:{...record().session,engine:'unknown'}} as unknown as LiveSessionRecord;
  expect(displaySession(unknown,20000)).toBe(unknown);
});
it('expires an old completion screen without deleting its possibly unsaved result', () => {
  const state=createState('synthetic-preview');state.status='ended';state.startedAt=500;
  const finished={...record(),session:makeLive(state,'staff','Synthetic')};
  const before=JSON.stringify(finished);
  expect(displaySession(finished,20000)).toBeNull();
  expect(JSON.stringify(finished)).toBe(before);
  expect(displaySession(finished,15000)).toBe(finished);
});
it('waits for a real server timestamp instead of guessing that an in-flight preview is stale', () => {
  const pending={...record(),updatedAt:{'.sv':'timestamp'}};
  expect(displaySession(pending,20000)).toBe(pending);
  expect(displaySession(null,20000)).toBeNull();
});

import { displayMayRenderGame } from '../sessionPresentation';
it('keeps fresh native setup off the child renderer without clearing the stored session', () => {
  const r=record(), original=JSON.stringify(r);
  expect(displayMayRenderGame(r.session,r.gameId)).toBe(false);
  expect(JSON.stringify(r)).toBe(original);
});
it('renders actual Start and paused progress but waits again between stages until explicit Start', () => {
  for(const status of ['running','paused','stage-complete'] as const){
    const s=createState('synthetic-preview');s.status=status;s.startedAt=500;
    expect(displayMayRenderGame(makeLive(s,'staff','Synthetic'),'balance-bridge-3d')).toBe(true);
  }
  const s=createState('synthetic-preview');s.startedAt=500;
  expect(displayMayRenderGame(makeLive(s,'staff','Synthetic'),'balance-bridge-3d')).toBe(false);
});

import { InterruptedSessionHold, isInterruptedProgress } from '../sessionPresentation';
const progress=(updatedAt:number,status:'running'|'paused'='paused'):LiveSessionRecord=>{const s=createState('synthetic-preview');s.status=status;s.startedAt=500;return {...record(),updatedAt,session:makeLive(s,'staff','Synthetic')};};
it('holds an interrupted game on idle at load, keeps it stored, and releases it only when Control writes again', () => {
  const hold=new InterruptedSessionHold(), old=progress(1000), original=JSON.stringify(old);
  expect(isInterruptedProgress(old,60000)).toBe(true);
  expect(hold.holds(old,60000)).toBe(true);
  expect(hold.holds(old,90000)).toBe(true);
  expect(JSON.stringify(old)).toBe(original);
  expect(hold.holds({...old,revision:5,updatedAt:95000},96000)).toBe(false);
  expect(hold.holds(old,97000)).toBe(false);
});
it('never holds live play, a record first seen fresh, or a reconnect after release', () => {
  const hold=new InterruptedSessionHold(), live=progress(50000,'running');
  expect(isInterruptedProgress(live,52000)).toBe(false);
  expect(hold.holds(live,52000)).toBe(false);
  expect(hold.holds(live,500000)).toBe(false);
  expect(isInterruptedProgress({...live,updatedAt:{'.sv':'timestamp'}} as unknown as LiveSessionRecord,500000)).toBe(false);
  expect(isInterruptedProgress(record(),500000)).toBe(false);
});
