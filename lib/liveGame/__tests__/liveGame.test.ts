import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlFreshness, decideRecovery, isTakenOver, OWNER_STALE_MS, RECOVERY_MAX_AGE_MS } from "../ownership";
import { LiveRecordPublisher, type LiveWriteRequest } from "../publisher";
import { HistorySaver } from "../historySaver";

const snap = { sessionId: "s1" };
const base = { recordSessionId: "s1", recordPatientId: "p1" as string | null, meta: { ownerId: "u1", controlTabId: "tab-A", heartbeatAt: 1_000_000 }, snapshot: snap, uid: "u1", patientId: "p1" as string | null, tabId: "tab-A", now: 1_002_000 };

describe("ownership decision", () => {
  it("recovers at once in the same window", () => {
    const d = decideRecovery(base);
    expect(d.kind === "recover" && d.why).toBe("same-window");
  });
  it("blocks another live window unless forced, recovers a window that stopped writing", () => {
    const other = { ...base, tabId: "tab-B" };
    expect(decideRecovery(other)).toEqual({ kind: "blocked", why: "other-window-active", takeoverAllowed: true });
    const forced = decideRecovery({ ...other, force: true });
    expect(forced.kind === "recover" && forced.why).toBe("takeover");
    expect(forced.kind === "recover" && forced.fromTabId).toBe("tab-A");
    const gone = decideRecovery({ ...other, now: 1_000_000 + OWNER_STALE_MS });
    expect(gone.kind === "recover" && gone.why).toBe("owner-gone");
  });
  it("a window that is still alive is never overwritten by a fresh session, whatever patient the new window has; take-over then needs the same patient", () => {
    const other = { ...base, tabId: "tab-B" };
    expect(decideRecovery({ ...other, patientId: "p2" })).toEqual({ kind: "blocked", why: "other-window-active", takeoverAllowed: false });
    expect(decideRecovery({ ...other, patientId: null, force: true })).toEqual({ kind: "blocked", why: "other-window-active", takeoverAllowed: false });
    // Once it stopped writing, a different patient simply means a fresh session.
    expect(decideRecovery({ ...other, patientId: "p2", now: 1_000_000 + OWNER_STALE_MS }).kind).toBe("none");
  });
  it("never adopts another account's, another patient's (same window), a mismatching or missing session", () => {
    expect(decideRecovery({ ...base, uid: "u2" }).kind).toBe("none");
    expect(decideRecovery({ ...base, patientId: "p2" }).kind).toBe("none");
    expect(decideRecovery({ ...base, patientId: null }).kind).toBe("none");
    expect(decideRecovery({ ...base, recordSessionId: "other" }).kind).toBe("none");
    expect(decideRecovery({ ...base, snapshot: null }).kind).toBe("none");
    expect(decideRecovery({ ...base, recordPatientId: null, patientId: null }).kind).toBe("recover"); // walk-in matches walk-in
  });
  it("preserves validated recovery data beyond the old age cutoff instead of silently starting over", () => {
    const snapshot = { sessionId: 's1', state: { status: 'paused', elapsed: 1234, completed: [1] } };
    const decision = decideRecovery({ ...base, snapshot, tabId: 'new-window', now: 1_000_000 + RECOVERY_MAX_AGE_MS * 14 });
    expect(decision.kind).toBe('recover');
    expect(decision.kind === 'recover' && decision.snapshot).toBe(snapshot);
    expect(decideRecovery({ ...base, snapshot, patientId: 'another-patient', now: 1_000_000 + RECOVERY_MAX_AGE_MS * 14 }).kind).toBe('none');
  });
  it("only an explicit hand-over naming this window stands it down", () => {
    expect(isTakenOver({ takeoverFrom: "tab-A" }, "tab-A")).toBe(true);
    expect(isTakenOver({ takeoverFrom: "tab-A" }, "tab-B")).toBe(false);
    expect(isTakenOver({}, "tab-A")).toBe(false);
    expect(isTakenOver(null, "tab-A")).toBe(false);
  });
  it("Display-side freshness uses local receipt times only", () => {
    const f = new ControlFreshness(15_000);
    expect(f.alive(0)).toBe(false);
    f.observe(111, 1000);
    expect(f.alive(5000)).toBe(true);
    f.observe(111, 9000); // same heartbeat value: not a new write
    expect(f.alive(17_000)).toBe(false);
    f.observe(222, 17_000);
    expect(f.alive(18_000)).toBe(true);
  });
});

