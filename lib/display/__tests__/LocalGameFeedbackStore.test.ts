import { describe, expect, it } from "vitest";
import { LocalGameFeedbackStore } from "../LocalGameFeedbackStore";

describe("LocalGameFeedbackStore", () => {
  it("an accepted action emits one locally-accepted entry", () => {
    const store = new LocalGameFeedbackStore();
    expect(store.isAccepted("balloon_0")).toBe(false);
    store.accept("balloon_0", 1000);
    expect(store.isAccepted("balloon_0")).toBe(true);
    expect(store.size).toBe(1);
  });

  it("duplicate local event ignored: accepting the same id twice never creates a second entry", () => {
    const store = new LocalGameFeedbackStore();
    store.accept("balloon_0", 1000);
    store.accept("balloon_0", 1500); // e.g. a redundant re-delivery
    expect(store.size).toBe(1);
    expect(store.isAccepted("balloon_0")).toBe(true);
  });

  it("reconcile removes the entry and reports it was present", () => {
    const store = new LocalGameFeedbackStore();
    store.accept("balloon_0", 1000);
    expect(store.reconcile("balloon_0")).toBe(true);
    expect(store.isAccepted("balloon_0")).toBe(false);
    expect(store.size).toBe(0);
  });

  it("reconciling an id that was never accepted is a harmless no-op", () => {
    const store = new LocalGameFeedbackStore();
    expect(store.reconcile("never-accepted")).toBe(false);
    expect(store.size).toBe(0);
  });

  it("stale event ignored: an entry older than maxAgeMs is dropped by sweepExpired", () => {
    const store = new LocalGameFeedbackStore();
    store.accept("balloon_0", 1000);
    expect(store.sweepExpired(1000 + 5000, 8000)).toBe(false); // not old enough yet
    expect(store.isAccepted("balloon_0")).toBe(true);
    expect(store.sweepExpired(1000 + 9000, 8000)).toBe(true); // now past the TTL
    expect(store.isAccepted("balloon_0")).toBe(false);
  });

  it("sweepExpired only removes entries actually past the TTL, leaving fresher ones intact", () => {
    const store = new LocalGameFeedbackStore();
    store.accept("old", 0);
    store.accept("fresh", 9000);
    expect(store.sweepExpired(10000, 8000)).toBe(true); // "old" is 10000ms stale, "fresh" only 1000ms
    expect(store.isAccepted("old")).toBe(false);
    expect(store.isAccepted("fresh")).toBe(true);
  });

  it("clear drops every pending entry regardless of age", () => {
    const store = new LocalGameFeedbackStore();
    store.accept("a", 1000);
    store.accept("b", 2000);
    store.clear();
    expect(store.size).toBe(0);
    expect(store.isAccepted("a")).toBe(false);
    expect(store.isAccepted("b")).toBe(false);
  });

  it("tracks multiple distinct target ids independently", () => {
    const store = new LocalGameFeedbackStore();
    store.accept("balloon_0", 1000);
    store.accept("balloon_1", 1000);
    store.reconcile("balloon_0");
    expect(store.isAccepted("balloon_0")).toBe(false);
    expect(store.isAccepted("balloon_1")).toBe(true);
  });

  it("acceptedAt reports when a target was accepted, and null once reconciled", () => {
    const store = new LocalGameFeedbackStore();
    expect(store.acceptedAt("balloon_0")).toBeNull();
    store.accept("balloon_0", 4242);
    expect(store.acceptedAt("balloon_0")).toBe(4242);
    store.reconcile("balloon_0");
    expect(store.acceptedAt("balloon_0")).toBeNull();
  });

  describe("subscribe/notify", () => {
    // This is what a real display-side consumer (Balloon.tsx via
    // useSyncExternalStore) relies on for an IMMEDIATE update — the whole
    // point of this store existing separately from a React-Context-held
    // derived object (see this file's own doc comment for the bug that
    // caused on real hardware).
    it("accept() notifies every subscriber synchronously", () => {
      const store = new LocalGameFeedbackStore();
      const calls: number[] = [];
      store.subscribe(() => calls.push(1));
      store.accept("balloon_0", 1000);
      expect(calls).toHaveLength(1);
    });

    it("reconcile() notifies only when it actually removed something", () => {
      const store = new LocalGameFeedbackStore();
      const calls: number[] = [];
      store.subscribe(() => calls.push(1));
      store.reconcile("never-accepted");
      expect(calls).toHaveLength(0);
      store.accept("balloon_0", 1000);
      expect(calls).toHaveLength(1);
      store.reconcile("balloon_0");
      expect(calls).toHaveLength(2);
    });

    it("sweepExpired() notifies only when it actually removed something", () => {
      const store = new LocalGameFeedbackStore();
      const calls: number[] = [];
      store.accept("balloon_0", 0);
      store.subscribe(() => calls.push(1));
      expect(store.sweepExpired(100, 8000)).toBe(false);
      expect(calls).toHaveLength(0);
      expect(store.sweepExpired(9000, 8000)).toBe(true);
      expect(calls).toHaveLength(1);
    });

    it("clear() notifies only when the store actually held something", () => {
      const store = new LocalGameFeedbackStore();
      const calls: number[] = [];
      store.subscribe(() => calls.push(1));
      store.clear(); // empty already — no notification expected
      expect(calls).toHaveLength(0);
      store.accept("balloon_0", 1000); // this DOES notify (1)
      expect(calls).toHaveLength(1);
      store.clear(); // now actually clears something — notifies again (2)
      expect(calls).toHaveLength(2);
    });

    it("an unsubscribed listener never fires again", () => {
      const store = new LocalGameFeedbackStore();
      const calls: number[] = [];
      const unsubscribe = store.subscribe(() => calls.push(1));
      store.accept("balloon_0", 1000);
      expect(calls).toHaveLength(1);
      unsubscribe();
      store.accept("balloon_1", 2000);
      expect(calls).toHaveLength(1);
    });

    it("multiple independent subscribers (e.g. two different balloons) each get notified", () => {
      const store = new LocalGameFeedbackStore();
      const a: number[] = [];
      const b: number[] = [];
      store.subscribe(() => a.push(1));
      store.subscribe(() => b.push(1));
      store.accept("balloon_0", 1000);
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    });
  });
});
