import { describe, expect, it } from "vitest";
import { parseShare, parseShareMessage, validSdp } from "../tabShareModel";

const offer = "v=0\r\no=synthetic\r\n";
const share = { sessionId: "share-1", ownerId: "owner", controlTabId: "control", displayUid: "display", displayInstance: "window-1", createdAt: 1000, expiresAt: 31000, hidden: false, offer };
describe("bounded, session-bound local tab signaling", () => {
  it("accepts a bounded offer and matching answer/playback", () => {
    expect(parseShare(share)).toEqual(share);
    expect(parseShare({ ...share, answer: { sessionId: "share-1", sdp: offer }, playback: { sessionId: "share-1", state: "playing" } })).not.toBeNull();
  });
  it.each([null, {}, { ...share, sessionId: "../other" }, { ...share, offer: "audio payload" }, { ...share, offer: offer + "x".repeat(20000) }, { ...share, expiresAt: Infinity }, { ...share, expiresAt: 999 }, { ...share, hidden: "false" }, { ...share, answer: { sessionId: "stale", sdp: offer } }, { ...share, playback: { sessionId: "stale", state: "playing" } }])("rejects malformed or stale signaling %#", value => expect(parseShare(value)).toBeNull());
  it("rejects unrelated BroadcastChannel messages and invalid addressing", () => {
    for (const value of [null, { kind: "media", data: "frames" }, { kind: "connect", instance: "../x", sessionId: "share" }, { kind: "receiver", uid: "display" }]) expect(parseShareMessage(value)).toBeNull();
    expect(parseShareMessage({ kind: "connect", instance: "window-1", sessionId: "share-1" })).toEqual({ kind: "connect", instance: "window-1", sessionId: "share-1" });
    expect(validSdp("v=0\r\n")).toBe(true);
  });
});
