import type { ConnectionState, InputSourceKind, MotionSample } from "./types";

export type Unsubscribe = () => void;

/**
 * The one interface every physical input adapter implements - a real BLE
 * WT901BLECL, a simulated sensor, or (later) an adaptive button / gamepad /
 * steering wheel mapped into the same MotionSample shape. PhysicalInputManager
 * only ever talks to this interface, never to a concrete adapter's own BLE
 * or protocol details - "keep Bluetooth/protocol implementation isolated
 * from semantic game actions" from tonight's brief.
 *
 * Deliberately minimal: connect/disconnect lifecycle, a sample stream, and
 * a connection-state stream. No calibration, no semantics - those live in
 * SemanticDetector and PhysicalInputManager respectively, over whatever
 * MotionSamples a given InputSource happens to produce.
 */
export interface InputSource {
  readonly kind: InputSourceKind;
  /** Stable across reconnects of the SAME physical device; used for role-assignment persistence (see roleAssignment.ts). Never a hardcoded product-wide constant. */
  readonly deviceId: string;
  readonly connectionState: ConnectionState;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  onSample(handler: (sample: MotionSample) => void): Unsubscribe;
  onConnectionStateChange(handler: (state: ConnectionState) => void): Unsubscribe;
}
