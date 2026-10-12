import { mapToImage, IDENTITY_ORIENTATION, type FloorOrientation } from "../geometry";
import type { InputMode, SourceId } from "../types";
import { FUTURE_SKEW_MS, requiresLiveInput, sourcesForMode, STALE_MS, type PointerSample } from "./types";

export type IngestResult = "accepted" | "invalid" | "disabled" | "stale" | "future" | "out-of-order";

interface Latest {
  x: number;
  y: number;
  visible: boolean;
  seq: number;
  atMs: number;
}

export interface FreshPointer {
  sourceId: SourceId;
  x: number;
  y: number;
  seq: number;
}

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Collects the latest pointer per source and answers "which pointers can I
 * trust right now?". Rejects invalid, disabled-source, stale, future-dated
 * and out-of-order samples. It never smooths or filters positions.
 */
export class InputHub {
  private latest = new Map<SourceId, Latest>();
  private enabled = new Set<SourceId>();
  private mode: InputMode = "keyboard";
  private orientation: Partial<Record<SourceId, FloorOrientation>> = {};
  private pressCounter = 0;
  private pendingPresses: Array<{ sourceId: SourceId; id: string }> = [];
  private rejected = { invalid: 0, disabled: 0, stale: 0, future: 0, outOfOrder: 0 };

  setMode(mode: InputMode): void {
    this.mode = mode;
    this.enabled = new Set(sourcesForMode(mode));
    for (const id of [...this.latest.keys()]) if (!this.enabled.has(id)) this.latest.delete(id);
    this.pendingPresses = this.pendingPresses.filter((p) => this.enabled.has(p.sourceId));
  }
  getMode(): InputMode {
    return this.mode;
  }

  /** Per-source image mapping (e.g. a mirrored floor projection). Hands/handhelds normally keep the identity. */
  setOrientation(sourceId: SourceId, o: FloorOrientation): void {
    this.orientation[sourceId] = o;
  }

  ingest(sample: PointerSample, nowMs: number): IngestResult {
    const bad = (k: keyof typeof this.rejected, r: IngestResult): IngestResult => {
      this.rejected[k]++;
      return r;
    };
    if (!sample || !isFiniteNum(sample.x) || !isFiniteNum(sample.y) || !isFiniteNum(sample.atMs) || !Number.isSafeInteger(sample.seq) || sample.seq < 0 || typeof sample.visible !== "boolean") return bad("invalid", "invalid");
    if (!this.enabled.has(sample.sourceId)) return bad("disabled", "disabled");
    if (sample.atMs > nowMs + FUTURE_SKEW_MS) return bad("future", "future");
    if (nowMs - sample.atMs > STALE_MS) return bad("stale", "stale");
    const prev = this.latest.get(sample.sourceId);
    // A source that went silent (>STALE_MS) may restart its sequence (reconnect); a live source may never go backwards.
    if (prev && sample.seq <= prev.seq && nowMs - prev.atMs <= STALE_MS) return bad("outOfOrder", "out-of-order");
    const mapped = mapToImage({ x: Math.min(1, Math.max(0, sample.x)), y: Math.min(1, Math.max(0, sample.y)) }, this.orientation[sample.sourceId] ?? IDENTITY_ORIENTATION);
    this.latest.set(sample.sourceId, { x: mapped.x, y: mapped.y, visible: sample.visible, seq: sample.seq, atMs: sample.atMs });
    return "accepted";
  }

  /** An explicit "press" (keyboard Space, handheld trigger). Ignored for disabled sources. */
  press(sourceId: SourceId): boolean {
    if (!this.enabled.has(sourceId)) return false;
    this.pendingPresses.push({ sourceId, id: `${sourceId}:press:${++this.pressCounter}` });
    if (this.pendingPresses.length > 16) this.pendingPresses.shift();
    return true;
  }
  takePresses(): Array<{ sourceId: SourceId; id: string }> {
    const out = this.pendingPresses;
    this.pendingPresses = [];
    return out;
  }

  /** Visible pointers from enabled sources that are still fresh. */
  fresh(nowMs: number): FreshPointer[] {
    const out: FreshPointer[] = [];
    for (const [sourceId, l] of this.latest) {
      if (!this.enabled.has(sourceId) || !l.visible || nowMs - l.atMs > STALE_MS) continue;
      out.push({ sourceId, x: l.x, y: l.y, seq: l.seq });
    }
    return out;
  }

  /** Whether the current mode has any trustworthy input (always true for the keyboard). */
  hasLiveInput(nowMs: number): boolean {
    return !requiresLiveInput(this.mode) || this.fresh(nowMs).length > 0;
  }

  /** For the Control UI: one line per enabled source. */
  status(nowMs: number): Array<{ sourceId: SourceId; state: "tracking" | "stale" | "hidden" | "waiting" }> {
    return [...this.enabled].map((sourceId) => {
      const l = this.latest.get(sourceId);
      if (!l) return { sourceId, state: "waiting" as const };
      if (nowMs - l.atMs > STALE_MS) return { sourceId, state: "stale" as const };
      return { sourceId, state: l.visible ? ("tracking" as const) : ("hidden" as const) };
    });
  }

  rejections() {
    return { ...this.rejected };
  }
  clear(): void {
    this.latest.clear();
    this.pendingPresses = [];
  }
}
