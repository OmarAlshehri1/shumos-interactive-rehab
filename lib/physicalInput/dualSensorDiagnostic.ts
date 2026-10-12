import type { MotionSample } from './types';

export interface DiagnosticStream {
  connected: boolean;
  deviceId: string | null;
  sample: MotionSample | null;
}

/** Read-only telemetry check, using the same monotonic clock as BLE samples. */
export function dualStreamStatus(right: DiagnosticStream, left: DiagnosticStream, now: number) {
  const age = (stream: DiagnosticStream) => stream.sample ? now - stream.sample.timestampMs : null;
  const fresh = (stream: DiagnosticStream) => {
    const elapsed = age(stream);
    return stream.connected && !!stream.deviceId && elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 1000;
  };
  const duplicate = !!right.deviceId && right.deviceId === left.deviceId;
  return { duplicate, rightFresh: fresh(right), leftFresh: fresh(left), rightAgeMs: age(right), leftAgeMs: age(left), simultaneous: !duplicate && fresh(right) && fresh(left) };
}
