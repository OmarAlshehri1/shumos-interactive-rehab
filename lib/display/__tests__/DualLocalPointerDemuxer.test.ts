import { describe, expect, it } from "vitest";
import { DualLocalPointerDemuxer } from "../DualLocalPointerDemuxer";
import type { LocalPointerMessage } from "../LocalPointerChannel";

function message(overrides: Partial<LocalPointerMessage>): LocalPointerMessage {
  return { role: "RIGHT_HAND", x: 0, y: 0, visible: true, seq: 1, sentAtMs: 0, ...overrides };
}

describe("DualLocalPointerDemuxer — latest sample wins PER HAND, not globally", () => {
  it("tracks RIGHT_HAND and LEFT_HAND independently from the very first message", () => {
    const demux = new DualLocalPointerDemuxer();
    demux.accept(message({ role: "RIGHT_HAND", x: 0.2, y: 0.3, seq: 1 }));
    demux.accept(message({ role: "LEFT_HAND", x: 0.8, y: 0.7, seq: 1 }));

    expect(demux.snapshot()).toEqual({
      right: { x: 0.2, y: 0.3, visible: true },
      left: { x: 0.8, y: 0.7, visible: true },
    });
  });

  it("a burst of newer RIGHT_HAND messages never makes a still-valid LEFT_HAND sample stale", () => {
    const demux = new DualLocalPointerDemuxer();
    demux.accept(message({ role: "LEFT_HAND", x: 0.5, y: 0.5, seq: 1 }));
    for (let seq = 1; seq <= 50; seq++) {
      demux.accept(message({ role: "RIGHT_HAND", x: 0.1, y: 0.1, seq }));
    }
    // LEFT_HAND's own seq=1 is still its own latest (never superseded by RIGHT's seq numbers).
    expect(demux.snapshot().left).toEqual({ x: 0.5, y: 0.5, visible: true });
  });

  it("rejects an out-of-order/duplicate seq for a role, without touching the other role's state", () => {
    const demux = new DualLocalPointerDemuxer();
    demux.accept(message({ role: "RIGHT_HAND", x: 0.4, y: 0.4, seq: 5 }));
    const accepted = demux.accept(message({ role: "RIGHT_HAND", x: 0.9, y: 0.9, seq: 3 })); // stale/out-of-order

    expect(accepted).toBe(false);
    expect(demux.snapshot().right).toEqual({ x: 0.4, y: 0.4, visible: true }); // unchanged - the stale one never applied
  });

  it("a hand going invisible (disconnect) is reflected only for that hand", () => {
    const demux = new DualLocalPointerDemuxer();
    demux.accept(message({ role: "RIGHT_HAND", x: 0.3, y: 0.3, seq: 1 }));
    demux.accept(message({ role: "LEFT_HAND", x: 0.6, y: 0.6, seq: 1 }));
    demux.accept(message({ role: "RIGHT_HAND", visible: false, seq: 2 }));

    expect(demux.snapshot()).toEqual({
      right: { x: 0, y: 0, visible: false },
      left: { x: 0.6, y: 0.6, visible: true }, // untouched by RIGHT_HAND's disconnect
    });
  });

  it("returns null for a role that has never sent a message yet", () => {
    const demux = new DualLocalPointerDemuxer();
    demux.accept(message({ role: "RIGHT_HAND", seq: 1 }));
    expect(demux.snapshot().left).toBeNull();
  });

  it("rejects a malformed seq without throwing", () => {
    const demux = new DualLocalPointerDemuxer();
    // @ts-expect-error deliberately malformed for the runtime guard
    expect(demux.accept({ role: "RIGHT_HAND", x: 0, y: 0, visible: true, seq: "not-a-number", sentAtMs: 0 })).toBe(false);
  });
});
