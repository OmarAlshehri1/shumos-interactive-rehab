import { describe, expect, it, vi } from 'vitest';
import { SwitchFinalizerRegistry, hasDirectSwitchAdapter } from '../switchFinalizer';
import type { LiveSessionRecord } from '@/lib/realtime/types';
const live = (sessionId = 'native', gameId = 'balloon-quest') => ({ sessionId, gameId }) as LiveSessionRecord;
describe('native end-and-switch ownership boundary', () => {
  it('does not guess an end adapter for a rollback engine or a specialist runtime', () => {
    const record = (gameId: string, engine?: string) => ({ gameId, session: { engine } }) as LiveSessionRecord;
    expect(hasDirectSwitchAdapter(record('balloon-quest', 'bq3'))).toBe(true);
    expect(hasDirectSwitchAdapter(record('balloon-quest'))).toBe(false);
    expect(hasDirectSwitchAdapter(record('balloon-quest', 'sp3'))).toBe(false);
    expect(hasDirectSwitchAdapter(record('space-pilot', 'sp3'))).toBe(false);
    expect(hasDirectSwitchAdapter(record('build-quest-3d', 'build3'))).toBe(false);
  });
  it('invokes only the matching mounted native controller', () => {
    const registry = new SwitchFinalizerRegistry(), end = vi.fn();
    registry.register({ gameId: 'balloon-quest', sessionId: 'native', finalize: end });
    expect(registry.finalize(live('other'))).toBe(false);
    expect(registry.finalize(live('native', 'space-pilot'))).toBe(false);
    expect(end).not.toHaveBeenCalled();
    expect(registry.finalize(live())).toBe(true);
    expect(end).toHaveBeenCalledTimes(1);
  });
  it('a stale effect cleanup cannot remove the newly registered controller', () => {
    const registry = new SwitchFinalizerRegistry(), oldEnd = vi.fn(), newEnd = vi.fn();
    const stopOld = registry.register({ gameId: 'balloon-quest', sessionId: 'old', finalize: oldEnd });
    const stopNew = registry.register({ gameId: 'balloon-quest', sessionId: 'new', finalize: newEnd });
    stopOld();
    expect(registry.finalize(live('old'))).toBe(false);
    expect(registry.finalize(live('new'))).toBe(true);
    stopNew();
    expect(registry.finalize(live('new'))).toBe(false);
    expect(oldEnd).not.toHaveBeenCalled();
  });
  it('propagates native errors rather than claiming successful finalization', () => {
    const registry = new SwitchFinalizerRegistry();
    registry.register({ gameId: 'balloon-quest', sessionId: 'native', finalize: () => { throw Error('native failure'); } });
    expect(() => registry.finalize(live())).toThrow('native failure');
  });
});
