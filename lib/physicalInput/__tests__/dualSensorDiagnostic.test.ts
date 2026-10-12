import { describe, expect, it } from 'vitest';
import { dualStreamStatus, type DiagnosticStream } from '../dualSensorDiagnostic';

const stream = (deviceId: string, timestampMs = 900): DiagnosticStream => ({ connected: true, deviceId, sample: { timestampMs, anglesDeg: [0,0,0], gyroscopeDps: [0,0,0], accelerationG: [0,0,1] } });
describe('dual hardware diagnostic freshness and identity', () => {
  it('reports simultaneous streams only for two distinct connected devices with current readings', () => {
    expect(dualStreamStatus(stream('right'), stream('left'), 1000).simultaneous).toBe(true);
    const duplicate = dualStreamStatus(stream('same'), stream('same'), 1000);
    expect(duplicate.duplicate).toBe(true); expect(duplicate.simultaneous).toBe(false);
  });
  it('detects a stale, missing, disconnected or future-dated left stream while preserving right freshness', () => {
    for (const left of [stream('left',0),stream('left',2100),{...stream('left'),connected:false},{...stream('left'),sample:null},{...stream('left'),deviceId:null}]) {
      const status = dualStreamStatus(stream('right',1900),left,2000);
      expect(status.rightFresh).toBe(true);expect(status.leftFresh).toBe(false);expect(status.simultaneous).toBe(false);
    }
  });
});
