'use client';
import { useRewardSession } from '@/lib/interactiveRewards/useRewardSession';
import { GAME_ID, encode, makeLive, recoveredState, reviveOceanWondersLive, type OceanWondersLiveSession } from './live';
import { buildHistory } from './history';
// All three reward games use the existing shared lease, publisher, recovery and Gamepad loop.
const adapter = { GAME_ID, encode, makeLive, recover: recoveredState, revive: reviveOceanWondersLive, meta: (s: OceanWondersLiveSession) => s.ow3, history: buildHistory };
export function useOceanWondersSession() { return useRewardSession(adapter); }
