import { afterEach, expect, it, vi } from "vitest";
import { mountControlSession, type ControlSessionHandle, type ControlSessionView } from "../controlSessionRuntime";
import type { PresentationFrame, SessionMessage } from "../sessionContract";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("uses callback-entry time when an ACK arrives after RAF's frame-start timestamp", async () => {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const documentEvents = new EventTarget(), windowEvents = new EventTarget();
  vi.stubGlobal("document", Object.assign(documentEvents, { hidden: false }));
  vi.stubGlobal("window", windowEvents);
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
  vi.stubGlobal("navigator", { locks: { request: (_name: string, _options: unknown, callback: () => Promise<void>) => callback() } });
  let animation: FrameRequestCallback = () => {};
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { animation = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const channels: FakeChannel[] = [];
  class FakeChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    messages: SessionMessage[] = [];
    constructor(readonly name: string) { channels.push(this); }
    postMessage(message: SessionMessage) { this.messages.push(message); }
    close() {}
  }
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  let handle: ControlSessionHandle | undefined, view: ControlSessionView | undefined;
  const close = mountControlSession(v => { view = v; }, h => { handle = h; }, message => { throw Error(message); });
  await Promise.resolve();
  const channel = channels.find(c => c.name.startsWith("shumos-experimental"))!;
  let sequence = 0;
  const ack = () => {
    const frame = (channel.messages.filter(m => m.type === "frame").at(-1) as { frame: PresentationFrame }).frame;
    channel.onmessage!({ data: { version: 4, type: "ack", displayId: "display-test", ...frame, frameSequence: frame.sequence, sequence: ++sequence, visible: true, ready: true } });
  };
  ack(); ack();
  expect(view!.ready).toBe(true);
  expect(handle!.action({ type: "start" }, view!.state.revision, view!.state.runId)).toBe(true);
  now = 1017.4; ack();
  animation(1016.7); // Legitimate browser ordering, not a reverse clock.
  expect(view!.state.lifecycle).toBe("running");
  expect(view!.state.primaryDisplayId).toBe("display-test");
  close();
  expect(channel.onmessage).toBeNull();
});
