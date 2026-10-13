"use client";
import { useRewardSession } from '@/lib/interactiveRewards/useRewardSession';
import { GAME_ID, encode, makeLive, recoveredState, reviveAchievementForestLive, type AchievementForestLiveSession } from './live';
import { buildHistory } from './history';
const adapter = { GAME_ID, encode, makeLive, recover: recoveredState, revive: reviveAchievementForestLive, meta: (s: AchievementForestLiveSession) => s.af3, history: buildHistory };
export function useAchievementForestSession() { return useRewardSession(adapter); }
