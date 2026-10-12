import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Safe Hex Arena library registration', () => {
  it('lists exactly one complete card with a thumbnail and a display module, leaving other games intact', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SAFE_HEX_ARENA_3D', 'true');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { GAME_THUMBNAILS } = await import('@/components/control/library/gameThumbnails');
    const { GAME_DISPLAY_MODULES } = await import('@/components/display/gameDisplayRegistry');
    const cards = GAME_REGISTRY.filter((g) => g.id === 'safe-hex-arena-3d');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ nameAr: 'الأرض الآمنة', nameEn: 'Safe Hex Arena 3D', route: '/control/safe-hex-arena-3d', surfaceType: 'FLOOR', status: 'ready' });
    expect(GAME_THUMBNAILS['safe-hex-arena-3d'].name).toBe('HexThumbnail');
    expect(GAME_DISPLAY_MODULES['safe-hex-arena-3d'].name).toBe('SafeHexDisplayModule');
    const ids = GAME_REGISTRY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['balloon-quest', 'follow-the-footsteps', 'bubble-pop-wall', 'space-pilot', 'color-chase']) expect(ids).toContain(id);
  }, 120_000);
  it('claims no sensor-driven tile tracking', async () => {
    const { SAFE_HEX_ARENA_REGISTRATION } = await import('../registration');
    expect(SAFE_HEX_ARENA_REGISTRATION.sensorCompatible).toBe(false);
  });
  it.each([['development', 'false'], ['production', undefined], ['production', 'false']])('hides the card for %s / %s', async (env, flag) => {
    vi.stubEnv('NODE_ENV', env);
    if (flag !== undefined) vi.stubEnv('NEXT_PUBLIC_SAFE_HEX_ARENA_3D', flag);
    else vi.stubEnv('NEXT_PUBLIC_SAFE_HEX_ARENA_3D', '');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    expect(GAME_REGISTRY.some((g) => g.id === 'safe-hex-arena-3d')).toBe(false);
  }, 60_000);
  it('is on in production only when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SAFE_HEX_ARENA_3D', 'true');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    expect(GAME_REGISTRY.filter((g) => g.id === 'safe-hex-arena-3d')).toHaveLength(1);
  }, 60_000);
});
