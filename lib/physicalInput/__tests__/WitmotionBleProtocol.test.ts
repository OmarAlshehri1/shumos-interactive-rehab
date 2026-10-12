import { describe, expect, it } from "vitest";
import {
  parseWitmotionRealtimeFrame,
  parseWitmotionRegisterFrame,
  WITMOTION_SAVE_COMMAND,
  WITMOTION_UNLOCK_COMMAND,
  WITMOTION_OUTPUT_RATE_CODES,
  witmotionReadRegisterCommand,
  witmotionWriteRegisterCommand,
  WitmotionFrameStream,
} from "../WitmotionBleProtocol";

function frame(values: readonly number[], type = 0x61): Uint8Array {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x55;
  bytes[1] = type;
  values.forEach((value, index) => view.setInt16(2 + index * 2, value, true));
  return bytes;
}

describe("WITMOTION BLE 5.0 protocol", () => {
  it("parses the same nine signed little-endian values and scales as the proven Python parser", () => {
    const parsed = parseWitmotionRealtimeFrame(
      frame([16384, -8192, 2048, 16384, -8192, 4096, 16384, -8192, 4096]),
      123,
    );

    expect(parsed.timestampMs).toBe(123);
    expect(parsed.accelerationG).toEqual([8, -4, 1]);
    expect(parsed.gyroscopeDps).toEqual([1000, -500, 250]);
    expect(parsed.anglesDeg).toEqual([90, -45, 22.5]);
  });

  it("reassembles split notifications and discards noise before a valid frame", () => {
    const parser = new WitmotionFrameStream();
    const complete = frame([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(parser.feed(Uint8Array.from([9, 8, 7, ...complete.slice(0, 7)]))).toEqual([]);
    const frames = parser.feed(complete.slice(7));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(complete);
    expect(parser.discardedBytes).toBe(3);
  });

  it("rejects non-realtime frames at the telemetry parser boundary", () => {
    expect(() => parseWitmotionRealtimeFrame(frame(new Array(9).fill(0), 0x71), 0)).toThrow(
      "not a WITMOTION BLE 5.0 real-time frame",
    );
  });

  it("builds the official read, unlock, rate-write, and save packets", () => {
    expect([...witmotionReadRegisterCommand(0x03)]).toEqual([0xff, 0xaa, 0x27, 0x03, 0x00]);
    expect([...WITMOTION_UNLOCK_COMMAND]).toEqual([0xff, 0xaa, 0x69, 0x88, 0xb5]);
    expect([...witmotionWriteRegisterCommand(0x03, 0x08)]).toEqual([0xff, 0xaa, 0x03, 0x08, 0x00]);
    expect([...WITMOTION_SAVE_COMMAND]).toEqual([0xff, 0xaa, 0x00, 0x00, 0x00]);
    expect(WITMOTION_OUTPUT_RATE_CODES[200]).toBe(0x0b);
  });

  it("parses a returned register word from an official 0x71 frame", () => {
    const response = new Uint8Array(20);
    response.set([0x55, 0x71, 0x03, 0x00, 0x08, 0x00]);
    expect(parseWitmotionRegisterFrame(response)).toEqual({ address: 0x03, value: 0x08 });
  });
});
