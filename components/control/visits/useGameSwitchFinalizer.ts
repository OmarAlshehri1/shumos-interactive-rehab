'use client';
import { useEffect } from 'react';
import type { GameId } from '@/lib/games/registry';
import { useGameSafety } from './GameSafetyProvider';

/** Register only while the native controller is owned, connected and ready to accept its own end action. */
export function useGameSwitchFinalizer(gameId: GameId, sessionId: string | null | undefined, enabled: boolean, finalize: () => void) {
  const { registerFinalizer } = useGameSafety();
  useEffect(() => {
    if (!enabled || !sessionId) return;
    return registerFinalizer({ gameId, sessionId, finalize });
  }, [gameId, sessionId, enabled, finalize, registerFinalizer]);
}
