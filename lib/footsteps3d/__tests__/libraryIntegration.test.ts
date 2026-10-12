import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Follow the Footsteps in the existing library', () => {
  it('with the flag on: exactly one card, same id and route, 3D name and description, floor projection, forest thumbnail, router display module', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_FOOTSTEPS_3D', 'true');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { GAME_THUMBNAILS } = await import('@/components/control/library/gameThumbnails');
    const { GAME_DISPLAY_MODULES } = await import('@/components/display/gameDisplayRegistry');
    const cards = GAME_REGISTRY.filter((g) => g.id === 'follow-the-footsteps');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ nameAr: 'اتبع الخطوات', nameEn: 'Follow the Footsteps 3D', route: '/control/follow-the-footsteps', surfaceType: 'FLOOR', status: 'ready', sensorCompatible: false });
    expect(cards[0].shortDescriptionAr).toContain('غابة');
    expect(GAME_THUMBNAILS['follow-the-footsteps'].name).toBe('FootstepsForestThumbnail');
    expect(typeof GAME_DISPLAY_MODULES['follow-the-footsteps']).toBe('function');
    const ids = GAME_REGISTRY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate card anywhere
    for (const id of ['balloon-quest', 'bubble-pop-wall', 'space-pilot', 'color-chase']) expect(ids).toContain(id);
  }, 120_000);
  it.each([['development', 'false'], ['production', ''], ['production', 'false']])('with the flag off (%s / %s): the original card, thumbnail and sensors are served, still exactly one card', async (env, flag) => {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('NEXT_PUBLIC_FOOTSTEPS_3D', flag);
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { GAME_THUMBNAILS } = await import('@/components/control/library/gameThumbnails');
    const cards = GAME_REGISTRY.filter((g) => g.id === 'follow-the-footsteps');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ nameEn: 'Follow the Footsteps', route: '/control/follow-the-footsteps', sensorCompatible: true, surfaceType: 'FLOOR' });
    expect(GAME_THUMBNAILS['follow-the-footsteps'].name).toBe('FollowTheFootstepsThumbnail');
  }, 60_000);
  it('is on in production only when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_FOOTSTEPS_3D', 'true');
    const { FOOTSTEPS_3D_ENABLED } = await import('../registration');
    expect(FOOTSTEPS_3D_ENABLED).toBe(true);
  });
});
