// Reuse the authoritative therapist-confirmation reducer; only forest presentation differs.
export * from '@/lib/achievementcity/engine';
import { done, type State } from '@/lib/achievementcity/engine';
import { levelDef, levelProgress } from './milestones';
export const currentLevel = (s: State) => levelDef(s.level);
export const levelProgressOf = (s: State) => levelProgress(s.level, done(s), s.target);
