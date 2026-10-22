import { GameState } from '@/lib/game';
import { decodeCheckpoint, isSpacePilotLive, type SpacePilotLiveSession } from './cloudState';

/** Mount only the validated Space Pilot renderer behind the waiting screen.
 * Its real rendered-frame ACK is required before Control can accept Start.
 * This does not grant authorization, start simulation, or change the shared presentation gate. */
export function spacePilotNeedsPreparation(session: unknown, gameId: string | null): boolean {
  if (gameId !== 'space-pilot' || !isSpacePilotLive(session)) return false;
  const live = session as SpacePilotLiveSession;
  return live.gameState === GameState.START_ZONE && decodeCheckpoint(live)?.state.lifecycle === 'ready';
}
