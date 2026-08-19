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
  /** Internal: a failed line may retry only when no newer HIGH line is already waiting. */
  isRetry?: boolean;
}

interface QueuedRequest {
  id: number;
  text: string;
  priority: VoicePriority;
  options?: VoiceRequestOptions;
  settled: boolean;
}

/**
 * Priority gatekeeper in front of the single Munsit player.
 *
 * Only one provider request is active at a time. In particular, a new HIGH
 * request no longer calls provider.speak() while another HIGH request is
 * still fetching/playing: that old behaviour made Munsit synthesize the
 * first paid line and then silently discard it when the second line bumped
 * the provider's request token. We keep at most ONE pending HIGH line and
 * replace that pending slot with the newest instruction. This preserves a
 * coherent short sequence without building a stale narration backlog.
 *
 * A higher-priority request still interrupts lower-priority incidental
 * speech immediately. cancel() settles both active and pending callbacks so
 * ambience ducking and countdown promises cannot be left hanging.
 */
export class VoiceQueue {
  private current: QueuedRequest | null = null;
  private pendingHigh: QueuedRequest | null = null;
  private nextRequestId = 0;
  private providerToken = 0;

  constructor(private readonly provider: VoiceProvider) {}

  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  request(text: string, priority: VoicePriority, options?: VoiceRequestOptions): boolean {
    if (!text) return false;

    const request: QueuedRequest = {
      id: ++this.nextRequestId,
      text,
      priority,
      options,
      settled: false,
    };

    if (!this.current) {
      this.start(request);
      return true;
    }

    const currentRank = PRIORITY_RANK[this.current.priority];
    const incomingRank = PRIORITY_RANK[priority];
    if (incomingRank < currentRank) return false;

    if (priority === "high" && this.current.priority === "high") {
      if (options?.isRetry && this.pendingHigh) return false;
      // Keep a bounded, latest-only continuation. Replacing a not-yet-started
      // request costs no Munsit credit and prevents stale instructions from
      // accumulating behind a slow line.
      if (this.pendingHigh) this.settle(this.pendingHigh);
      this.pendingHigh = request;
      return true;
    }

    // A genuinely more important request (or a same-priority optional line,
    // which should stay immediate and ephemeral) replaces the active one.
    this.stopCurrent();
    this.start(request);
    return true;
  }

  cancel(): void {
    const pending = this.pendingHigh;
    this.pendingHigh = null;
    if (pending) this.settle(pending);
    this.stopCurrent();
  }

  /** Best-effort background cache warm-up — never affects queue state or active speech. */
  async prefetch(text: string): Promise<void> {
    await this.provider.prefetch?.(text);
  }

  private start(request: QueuedRequest): void {
    this.current = request;
    const token = ++this.providerToken;
    try {
      this.provider.speak(request.text, {
        rate: request.options?.rate,
        pitch: request.options?.pitch,
        volume: request.options?.volume,
        onError: () => {
          if (token !== this.providerToken || this.current?.id !== request.id) return;
          request.options?.onError?.();
        },
        onEnd: () => {
          if (token !== this.providerToken || this.current?.id !== request.id) return;
          this.current = null;
          this.settle(request);
          this.startPendingHigh();
        },
      });
    } catch {
      if (token !== this.providerToken || this.current?.id !== request.id) return;
      request.options?.onError?.();
      this.current = null;
      this.settle(request);
      this.startPendingHigh();
    }
  }

  private startPendingHigh(): void {
    if (this.current || !this.pendingHigh) return;
    const next = this.pendingHigh;
    this.pendingHigh = null;
    this.start(next);
  }

  private stopCurrent(): void {
    const current = this.current;
    if (!current) return;
    this.current = null;
    this.providerToken++;
    try {
      this.provider.cancel();
    } catch {
      // Cancellation is best-effort; callback settlement below is not.
    }
    this.settle(current);
  }

  private settle(request: QueuedRequest): void {
    if (request.settled) return;
    request.settled = true;
    request.options?.onEnd?.();
  }
}
