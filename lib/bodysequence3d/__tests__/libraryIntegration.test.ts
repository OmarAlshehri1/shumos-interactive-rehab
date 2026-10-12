import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Body Sequence in the unified library', () => {
  it('is one canonical FLOOR / FOOT game with the requested names and tags', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.resetModules();
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { DEVICE_GAMES, TARGET_PROJECTION } = await import('@/lib/games/library/capabilities');
    const g = GAME_REGISTRY.filter((x) => x.id === 'body-sequence-3d');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ nameAr: 'تحدي الجسم الذكي', nameEn: 'Body Sequence', surfaceType: 'FLOOR', route: '/control/body-sequence-3d' });
    expect(g[0].focusTagsAr).toEqual(['حركة القدمين والمشي', 'التناسق بين الأطراف']);
    expect(DEVICE_GAMES.FOOT).toContain('body-sequence-3d');
    expect(Object.values(DEVICE_GAMES).flat().filter((i) => i === 'body-sequence-3d')).toHaveLength(1);
    expect(TARGET_PROJECTION['body-sequence-3d']).toBe('FLOOR');
  });
  it('is off in production unless explicitly enabled (rollback = unset the flag)', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.resetModules();
    const off = await import('@/lib/bodysequence3d/registration');
    expect(off.BODY_SEQUENCE_ENABLED).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_BODY_SEQUENCE_3D', 'true'); vi.resetModules();
    expect((await import('@/lib/bodysequence3d/registration')).BODY_SEQUENCE_ENABLED).toBe(true);
  });
  it('has a display module, a thumbnail and a real-gameplay screenshot asset', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.resetModules();
    const { GAME_DISPLAY_MODULES } = await import('@/components/display/gameDisplayRegistry');
    expect(GAME_DISPLAY_MODULES['body-sequence-3d']).toBeTypeOf('function');
    const { realGameThumbnail } = await import('@/components/control/library/realGameThumbnails');
    expect(realGameThumbnail('body-sequence-3d')).toBe('/library-thumbnails/body-sequence-3d.webp');
  });
});