describe("LiveRecordPublisher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const make = () => {
    let t = 0;
    const writes: LiveWriteRequest<{ n: number; tab?: string; beat?: number; from?: string }>[] = [];
    let fail = 0, stored = 0;
    const pub = new LiveRecordPublisher<{ n: number; tab?: string; beat?: number; from?: string }>({
      write: async (w) => { if (fail > 0) { fail--; throw new Error("denied"); } writes.push(w); stored = w.revision; },
      fetchBaseRevision: async () => stored + 5,
      now: () => t,
    });
    return { pub, writes, setFail: (n: number) => (fail = n), advance: (ms: number) => (t += ms) };
  };
  it("writes nothing until enabled, then once, with strictly increasing revisions and ownership stamps", async () => {
    const { pub, writes } = make();
    pub.setBaseRevision(10);
    pub.setTabId("tab-A");
    pub.publish("s1", (st) => ({ n: 1, tab: st.controlTabId, beat: st.heartbeatAt }));
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(0);
    pub.setEnabled(true);
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(1);
    expect(writes[0].revision).toBe(11);
    expect(writes[0].session.tab).toBe("tab-A");
    pub.publish("s1", () => ({ n: 2 }));
    await vi.runAllTimersAsync();
    expect(writes.map((w) => w.revision)).toEqual([11, 12]);
  });
  it("coalesces: only the latest pending content is written while one write is in flight", async () => {
    const { pub, writes } = make();
    pub.setEnabled(true);
    pub.publish("s1", () => ({ n: 1 }));
    pub.publish("s1", () => ({ n: 2 }));
    pub.publish("s1", () => ({ n: 3 }));
    await vi.runAllTimersAsync();
    expect(writes[writes.length - 1].session.n).toBe(3);
    expect(writes.length).toBeLessThanOrEqual(2);
  });
  it("a rejected write re-bases on the stored revision and retries with the latest content", async () => {
    const { pub, writes, setFail } = make();
    pub.setEnabled(true);
    setFail(1);
    pub.publish("s1", () => ({ n: 7 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(writes).toHaveLength(1);
    expect(writes[0].session.n).toBe(7);
    expect(writes[0].revision).toBeGreaterThan(5);
  });
  it("touch() rewrites only after the interval and carries a fresh heartbeat and hand-over marker", async () => {
    const { pub, writes, advance } = make();
    pub.setEnabled(true);
    pub.setTakeoverFrom("tab-0");
    pub.publish("s1", (st) => ({ n: 1, beat: st.heartbeatAt, from: st.takeoverFrom }));
    await vi.runAllTimersAsync();
    pub.touch(4000);
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(1);
    advance(4000);
    pub.touch(4000);
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(2);
    expect(writes[1].session.beat).toBe(4000);
    expect(writes[1].session.from).toBe("tab-0");
  });
  it("dispose stops all writing", async () => {
    const { pub, writes } = make();
    pub.setEnabled(true);
    pub.dispose();
    pub.publish("s1", () => ({ n: 1 }));
    await vi.runAllTimersAsync();
    expect(writes).toHaveLength(0);
  });
});

describe("HistorySaver", () => {
  it("saves once per key, never for walk-in sessions, paces retries after a failure", async () => {
    const h = new HistorySaver(3000);
    const save = vi.fn(async () => {});
    expect(await h.save("k", null, 0, save)).toBe("walk-in");
    expect(save).not.toHaveBeenCalled();
    expect(await h.save("k2", "p1", 0, save)).toBe("saved");
    expect(await h.save("k2", "p1", 10_000, save)).toBe("saved");
    expect(save).toHaveBeenCalledTimes(1);
    const flaky = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(undefined);
    expect(await h.save("k3", "p1", 20_000, flaky)).toBe("retry");
    expect(await h.save("k3", "p1", 21_000, flaky)).toBe("retry"); // too soon: not attempted
    expect(flaky).toHaveBeenCalledTimes(1);
    expect(await h.save("k3", "p1", 24_000, flaky)).toBe("saved");
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(h.isDone("k3")).toBe(true);
  });
  it("does not start a second save for a key that is still saving", async () => {
    const h = new HistorySaver(0);
    let release!: () => void;
    const slow = vi.fn(() => new Promise<void>((r) => (release = r)));
    const first = h.save("k", "p1", 0, slow);
    const second = await h.save("k", "p1", 1, slow);
    expect(second).toBe("saving");
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe("saved");
  });
});
