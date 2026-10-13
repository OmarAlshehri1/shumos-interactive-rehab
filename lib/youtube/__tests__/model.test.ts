import { describe, it, expect } from "vitest";
import {
  parseCommand,
  validVideo,
  newerCommand,
  commandFresh,
  recoveredPosition,
  type VideoCommand,
} from "../model";
const c: VideoCommand = {
  sessionId: "s",
  commandId: "c",
  ownerId: "staff",
  controlTabId: "tab",
  revision: 1,
  videoId: "M7lc1UVf-VE",
  state: "playing",
  position: 20,
  volume: 60,
  muted: false,
  issuedAt: 100000,
  heartbeatAt: 100000,
};
describe("YouTube command and metadata boundary", () => {
  it("accepts only bounded IDs and metadata, never arbitrary URLs or HTML", () => {
    expect(
      validVideo({ videoId: c.videoId, title: "أنشودة", channel: "Channel" }),
    ).toBe(true);
    for (const v of [
      { videoId: "https://evil.test" },
      { videoId: c.videoId, title: "<script>" },
      { videoId: c.videoId, title: "x".repeat(201) },
    ])
      expect(validVideo({ ...v, channel: "channel" })).toBe(false);
  });
  it("rejects malformed, unbounded and nonfinite commands", () => {
    expect(parseCommand(c)).toEqual(c);
    for (const patch of [
      { videoId: "url" },
      { position: -1 },
      { volume: 101 },
      { position: NaN },
      { revision: 1.5 },
      { muted: "false" },
      { state: "execute" },
      { controlTabId: "" },
    ])
      expect(parseCommand({ ...c, ...patch })).toBeNull();
  });
  it("does not apply duplicate or out-of-order actions", () => {
    expect(newerCommand(c, c)).toBe(false);
    expect(newerCommand({ ...c, revision: 0 }, c)).toBe(false);
    expect(newerCommand({ ...c, revision: 2 }, c)).toBe(true);
    expect(newerCommand({ ...c, sessionId: "old", issuedAt: 99999 }, c)).toBe(
      false,
    );
  });
  it("short reconnect recovers desired state; long interruption fails closed", () => {
    expect(commandFresh(c, 110000)).toBe(true);
    expect(commandFresh(c, 115000)).toBe(false);
    expect(commandFresh({ ...c, heartbeatAt: 200000 }, 100000)).toBe(false);
    expect(recoveredPosition(c, 110000)).toBe(30);
    expect(recoveredPosition({ ...c, state: "paused" }, 110000)).toBe(20);
  });
});
