import type { LiveSessionRecord } from "./types";
export interface PublishIntent {
  record: LiveSessionRecord;
  acknowledged: boolean;
}
const listeners = new Set<(event: PublishIntent) => void>();
/** Control-local observation only. A pending publish blocks navigation but never proves a saved result. */
export function observePublishIntent(
  listener: (event: PublishIntent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function reportPublishIntent(event: PublishIntent): void {
  for (const listener of listeners) listener(event);
}
