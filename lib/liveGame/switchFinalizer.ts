import type { GameId } from '@/lib/games/registry';
import type { LiveSessionRecord } from '@/lib/realtime/types';

export interface GameSwitchFinalizer {
  gameId: GameId;
  sessionId: string;
  finalize: () => void;
}
/** Explicit native adapters only; legacy rollback routes and specialist runtimes are not guessed. */
export const DIRECT_SWITCH_ENGINES: Partial<Record<GameId, string>> = {
  'balloon-quest': 'bq3', 'runner-quest-3d': 'rq3', 'follow-the-footsteps': 'fp3',
  'bubble-pop-wall': 'dome3', 'color-chase': 'cc3', 'mirror-quest-3d': 'mirror3',
  'safe-hex-arena-3d': 'hex3', 'rhythm-steps-3d': 'rs3', 'turn-and-go-3d': 'tg3',
  'foot-maze-3d': 'fm3', 'body-sequence-3d': 'bs3', 'balance-bridge-3d': 'bb3',
  'blooming-world-3d': 'bw3', 'harvest-valley-3d': 'hv3', 'shumos-castle-legends-3d': 'castle3',
  'fire-rescue-3d': 'fr3', 'pearl-voyage-3d': 'pv3', 'achievement-city-3d': 'ac3',
  'achievement-forest-3d': 'af3', 'ocean-wonders-3d': 'ow3',
};
export function hasDirectSwitchAdapter(record: LiveSessionRecord): boolean {
  return !!record.gameId && !!DIRECT_SWITCH_ENGINES[record.gameId]
    && (record.session as { engine?: string }).engine === DIRECT_SWITCH_ENGINES[record.gameId];
}
/** A mounted native controller's end command, never a second runtime or history writer. */
export class SwitchFinalizerRegistry {
  private active: GameSwitchFinalizer | null = null;
  register(adapter: GameSwitchFinalizer): () => void {
    this.active = adapter;
    return () => { if (this.active === adapter) this.active = null; };
  }
  matches(record: LiveSessionRecord | null): boolean {
    return !!record && this.active?.gameId === record.gameId && this.active.sessionId === record.sessionId;
  }
  finalize(record: LiveSessionRecord): boolean {
    if (!this.matches(record)) return false;
    this.active!.finalize();
    return true;
  }
}
