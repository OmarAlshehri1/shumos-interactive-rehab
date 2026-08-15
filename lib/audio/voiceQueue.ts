import type { VoiceProvider } from "./speech";
import type { VoicePriority } from "./types";

const PRIORITY_RANK: Record<VoicePriority, number> = { low: 0, normal: 1, high: 2 };

export interface VoiceRequestOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  onEnd?: () => void;
  /** Called if the provider specifically failed to produce/play this line — AudioManager uses this to retry critical lines once. */
  onError?: () => void;
}

/**
 * Priority gatekeeper in front of a VoiceProvider — this is what makes
 * "an encouragement line should NOT cancel an instruction" and "a
 * high-priority line may cancel lower-priority speech, including stale
 * speech from the previous stage" actually hold, regardless of which
 * VoiceProvider is plugged in underneath.
 *
 * Rule: a request is spoken (canceling whatever's currently active) if its
 * priority is >= the priority of whatever is currently speaking. A lower-
 * priority request arriving while something more important is still
 * speaking is dropped, not queued — a delayed "رائع!" arriving after the
 * moment it was about has already passed would feel disconnected, so
 * silence is the better pediatric UX call here than a backlog.
 */
export class VoiceQueue {
  private currentPriority: VoicePriority | null = null;

  constructor(private readonly provider: VoiceProvider) {}

  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  request(text: string, priority: VoicePriority, options?: VoiceRequestOptions): boolean {
    if (!text) return false;
    if (this.currentPriority !== null && PRIORITY_RANK[priority] < PRIORITY_RANK[this.currentPriority]) {
      return false; // dropped: something more important is already speaking
    }

    this.currentPriority = priority;
    this.provider.speak(text, {
      rate: options?.rate,
      pitch: options?.pitch,
      volume: options?.volume,
      onEnd: () => {
        if (this.currentPriority === priority) this.currentPriority = null;
        options?.onEnd?.();
      },
      onError: () => options?.onError?.(),
    });
    return true;
  }

  cancel(): void {
    this.provider.cancel();
    this.currentPriority = null;
  }

  /** Best-effort background cache warm-up — never affects currentPriority or what's actively speaking. Resolves when the attempt finishes. */
  async prefetch(text: string): Promise<void> {
    await this.provider.prefetch?.(text);
  }
}
