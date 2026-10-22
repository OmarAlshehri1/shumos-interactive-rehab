import { expect, it } from "vitest";
import { audioRequestState } from "../audioRequest";
import type { PresenceRecord } from "@/lib/realtime/types";
const request = { id: "new", at: 1000 };
const presence: PresenceRecord = { connected: true, updatedAt: 1000, audioStatus: { state: "ready", contextState: "running", commandId: "new", updatedAt: 1000 } };
it("requires the actual matching Display running acknowledgement, not a successful write or older acknowledgement", () => {
  expect(audioRequestState(null, request, true, 1000)).toBe("pending");
  expect(audioRequestState({ ...presence, audioStatus: { ...presence.audioStatus!, commandId: "old" } }, request, true, 1100)).toBe("pending");
  expect(audioRequestState(presence, request, true, 1100)).toBe("ready");
});
it("ends pending on timeout, failed send, blocked acknowledgement or disconnected stale status", () => {
  expect(audioRequestState(null, request, true, 9000)).toBe("failed");
  expect(audioRequestState(null, { ...request, failed: true }, true, 1000)).toBe("failed");
  expect(audioRequestState({ ...presence, audioStatus: { ...presence.audioStatus!, state: "blocked", contextState: "suspended" } }, request, true, 1000)).toBe("blocked");
  expect(audioRequestState(presence, request, false, 9000)).toBe("failed");
  expect(audioRequestState(presence, null, true, 50000)).toBe("not-ready");
});
