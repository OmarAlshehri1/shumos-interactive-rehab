import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVELS } from '../milestones';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Ocean Wonders library integration', () => {
  it('registers one canonical wall game inside the shared Interactive Rewards category (no second category)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { ACTIVITY_CATEGORY_GAMES, DEVICE_GAMES, TARGET_PROJECTION } = await import('@/lib/games/library/capabilities');
    const { LIBRARY_FILTERS, filteredGames } = await import('@/lib/games/library/filters');
    const { categorySections, librarySections } = await import('@/components/control/library/presentation');
    const g = GAME_REGISTRY.filter((x) => x.id === 'ocean-wonders-3d');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ nameAr: 'عالم المحيط', nameEn: 'Ocean Wonders 3D', surfaceType: 'WALL', route: '/control/ocean-wonders-3d' });
    expect(TARGET_PROJECTION['ocean-wonders-3d']).toBe('WALL');
    // a reward game is never a sensor game, even though the child may be exercising with their feet
    for (const ids of Object.values(DEVICE_GAMES)) expect(ids).not.toContain('ocean-wonders-3d');
    expect(librarySections(GAME_REGISTRY).flatMap((s) => s.games).some((x) => x.id === 'ocean-wonders-3d')).toBe(false);
    // the category infrastructure is reused, not duplicated
    expect(LIBRARY_FILTERS.filter((f) => f.id === 'INTERACTIVE_REWARDS')).toHaveLength(1);
    expect(ACTIVITY_CATEGORY_GAMES.INTERACTIVE_REWARDS).toContain('ocean-wonders-3d');
    expect(filteredGames(GAME_REGISTRY, 'INTERACTIVE_REWARDS').map((x) => x.id)).toEqual(expect.arrayContaining(['ocean-wonders-3d']));
    expect(filteredGames(GAME_REGISTRY, 'ALL')).toHaveLength(22);
    const sec = categorySections(GAME_REGISTRY);
    expect(sec).toHaveLength(1);
    expect(sec[0].games.map((x) => x.id)).toContain('ocean-wonders-3d');
    // every device filter keeps its previous membership counts
    expect(filteredGames(GAME_REGISTRY, 'HAND')).toHaveLength(7);
    expect(filteredGames(GAME_REGISTRY, 'FOOT')).toHaveLength(13);
    expect(filteredGames(GAME_REGISTRY, 'JOYSTICK')).toHaveLength(6);
    expect(filteredGames(GAME_REGISTRY, 'DRIVING')).toHaveLength(3);
  });

  it('rolls back cleanly when its flag is off in production, and is opt-in there', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_OCEAN_WONDERS_3D', 'false');
    vi.resetModules();
    let { GAME_REGISTRY } = await import('@/lib/games/registry');
    expect(GAME_REGISTRY.some((x) => x.id === 'ocean-wonders-3d')).toBe(false);
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    ({ GAME_REGISTRY } = await import('@/lib/games/registry'));
    expect(GAME_REGISTRY.some((x) => x.id === 'ocean-wonders-3d')).toBe(false); // production is opt-in
    vi.stubEnv('NEXT_PUBLIC_OCEAN_WONDERS_3D', 'true');
    vi.resetModules();
    ({ GAME_REGISTRY } = await import('@/lib/games/registry'));
    expect(GAME_REGISTRY.some((x) => x.id === 'ocean-wonders-3d')).toBe(true);
  });

  it('has exactly three levels and every milestone has exactly one 3D builder (and no extra)', async () => {
    const { MAKERS } = await import('@/components/display/oceanwonders3d/catalog');
    const ids = LEVELS.flatMap((l) => l.milestones.map((m) => m.id));
    expect(LEVELS).toHaveLength(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(MAKERS).sort()).toEqual([...ids].sort());
    expect(LEVELS.map((l) => l.milestones.length)).toEqual([10, 11, 11]);
    expect(LEVELS.map((l) => l.nameAr)).toEqual(['الحديقة المرجانية', 'مملكة الأعماق', 'المحيط الأسطوري']);
  });
});
