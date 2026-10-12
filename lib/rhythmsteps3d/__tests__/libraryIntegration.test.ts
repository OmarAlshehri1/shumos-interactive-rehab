import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Rhythm Steps 3D library registration', () => {
  it('lists exactly one complete FLOOR card in the Foot Sensors section, with a thumbnail and a display module, leaving other games intact', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_RHYTHM_STEPS_3D', 'true');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    const { GAME_THUMBNAILS } = await import('@/components/control/library/gameThumbnails');
    const { GAME_DISPLAY_MODULES } = await import('@/components/display/gameDisplayRegistry');
    const { DEVICE_GAMES, TARGET_PROJECTION } = await import('@/lib/games/library/capabilities');
    const cards = GAME_REGISTRY.filter((g) => g.id === 'rhythm-steps-3d');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ nameAr: 'نبض الألوان', nameEn: 'Rhythm Steps 3D', route: '/control/rhythm-steps-3d', surfaceType: 'FLOOR', status: 'ready', sensorCompatible: false });
    expect(GAME_THUMBNAILS['rhythm-steps-3d'].name).toBe('RhythmThumbnail');
    expect(GAME_DISPLAY_MODULES['rhythm-steps-3d'].name).toBe('RhythmStepsDisplayModule');
    // category and projection: foot sensors + floor only; never advertised for hands, joysticks or driving
    expect(DEVICE_GAMES.FOOT).toContain('rhythm-steps-3d');
    for (const other of ['HAND', 'JOYSTICK', 'DRIVING'] as const) expect(DEVICE_GAMES[other]).not.toContain('rhythm-steps-3d');
    expect(TARGET_PROJECTION['rhythm-steps-3d']).toBe('FLOOR');
    const ids = GAME_REGISTRY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['balloon-quest', 'follow-the-footsteps', 'bubble-pop-wall', 'space-pilot', 'color-chase', 'safe-hex-arena-3d']) expect(ids).toContain(id);
  }, 120_000);
  it('claims no sensor-driven foot tracking and has both an Arabic and an English name', async () => {
    const { RHYTHM_STEPS_REGISTRATION } = await import('../registration');
    expect(RHYTHM_STEPS_REGISTRATION.sensorCompatible).toBe(false);
    expect(RHYTHM_STEPS_REGISTRATION.nameAr.length).toBeGreaterThan(2);
    expect(RHYTHM_STEPS_REGISTRATION.nameEn).toBe('Rhythm Steps 3D');
    expect(RHYTHM_STEPS_REGISTRATION.shortDescriptionAr).not.toMatch(/يكتشف|يتتبّع موقع|تلقائي/);
  });
  it.each([['development', 'false'], ['production', undefined], ['production', 'false']])('hides the card for %s / %s', async (env, flag) => {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('NEXT_PUBLIC_RHYTHM_STEPS_3D', flag ?? '');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    expect(GAME_REGISTRY.some((g) => g.id === 'rhythm-steps-3d')).toBe(false);
  }, 60_000);
  it('is on in production only when explicitly enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_RHYTHM_STEPS_3D', 'true');
    const { GAME_REGISTRY } = await import('@/lib/games/registry');
    expect(GAME_REGISTRY.filter((g) => g.id === 'rhythm-steps-3d')).toHaveLength(1);
  }, 60_000);
  it('uses the shared history type and has no independent backend', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync('lib/rhythmsteps3d').filter((f) => f.endsWith('.ts'));
    const text = files.map((f) => readFileSync(`lib/rhythmsteps3d/${f}`, 'utf8')).join('\n');
    expect(text).not.toMatch(/initializeApp|getDatabase\(|firebase\/app|fetch\(/);
    expect(text).toContain('saveSessionHistoryOnce');
    expect(text).toContain('publishSession');
  });
});
