import { GameState } from "@/lib/game";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import type { AnyStoredSession } from "@/lib/sessions/types";
import {
  confirmedLiveResult,
  isUnstartedActivity,
  ownedByTab,
} from "@/lib/therapyVisits/gameSafety";
import { GAME_ID } from "./engine";
/** A new activity cannot erase another activity's unresolved or unsaved patient session. */
export function mayEnterBridge(
  record: LiveSessionRecord | null,
  result: AnyStoredSession | null,
  tabId?: string,
) {
  if (
    !record ||
    (tabId && isUnstartedActivity(record) && ownedByTab(record, tabId)) ||
    record.gameId === GAME_ID
  )
    return true; // Bridge ownership and patient recovery are checked separately.
  return (
    record.session.gameState === GameState.SESSION_COMPLETE &&
    (!record.patientId || confirmedLiveResult(record, result))
  );
}
