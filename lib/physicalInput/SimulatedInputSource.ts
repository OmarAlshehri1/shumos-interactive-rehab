import type { InputSource, Unsubscribe } from "./InputSource";
import { ConnectionState, InputSourceKind, type MotionSample } from "./types";

/**
 * A scripted InputSource for tests and offline development - the TS-side
 * counterpart of tools/witmotion_ble/simulation.py's SimulatedSensor,
 * following the same connect/stream/disconnect shape a real WT901BLECL BLE
 * adapter will need. `play()` pushes a pre-built sample array through at a
 * given interval (or synchronously via `pushAll()` for deterministic unit
 * tests that should not depend on real timers).
 */
export class SimulatedInputSource implements InputSource {
  readonly kind = InputSourceKind.SIMULATED;
  readonly deviceId: string;

  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private readonly sampleListeners = new Set<(sample: MotionSample) => void>();
  private readonly stateListeners = new Set<(state: ConnectionState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.setState(ConnectionState.CONNECTING);
    this.setState(ConnectionState.CONNECTED);
  }

  async disconnect(): Promise<void> {
    this.stopPlaying();
    this.setState(ConnectionState.DISCONNECTED);
  }

  /** Test-only escape hatch simulating a BLE drop mid-stream, independent of any caller-issued disconnect(). */
  simulateUnexpectedDrop(): void {
    this.stopPlaying();
    this.setState(ConnectionState.DISCONNECTED);
  }

  onSample(handler: (sample: MotionSample) => void): Unsubscribe {
    this.sampleListeners.add(handler);
    return () => this.sampleListeners.delete(handler);
  }

  onConnectionStateChange(handler: (state: ConnectionState) => void): Unsubscribe {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  /** Delivers every sample synchronously, in order - for deterministic tests with no fake timers required. */
  pushAll(samples: readonly MotionSample[]): void {
    for (const sample of samples) this.pushOne(sample);
  }

  pushOne(sample: MotionSample): void {
    if (this.state !== ConnectionState.CONNECTED) return; // disconnected sources never emit - see PhysicalInputManager's disconnect-safety tests
    for (const listener of this.sampleListeners) listener(sample);
  }

  /** Delivers samples on a real interval - for manual/dev-server use, not for unit tests (prefer pushAll). */
  play(samples: readonly MotionSample[], intervalMs: number): void {
    this.stopPlaying();
    let index = 0;
    this.timer = setInterval(() => {
      if (index >= samples.length) {
        this.stopPlaying();
        return;
      }
      this.pushOne(samples[index]);
      index += 1;
    }, intervalMs);
  }

  private stopPlaying(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}
