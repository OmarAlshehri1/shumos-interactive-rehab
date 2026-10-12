import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Foot Maze in the unified library', () => {
  it('is one canonical FLOOR / FOOT game with the requested names and tags', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.resetModules();
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { DEVICE_GAMES, TARGET_PROJECTION } = await import('@/lib/games/library/capabilities');
    const g = GAME_REGISTRY.filter((x) => x.id === 'foot-maze-3d');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ nameAr: 'متاهة القدمين', nameEn: 'Foot Maze', surfaceType: 'FLOOR', route: '/control/foot-maze-3d' });
    for (const tag of ['حركة القدمين والمشي', 'التوازن والثبات', 'التخطيط الحركي']) expect(g[0].focusTagsAr).toContain(tag);
    expect(DEVICE_GAMES.FOOT).toContain('foot-maze-3d');
    expect(Object.values(DEVICE_GAMES).flat().filter((i) => i === 'foot-maze-3d')).toHaveLength(1);
    expect(TARGET_PROJECTION['foot-maze-3d']).toBe('FLOOR');
  });
  it('is off in production unless explicitly enabled (rollback = unset the flag)', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.resetModules();
    expect((await import('@/lib/footmaze3d/registration')).FOOT_MAZE_ENABLED).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FOOT_MAZE_3D', 'true'); vi.resetModules();
    expect((await import('@/lib/footmaze3d/registration')).FOOT_MAZE_ENABLED).toBe(true);
  });
});
