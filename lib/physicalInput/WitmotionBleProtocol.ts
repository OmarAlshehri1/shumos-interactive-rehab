import type { MotionSample } from "./types";

export const WITMOTION_SERVICE_UUID = "0000ffe5-0000-1000-8000-00805f9a34fb";
export const WITMOTION_NOTIFY_UUID = "0000ffe4-0000-1000-8000-00805f9a34fb";
export const WITMOTION_WRITE_UUID = "0000ffe9-0000-1000-8000-00805f9a34fb";

const FRAME_HEADER = 0x55;
const REALTIME_FRAME = 0x61;
const REGISTER_FRAME = 0x71;
const FRAME_SIZE = 20;

export const WITMOTION_OUTPUT_RATE_CODES = {
  0.2: 0x01,
  0.5: 0x02,
  1: 0x03,
  2: 0x04,
  5: 0x05,
  10: 0x06,
  20: 0x07,
  50: 0x08,
  100: 0x09,
  200: 0x0b,
} as const;

export type WitmotionOutputRateHz = keyof typeof WITMOTION_OUTPUT_RATE_CODES;

/** Official WT901-family rate codes, including the two non-periodic modes. */
export const WITMOTION_RESTORABLE_RATE_CODES: readonly number[] = [
  ...Object.values(WITMOTION_OUTPUT_RATE_CODES),
  0x0c, // single return
  0x0d, // no periodic return
];

export function isWitmotionRestorableRateCode(code: number): boolean {
  return Number.isInteger(code) && WITMOTION_RESTORABLE_RATE_CODES.includes(code);
}

/**
 * Register 0x1F — the device's own internal low-pass filter bandwidth,
 * DISTINCT from the output-rate register 0x03 (see
 * tools/witmotion_ble/docs/official-output-rate-notes.md's "Bandwidth
 * register" addendum for the source and the safety caveat: this table comes
 * from WITMOTION's own published "WIT standard communication protocol" page
 * — the same family protocol the WT901BLECL's BLE 5.0 SDK is documented to
 * follow — but has NOT yet been bench-verified against a live WT901BLECL
 * (no hardware was used to research or prepare this; see that doc's "no
 * command was sent to a physical sensor" note). Prepared for tomorrow's
 * guarded comparison (WitmotionConfigTrial.ts) — never applied automatically.
 */
export const WITMOTION_BANDWIDTH_CODES = {
  5: 0x06,
  10: 0x05,
  20: 0x04,
  42: 0x03,
  98: 0x02,
  188: 0x01,
  256: 0x00,
} as const;

export type WitmotionBandwidthHz = keyof typeof WITMOTION_BANDWIDTH_CODES;

export const WITMOTION_RESTORABLE_BANDWIDTH_CODES: readonly number[] = Object.values(WITMOTION_BANDWIDTH_CODES);

export function isWitmotionRestorableBandwidthCode(code: number): boolean {
  return Number.isInteger(code) && WITMOTION_RESTORABLE_BANDWIDTH_CODES.includes(code);
}

/** Reverse lookup for "what Hz label is the device's CURRENT bandwidth code" — used to build a "keep current bandwidth" comparison candidate without guessing which of the 7 values that is. Null if the code isn't one of the documented seven (the caller should treat that the same as any other unrestorable-code refusal). */
export function witmotionBandwidthCodeToHz(code: number): WitmotionBandwidthHz | null {
  const match = (Object.entries(WITMOTION_BANDWIDTH_CODES) as [string, number][]).find(([, value]) => value === code);
  return match ? (Number(match[0]) as WitmotionBandwidthHz) : null;
}

export function witmotionReadRegisterCommand(address: number): Uint8Array {
  return Uint8Array.from([0xff, 0xaa, 0x27, address & 0xff, 0]);
}

export function witmotionWriteRegisterCommand(address: number, value: number): Uint8Array {
  return Uint8Array.from([0xff, 0xaa, address & 0xff, value & 0xff, (value >> 8) & 0xff]);
}

export const WITMOTION_UNLOCK_COMMAND = witmotionWriteRegisterCommand(0x69, 0xb588);
export const WITMOTION_SAVE_COMMAND = witmotionWriteRegisterCommand(0x00, 0x0000);

export interface WitmotionRegisterResponse {
  readonly address: number;
  readonly value: number;
}

export function parseWitmotionRegisterFrame(frame: Uint8Array): WitmotionRegisterResponse {
  if (frame.byteLength !== FRAME_SIZE || frame[0] !== FRAME_HEADER || frame[1] !== REGISTER_FRAME) {
    throw new Error("not a WITMOTION BLE 5.0 register frame");
  }
  return {
    address: frame[2],
    // Official BLE SDK places returned register words from byte 4 onward.
    value: new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint16(4, true),
  };
}

/** Exact TypeScript counterpart of tools/witmotion_ble/protocol.py. */
export function parseWitmotionRealtimeFrame(frame: Uint8Array, timestampMs: number): MotionSample {
  if (frame.byteLength !== FRAME_SIZE) {
    throw new Error(`expected ${FRAME_SIZE} bytes, received ${frame.byteLength}`);
  }
  if (frame[0] !== FRAME_HEADER || frame[1] !== REALTIME_FRAME) {
    throw new Error("not a WITMOTION BLE 5.0 real-time frame");
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const values = Array.from({ length: 9 }, (_, index) => view.getInt16(2 + index * 2, true));
  return {
    timestampMs,
    accelerationG: values.slice(0, 3).map((value) => (value / 32768) * 16) as unknown as readonly [number, number, number],
    gyroscopeDps: values.slice(3, 6).map((value) => (value / 32768) * 2000) as unknown as readonly [number, number, number],
    anglesDeg: values.slice(6, 9).map((value) => (value / 32768) * 180) as unknown as readonly [number, number, number],
  };
}

/** Reassembles official 20-byte frames when BLE notifications split or combine them. */
export class WitmotionFrameStream {
  private buffer: number[] = [];
  discardedBytes = 0;

  feed(chunk: Uint8Array): Uint8Array[] {
    this.buffer.push(...chunk);
    const frames: Uint8Array[] = [];

    while (true) {
      const headerIndex = this.buffer.indexOf(FRAME_HEADER);
      if (headerIndex < 0) {
        this.discardedBytes += this.buffer.length;
        this.buffer = [];
        break;
      }
      if (headerIndex > 0) {
        this.discardedBytes += headerIndex;
        this.buffer.splice(0, headerIndex);
      }
      if (this.buffer.length < 2) break;
      if (this.buffer[1] !== REALTIME_FRAME && this.buffer[1] !== REGISTER_FRAME) {
        this.discardedBytes += 1;
        this.buffer.shift();
        continue;
      }
      if (this.buffer.length < FRAME_SIZE) break;
      frames.push(Uint8Array.from(this.buffer.slice(0, FRAME_SIZE)));
      this.buffer.splice(0, FRAME_SIZE);
    }

    return frames;
  }
}
