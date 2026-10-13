"use client";
import { useRewardSession } from '@/lib/interactiveRewards/useRewardSession';
import { GAME_ID, encode, makeLive, recoveredState, reviveAchievementCityLive, type AchievementCityLiveSession } from './live';
import { buildHistory } from './history';
const adapter = { GAME_ID, encode, makeLive, recover: recoveredState, revive: reviveAchievementCityLive, meta: (s: AchievementCityLiveSession) => s.ac3, history: buildHistory };
export function useAchievementCitySession() { return useRewardSession(adapter); }
