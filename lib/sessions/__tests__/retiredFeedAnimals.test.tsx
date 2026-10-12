import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GAME_REGISTRY, getGameById } from '@/lib/games/registry';
import { GAME_THUMBNAILS } from '@/components/control/library/gameThumbnails';
import { GAME_DISPLAY_MODULES } from '@/components/display/gameDisplayRegistry';
import { SessionHistoryRow } from '@/components/control/patients/SessionHistoryRow';
import { buildPrefetchLines } from '@/lib/audio/AudioManager';
import { Difficulty, StageStatus } from '@/lib/game';
import { reviveAnyStoredSession } from '../sessionHistoryRepository';
import { getHistoricalGameNameAr } from '../historicalGames';
import { RETIRED_FEED_ANIMALS_ID, formatAccuracyPercent, formatResponseTimeSeconds } from '../retiredFeedAnimals';

export const retiredHistoryFixture = {
  sessionId: 'retired-feed-1', patientId: 'retired-patient', gameId: RETIRED_FEED_ANIMALS_ID,
  startedAt: 1000, completedAt: 7000, createdByUid: 'therapist',
  startingDifficulty: Difficulty.EASY, startingStage: 1, endingDifficulty: Difficulty.EASY, endingStage: 1,
  completedStageCount: 1, skippedStageCount: 0, totalRoundsPresented: 4, totalRoundsCompleted: 3,
  totalIncorrect: 1, completionRate: .75, accuracy: .75, durationMs: 6000,
  averageResponseTimeMs: 1500, bestStage: { difficulty: Difficulty.EASY, stageNumber: 1 },
  stageResults: [{ difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED,
    roundsPresented: 4, roundsCompleted: 3, incorrectCount: 1, durationMs: 6000, averageResponseTimeMs: 1500 }],
};

describe('permanently retired Feed the Animals', () => {
  it('has no launchable card, thumbnail, display renderer, route or engine', () => {
    expect(getGameById(RETIRED_FEED_ANIMALS_ID)).toBeUndefined();
    expect(GAME_REGISTRY.some(g => String(g.id) === RETIRED_FEED_ANIMALS_ID)).toBe(false);
    expect(RETIRED_FEED_ANIMALS_ID in GAME_THUMBNAILS).toBe(false);
    expect(RETIRED_FEED_ANIMALS_ID in GAME_DISPLAY_MODULES).toBe(false);
    for (const path of ['app/control/feed-the-animals', 'app/control/feed-the-animals-sensor-play', 'lib/feedanimals', 'components/display/feedanimals', 'components/control/feedanimals']) expect(existsSync(path), path).toBe(false);
    // Stale runtime input cannot cause a speculative TTS purchase.
    expect(buildPrefetchLines(RETIRED_FEED_ANIMALS_ID as Parameters<typeof buildPrefetchLines>[0], 'طفل')).toEqual([]);
  });

  it('keeps historical values, Arabic labels and the patient detail link', () => {
    const restored = reviveAnyStoredSession(retiredHistoryFixture);
    expect(restored).toEqual(retiredHistoryFixture);
    expect(getHistoricalGameNameAr(RETIRED_FEED_ANIMALS_ID)).toBe('أطعم الحيوانات');
    const html = renderToStaticMarkup(<SessionHistoryRow patientId="retired-patient" session={restored!} />);
    expect(html).toContain('أطعم الحيوانات');
    expect(html).toContain('/control/patients/retired-patient/sessions/retired-feed-1');
    expect(html).toContain('75%');
    expect(html).not.toContain('/control/feed-the-animals');
    expect(formatAccuracyPercent(.75)).toBe('75%');
    expect(formatResponseTimeSeconds(1500)).toBe('1.5 ث');
  });

  it('removes live authorization while retaining immutable historical compatibility', () => {
    const rules = JSON.parse(readFileSync('database.rules.json', 'utf8')).rules;
    expect(rules.liveSession.gameId['.validate']).not.toContain(RETIRED_FEED_ANIMALS_ID);
    expect(rules.liveSession['.validate']).toContain("newData.child('gameId').val() != 'feed-the-animals'");
    expect(JSON.parse(readFileSync('docs/release/FINAL_DATABASE_RULES_FOR_FIREBASE_CONSOLE.json', 'utf8')).rules).toEqual(rules);
    expect(rules.sessions.$historyPatientId.$sessionId.gameId['.validate']).toContain(RETIRED_FEED_ANIMALS_ID);
  });
});
