import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "firebase/database";

const fixture = vi.hoisted(() => ({
  lease: null as null | { ownerId: string; updatedAt: number },
  online: true, active: true,
  get: vi.fn(), set: vi.fn(),
}));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  onValue: (path: string, callback: (s: { val: () => unknown; exists: () => boolean }) => void) => {
    const value = path === ".info/connected" ? fixture.online : path.startsWith("staff/") ? fixture.active : path === "controllerLease" ? fixture.lease : null;
    callback({ val: () => value, exists: () => value !== null });
    return vi.fn();
  },
  get: fixture.get, set: fixture.set, serverTimestamp: () => ({ ".sv": "timestamp" }),
}));
vi.mock("@/lib/liveGame/ownership", () => ({ controlTabId: () => "control-tab" }));
vi.mock("@/lib/realtime/sessionRepository", () => ({ refreshControllerLease: vi.fn() }));
vi.mock("../repository", () => ({ prepareVideoDisplay: vi.fn(), stopOwnedVideo: vi.fn(), subscribeCommand: () => vi.fn() }));
vi.mock("../tabShareSignaling", () => ({ removeShare: vi.fn(), renewShare: vi.fn(), serverOffset: vi.fn(), shareExpiry: vi.fn(), subscribeShare: vi.fn() }));
import { LocalTabShareControl, type SharingState } from "../localTabShareControl";
import { captureFailureMessage, shareDiagnostic } from "../tabShareDiagnostics";

class Channel {
  static current: Channel;
  onmessage?: (event: { data: unknown }) => void;
  constructor() { Channel.current = this; }
  postMessage() {}
  close() {}
}
let control: LocalTabShareControl | undefined;
let capture: ReturnType<typeof vi.fn>;
let state: SharingState | undefined;
function startControl(allowed = true) {
  control = new LocalTabShareControl({} as Database, "staff-owner", () => allowed, s => { state = s; });
  Channel.current.onmessage?.({ data: { kind: "receiver", instance: "display-window", epoch: "reload-1", uid: "display-uid", owner: "staff-owner" } });
  return control;
}
beforeEach(() => {
  fixture.lease = { ownerId: "staff-owner", updatedAt: Date.now() };
  fixture.online = fixture.active = true;
  vi.clearAllMocks(); state = undefined;
  capture = vi.fn();
  vi.stubGlobal("BroadcastChannel", Channel);
  vi.stubGlobal("RTCPeerConnection", vi.fn());
  vi.stubGlobal("window", { isSecureContext: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { hasFocus: () => true });
  vi.stubGlobal("navigator", { userAgent: "Chrome/155.0", userActivation: { isActive: true }, mediaDevices: { getDisplayMedia: capture } });
});
afterEach(() => { control?.dispose(); control = undefined; vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("native capture boundary with an idle authorized Display", () => {
  it.each(["TypeError", "InvalidStateError", "NotReadableError"])("identifies %s at capture before any Firebase signaling", async name => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = name === "TypeError" ? new TypeError("private raw browser text") : new DOMException("private raw browser text", name);
    capture.mockRejectedValue(error);
    const pending = startControl().start();
    // The picker invocation remains synchronous with the therapist's click.
    expect(capture).toHaveBeenCalledTimes(1);
    await pending;
    expect(state?.error).toBe(captureFailureMessage(error));
    expect(log).toHaveBeenCalledWith("[youtube-sharing]", expect.objectContaining({ step: "capture", outcome: "rejected", code: name }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("private raw browser text");
    expect(fixture.get).not.toHaveBeenCalled(); expect(fixture.set).not.toHaveBeenCalled();
  });
  it.each(["NotAllowedError", "AbortError"])("keeps user cancellation (%s) idle and sends no signaling", async name => {
    capture.mockRejectedValue(new DOMException("cancelled", name));
    await startControl().start();
    expect(state?.phase).toBe("idle"); expect(state?.error).toBe("");
    expect(fixture.set).not.toHaveBeenCalled();
  });
  it("rejects fresh foreign ownership before capture", async () => {
    fixture.lease = { ownerId: "another-owner", updatedAt: Date.now() };
    await startControl().start();
    expect(capture).not.toHaveBeenCalled(); expect(state?.error).toContain("أخصائي آخر");
  });
  it("allows an expired lease to reach capture; subsequent ownership still requires server approval", async () => {
    fixture.lease = { ownerId: "another-owner", updatedAt: Date.now() - 46000 };
    capture.mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
    await startControl().start(); expect(capture).toHaveBeenCalledTimes(1);
  });
  it("rejects disconnected Control before capture", async () => {
    fixture.online = false;
    await startControl().start(); expect(capture).not.toHaveBeenCalled();
  });
  it("never logs diagnostics in production, including raw Firebase errors", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    shareDiagnostic("publish-offer", "rejected", { code: "PERMISSION_DENIED", message: "private details" });
    expect(log).not.toHaveBeenCalled();
  });
  it("distinguishes development signaling denial without logging raw Firebase details", () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    shareDiagnostic("publish-offer", "rejected", { code: "PERMISSION_DENIED", message: "private details" });
    expect(log).toHaveBeenCalledWith("[youtube-sharing]", { step: "publish-offer", outcome: "rejected", code: "permission-denied" });
  });
});
