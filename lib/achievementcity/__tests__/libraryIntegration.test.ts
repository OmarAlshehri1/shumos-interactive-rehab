import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVELS } from '../milestones';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Achievement City library integration', () => {
  it('registers one canonical wall game and a new, separate reward category', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { ACTIVITY_CATEGORY_GAMES, DEVICE_GAMES, TARGET_PROJECTION } = await import('@/lib/games/library/capabilities');
    const { LIBRARY_FILTERS, filteredGames } = await import('@/lib/games/library/filters');
    const { categorySections, librarySections } = await import('@/components/control/library/presentation');
    const g = GAME_REGISTRY.filter((x) => x.id === 'achievement-city-3d');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ nameAr: 'مدينة الإنجازات', surfaceType: 'WALL', route: '/control/achievement-city-3d' });
    expect(TARGET_PROJECTION['achievement-city-3d']).toBe('WALL');
    // the clinical/device classification is untouched: it is in no device filter
    for (const ids of Object.values(DEVICE_GAMES)) expect(ids).not.toContain('achievement-city-3d');
    expect(librarySections(GAME_REGISTRY).flatMap((s) => s.games).some((x) => x.id === 'achievement-city-3d')).toBe(false);
    expect(LIBRARY_FILTERS.find((f) => f.id === 'INTERACTIVE_REWARDS')).toMatchObject({ label: 'ألعاب التحفيز التفاعلي', icon: 'sparkles' });
    expect(ACTIVITY_CATEGORY_GAMES.INTERACTIVE_REWARDS).toEqual(['achievement-city-3d','achievement-forest-3d']);
    expect(filteredGames(GAME_REGISTRY, 'INTERACTIVE_REWARDS').map((x) => x.id)).toEqual(['achievement-forest-3d','achievement-city-3d']);
    expect(filteredGames(GAME_REGISTRY, 'ALL')).toHaveLength(21);
    const sec = categorySections(GAME_REGISTRY);
    expect(sec).toHaveLength(1);
    expect(sec[0]).toMatchObject({ input: 'INTERACTIVE_REWARDS', title: 'ألعاب التحفيز التفاعلي' });
    // every other filter keeps its previous membership counts
    expect(filteredGames(GAME_REGISTRY, 'HAND')).toHaveLength(7);
    expect(filteredGames(GAME_REGISTRY, 'FOOT')).toHaveLength(13);
    expect(filteredGames(GAME_REGISTRY, 'JOYSTICK')).toHaveLength(6);
    expect(filteredGames(GAME_REGISTRY, 'DRIVING')).toHaveLength(3);
  });

  it('rolls back cleanly when its flag is off in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_ACHIEVEMENT_CITY_3D', 'false');
    vi.resetModules();
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { categorySections } = await import('@/components/control/library/presentation');
    expect(GAME_REGISTRY.some((x) => x.id === 'achievement-city-3d')).toBe(false);
    expect(categorySections(GAME_REGISTRY)).toHaveLength(0);
  });

  it('every milestone of every level has exactly one 3D builder (and no extra)', async () => {
    const { MAKERS } = await import('@/components/display/achievementcity3d/catalog');
    const ids = LEVELS.flatMap((l) => l.milestones.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(MAKERS).sort()).toEqual([...ids].sort());
    expect(LEVELS.map((l) => l.milestones.length)).toEqual([10, 11, 11]);
  });
});
