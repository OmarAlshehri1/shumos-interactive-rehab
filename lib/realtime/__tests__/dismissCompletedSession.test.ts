import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),history:vi.fn(),transaction:vi.fn(),uid:'staff'}));
vi.mock('firebase/auth',()=>({getAuth:()=>({currentUser:{uid:m.uid}})}));
vi.mock('firebase/database',()=>({ref:(_db:unknown,path:string)=>path,get:vi.fn(),runTransaction:m.transaction}));
vi.mock('../sessionRepository',()=>({fetchLiveSession:m.fetch}));
vi.mock('@/lib/sessions/sessionHistoryRepository',()=>({getSessionHistoryRecord:m.history}));
import { canResumeSession, dismissCompletedSession } from '../dismissCompletedSession';
import type { LiveSessionRecord } from '../types';
const record=()=>({controllerUid:'staff',sessionId:'completed',revision:4,patientId:'synthetic-patient',gameId:'balloon-quest',session:{gameState:'SESSION_COMPLETE'}});
beforeEach(()=>{vi.clearAllMocks();m.uid='staff';m.fetch.mockResolvedValue(record());m.history.mockResolvedValue({sessionId:'completed',patientId:'synthetic-patient',gameId:'balloon-quest'});});
it('limits the therapist recovery shortcut to proven ownership, including legacy native ownership',()=>{
  const check=(value:unknown)=>canResumeSession({} as never,value as LiveSessionRecord);
  expect(check(record())).toBe(true);
  expect(check({...record(),controllerUid:'foreign'})).toBe(false);
  expect(check({...record(),controllerUid:undefined,session:{engine:'bb3',bb3:{ownerId:'staff'}}})).toBe(true);
  expect(check({...record(),controllerUid:undefined,session:{engine:'bb3',bb3:{ownerId:'foreign'}}})).toBe(false);
});
it('never dismisses unfinished gameplay or a completed patient session without matching saved proof',async()=>{
  for(const current of [{...record(),session:{gameState:'PLAYING'}},{...record(),sessionId:'new'}, {...record(),revision:5}]) {
    m.fetch.mockResolvedValue(current);expect(await dismissCompletedSession({} as never,'completed',4)).toBe(false);
  }
  m.fetch.mockResolvedValue(record());m.history.mockResolvedValue(null);
  expect(await dismissCompletedSession({} as never,'completed',4)).toBe(false);
  expect(m.transaction).not.toHaveBeenCalled();
});
it('atomically rechecks owner, identity, revision and completion; never writes history or private binding',async()=>{
  m.transaction.mockImplementation(async(path,update)=>{
    expect(path).toBe('liveSession');expect(update(record())).toBeNull();
    for(const raw of [null,{...record(),controllerUid:'foreign'},{...record(),sessionId:'new'},{...record(),revision:5},{...record(),session:{gameState:'PLAYING'}}]) expect(update(raw)).toBeUndefined();
    return {committed:true};
  });
  expect(await dismissCompletedSession({} as never,'completed',4)).toBe(true);
  expect(m.transaction).toHaveBeenCalledTimes(1);
});
