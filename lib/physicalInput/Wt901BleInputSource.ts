import type { InputSource, Unsubscribe } from "./InputSource";
import { ConnectionState, InputSourceKind, type MotionSample } from "./types";
import {
  parseWitmotionRealtimeFrame,
  parseWitmotionRegisterFrame,
  isWitmotionRestorableRateCode,
  isWitmotionRestorableBandwidthCode,
  WITMOTION_OUTPUT_RATE_CODES,
  WITMOTION_BANDWIDTH_CODES,
  WITMOTION_NOTIFY_UUID,
  WITMOTION_SERVICE_UUID,
  WITMOTION_UNLOCK_COMMAND,
  WITMOTION_WRITE_UUID,
  witmotionReadRegisterCommand,
  witmotionWriteRegisterCommand,
  type WitmotionOutputRateHz,
  type WitmotionBandwidthHz,
  WitmotionFrameStream,
} from "./WitmotionBleProtocol";

interface BluetoothCharacteristicLike extends EventTarget {
  readonly value?: DataView;
  startNotifications(): Promise<BluetoothCharacteristicLike>;
  stopNotifications(): Promise<BluetoothCharacteristicLike>;
  writeValue?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}

interface BluetoothServiceLike {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>;
}

interface BluetoothServerLike {
  readonly connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothServiceLike>;
}

interface BluetoothDeviceLike extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothServerLike;
}

interface BluetoothApiLike {
  requestDevice(options: {
    filters: readonly ({ namePrefix: string } | { services: readonly string[] })[];
    optionalServices: readonly string[];
  }): Promise<BluetoothDeviceLike>;
  /**
   * Chrome's "persistent device permissions" extension to Web Bluetooth —
   * not in lib.dom.d.ts (still experimental), hence the local shim. Lists
   * devices this ORIGIN already holds a standing permission grant for
   * (from a past requestDevice() chooser pick), without showing the
   * chooser again. Absent entirely on browsers that don't implement it
   * (e.g. current Safari) — always feature-detected, never assumed.
   */
  getDevices?(): Promise<readonly BluetoothDeviceLike[]>;
}

function bluetoothApi(): BluetoothApiLike | null {
  return ((navigator as Navigator & { bluetooth?: BluetoothApiLike }).bluetooth ?? null);
}

const WT901_NAME_PREFIX = "WT901BLE";

/**
 * localStorage key: which previously-authorized device id (if any) was last
 * confirmed for THIS instance's role — see connectToAuthorizedDevice's doc
 * comment for why this is a learned hint, never a hardcoded device identity.
 * Defaults to the exact key RIGHT_HAND has always used (frozen — see
 * tonight's RIGHT_HAND baseline doc), so every existing call site
 * (`new Wt901BleInputSource()`) keeps resolving the same previously-learned
 * device with zero behavior change. A second instance for LEFT_HAND passes
 * its own independent key (see SensorHandRuntimeConfig.ts) so the two roles
 * never contend over — or silently overwrite — the same hint.
 */
const RIGHT_HAND_DEVICE_HINT_KEY = "shumos:sensor:right-hand:deviceId";

function readDeviceHint(hintKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(hintKey);
  } catch {
    return null;
  }
}

function writeDeviceHint(hintKey: string, deviceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hintKey, deviceId);
  } catch {
    // Best-effort only — a failed write just means the next load falls back to picking the first authorized match.
  }
}

/**
 * Explicit therapist "استبدال" (replace sensor) action's second half — see
 * roleAssignment.ts's clearRoleAssignment() for the persisted-role half.
 * Forgets which physical device this role's hint key currently prefers, so
 * the NEXT connect (silent or manual) picks fresh rather than re-preferring
 * the just-replaced sensor.
 */
export function clearDeviceHint(hintKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(hintKey);
  } catch {
    // Best-effort only.
  }
}

function nowMs(): number {
  return performance.now();
}

/** Browser BLE adapter using the same official FFE5/FFE4 protocol as the proven macOS Bleak tools. */
export class Wt901BleInputSource implements InputSource {
  readonly kind = InputSourceKind.WT901BLECL_BLE;

  private state = ConnectionState.DISCONNECTED;
  private device: BluetoothDeviceLike | null = null;
  private characteristic: BluetoothCharacteristicLike | null = null;
  private writeCharacteristic: BluetoothCharacteristicLike | null = null;
  private frameStream = new WitmotionFrameStream();
  private readonly sampleListeners = new Set<(sample: MotionSample) => void>();
  private readonly stateListeners = new Set<(state: ConnectionState) => void>();
  private readonly pendingRegisterReads = new Map<number, { resolve: (value: number) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly deviceHintKey: string;

  /**
   * `deviceHintKey` defaults to RIGHT_HAND's own long-standing key so every
   * existing call site is unaffected (see that constant's doc comment). A
   * second, independently-configured instance (LEFT_HAND) passes its own
   * key so the two never share or clobber one another's learned device.
   */
  constructor(deviceHintKey: string = RIGHT_HAND_DEVICE_HINT_KEY) {
    this.deviceHintKey = deviceHintKey;
  }

  get deviceId(): string {
    return this.device?.id ?? "unselected-wt901ble";
  }

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get isSupported(): boolean {
    return bluetoothApi() !== null;
  }

  /** Whether this browser implements the persistent-permission getDevices() extension at all — feature-detection only, never a guess about whether a device is actually authorized yet. */
  get supportsAuthorizedReconnect(): boolean {
    return typeof bluetoothApi()?.getDevices === "function";
  }

  /**
   * `excludeDeviceIds` (see tryReconnectAuthorizedDevice's doc comment) also
   * guards the manual chooser path: a therapist COULD physically pick the
   * same sensor already serving another role in the OS-level Web Bluetooth
   * chooser (nothing in that browser UI knows about our roles) — this is
   * the point that refuses it anyway, immediately, before ever touching
   * GATT, throwing WT901BLECL_DEVICE_ALREADY_IN_USE rather than silently
   * letting one physical sensor serve two roles at once.
   */
  async connect(options: { excludeDeviceIds?: readonly string[] } = {}): Promise<void> {
    const bluetooth = bluetoothApi();
    if (!bluetooth) {
      this.setState(ConnectionState.ERROR);
      throw new Error("WEB_BLUETOOTH_UNAVAILABLE");
    }

    this.setState(ConnectionState.CONNECTING);
    try {
      if (!this.device) {
        const chosen = await bluetooth.requestDevice({
          filters: [{ namePrefix: WT901_NAME_PREFIX }, { services: [WITMOTION_SERVICE_UUID] }],
          optionalServices: [WITMOTION_SERVICE_UUID],
        });
        if (options.excludeDeviceIds?.includes(chosen.id)) {
          throw new Error("WT901BLECL_DEVICE_ALREADY_IN_USE");
        }
        this.device = chosen;
        this.device.addEventListener("gattserverdisconnected", this.handleDisconnected);
      }
      await this.connectToResolvedDevice();
    } catch (error) {
      await this.cleanupCharacteristic();
      const cancelled = error instanceof DOMException && error.name === "NotFoundError";
      this.setState(cancelled ? ConnectionState.DISCONNECTED : ConnectionState.ERROR);
      throw error;
    }
  }

  /**
   * Silent reconnect using Chrome's persistent-permission getDevices() —
   * never shows the chooser, never prompts for anything. Returns false
   * (not an error) whenever this path genuinely isn't available: the
   * browser doesn't implement getDevices(), no previously-authorized
   * WT901BLE device is on this origin's permission list, or the physical
   * sensor isn't reachable right now (powered off, out of range) — all of
   * those are ordinary, expected outcomes a caller should fall back to
   * showing the manual "ربط حساس اليد اليمنى" button for, not exceptions.
   *
   * Preference order when more than one authorized WT901BLE device exists:
   * the id last confirmed for this instance's own role (see writeDeviceHint,
   * set only after a REAL successful connect — never assumed from
   * requestDevice() alone), else the first non-excluded match. This is a
   * learned runtime hint, not a hardcoded device identity — see
   * RIGHT_HAND_DEVICE_HINT_KEY's doc comment.
   *
   * `excludeDeviceIds` lets a dual-sensor caller (see SensorRuntimeProvider)
   * keep this instance from silently latching onto a device id another
   * role's instance already owns/is connected to — the BLE-layer half of
   * "never assign the same physical sensor to two roles" (see
   * roleAssignment.ts's own assignRole() refusal for the persisted-role
   * half of that guarantee).
   */
  async tryReconnectAuthorizedDevice(options: { excludeDeviceIds?: readonly string[] } = {}): Promise<boolean> {
    const bluetooth = bluetoothApi();
    if (!bluetooth?.getDevices) return false;
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) return false;

    let candidates: readonly BluetoothDeviceLike[];
    try {
      candidates = await bluetooth.getDevices();
    } catch {
      return false;
    }
    const excluded = new Set(options.excludeDeviceIds ?? []);
    const wt901Candidates = candidates.filter(
      (candidate) => candidate.name?.startsWith(WT901_NAME_PREFIX) && !excluded.has(candidate.id),
    );
    if (wt901Candidates.length === 0) return false;
    const hint = readDeviceHint(this.deviceHintKey);
    const chosen = wt901Candidates.find((candidate) => candidate.id === hint) ?? wt901Candidates[0];

    this.setState(ConnectionState.CONNECTING);
    try {
      if (this.device !== chosen) {
        this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnected);
        this.device = chosen;
        this.device.addEventListener("gattserverdisconnected", this.handleDisconnected);
      }
      await this.connectToResolvedDevice();
      return true;
    } catch (error) {
      await this.cleanupCharacteristic();
      this.setState(ConnectionState.DISCONNECTED);
      console.warn("[Wt901BleInputSource] Silent authorized-device reconnect failed (sensor likely off/out of range):", error);
      return false;
    }
  }

  /** Shared tail of connect() and tryReconnectAuthorizedDevice() once `this.device` is resolved (from the chooser or from getDevices()) — GATT connect, service/characteristic lookup, notifications, state transition. */
  private async connectToResolvedDevice(): Promise<void> {
    const device = this.device;
    if (!device?.gatt) throw new Error("WT901BLECL_GATT_UNAVAILABLE");

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(WITMOTION_SERVICE_UUID);
    this.characteristic = await service.getCharacteristic(WITMOTION_NOTIFY_UUID);
    this.writeCharacteristic = await service.getCharacteristic(WITMOTION_WRITE_UUID);
    this.frameStream = new WitmotionFrameStream();
    this.characteristic.addEventListener("characteristicvaluechanged", this.handleNotification);
    await this.characteristic.startNotifications();
    this.setState(ConnectionState.CONNECTED);
    writeDeviceHint(this.deviceHintKey, device.id);
  }

  async disconnect(): Promise<void> {
    await this.cleanupCharacteristic();
    this.rejectPendingRegisterReads("WT901BLECL_DISCONNECTED");
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
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

  async readOutputRateCode(): Promise<number> {
    return this.readRegister(0x03);
  }

  /** Applies a documented rate temporarily; this intentionally does not persist to sensor flash. */
  async setTemporaryOutputRate(rateHz: 20 | 50 | WitmotionOutputRateHz): Promise<void> {
    const code = WITMOTION_OUTPUT_RATE_CODES[rateHz];
    if (code === undefined) throw new Error(`UNSUPPORTED_WITMOTION_RATE:${rateHz}`);
    await this.writeBytes(WITMOTION_UNLOCK_COMMAND);
    await delay(120);
    await this.writeBytes(witmotionWriteRegisterCommand(0x03, code));
    await delay(120);
  }

  async restoreOutputRateCode(code: number): Promise<void> {
    if (!isWitmotionRestorableRateCode(code)) {
      throw new Error(`REFUSING_UNKNOWN_WITMOTION_RATE_CODE:${code}`);
    }
    await this.writeBytes(WITMOTION_UNLOCK_COMMAND);
    await delay(120);
    await this.writeBytes(witmotionWriteRegisterCommand(0x03, code));
    await delay(120);
  }

  /**
   * Register 0x1F — internal filter bandwidth, distinct from the output-rate
   * register 0x03 (see WitmotionBleProtocol.ts's WITMOTION_BANDWIDTH_CODES
   * doc comment for the source and its "not yet bench-verified" caveat).
   * Mirrors the output-rate methods above exactly, including never
   * persisting to flash (no save command) and requiring the same
   * read-before-write safety check on restore.
   */
  async readBandwidthCode(): Promise<number> {
    return this.readRegister(0x1f);
  }

  async setTemporaryBandwidth(bandwidthHz: WitmotionBandwidthHz): Promise<void> {
    const code = WITMOTION_BANDWIDTH_CODES[bandwidthHz];
    if (code === undefined) throw new Error(`UNSUPPORTED_WITMOTION_BANDWIDTH:${bandwidthHz}`);
    await this.writeBytes(WITMOTION_UNLOCK_COMMAND);
    await delay(120);
    await this.writeBytes(witmotionWriteRegisterCommand(0x1f, code));
    await delay(120);
  }

  async restoreBandwidthCode(code: number): Promise<void> {
    if (!isWitmotionRestorableBandwidthCode(code)) {
      throw new Error(`REFUSING_UNKNOWN_WITMOTION_BANDWIDTH_CODE:${code}`);
    }
    await this.writeBytes(WITMOTION_UNLOCK_COMMAND);
    await delay(120);
    await this.writeBytes(witmotionWriteRegisterCommand(0x1f, code));
    await delay(120);
  }

  private readonly handleNotification = (event: Event): void => {
    const value = (event.target as BluetoothCharacteristicLike | null)?.value;
    if (!value || this.state !== ConnectionState.CONNECTED) return;
    const chunk = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const notificationAtMs = nowMs();
    const parsingStartedAtMs = nowMs();
    for (const frame of this.frameStream.feed(chunk)) {
      if (frame[1] === 0x71) {
        const response = parseWitmotionRegisterFrame(frame);
        const pending = this.pendingRegisterReads.get(response.address);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRegisterReads.delete(response.address);
          pending.resolve(response.value);
        }
        continue;
      }
      if (frame[1] !== 0x61) continue;
      const sample = {
        ...parseWitmotionRealtimeFrame(frame, notificationAtMs),
        pipelineTiming: {
          bleNotificationAtMs: notificationAtMs,
          parsingStartedAtMs,
          parsedAtMs: nowMs(),
        },
      };
      for (const listener of this.sampleListeners) listener(sample);
    }
  };

  private readonly handleDisconnected = (): void => {
    this.characteristic?.removeEventListener("characteristicvaluechanged", this.handleNotification);
    this.characteristic = null;
    this.writeCharacteristic = null;
    this.rejectPendingRegisterReads("WT901BLECL_DISCONNECTED");
    this.setState(ConnectionState.DISCONNECTED);
  };

  private async cleanupCharacteristic(): Promise<void> {
    if (!this.characteristic) return;
    this.characteristic.removeEventListener("characteristicvaluechanged", this.handleNotification);
    try {
      await this.characteristic.stopNotifications();
    } catch {
      // The characteristic is commonly already gone after a physical drop.
    }
    this.characteristic = null;
    this.writeCharacteristic = null;
  }

  private async readRegister(address: number): Promise<number> {
    if (this.state !== ConnectionState.CONNECTED) throw new Error("WT901BLECL_NOT_CONNECTED");
    if (this.pendingRegisterReads.has(address)) throw new Error(`WT901BLECL_REGISTER_READ_ALREADY_PENDING:${address}`);
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRegisterReads.delete(address);
        reject(new Error(`WT901BLECL_REGISTER_READ_TIMEOUT:${address}`));
      }, 1200);
      this.pendingRegisterReads.set(address, { resolve, reject, timer });
      void this.writeBytes(witmotionReadRegisterCommand(address)).catch((error: unknown) => {
        clearTimeout(timer);
        this.pendingRegisterReads.delete(address);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async writeBytes(bytes: Uint8Array): Promise<void> {
    const characteristic = this.writeCharacteristic;
    if (!characteristic || this.state !== ConnectionState.CONNECTED) throw new Error("WT901BLECL_WRITE_UNAVAILABLE");
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(Uint8Array.from(bytes).buffer);
      return;
    }
    if (characteristic.writeValue) {
      await characteristic.writeValue(Uint8Array.from(bytes).buffer);
      return;
    }
    throw new Error("WT901BLECL_WRITE_UNSUPPORTED");
  }

  private rejectPendingRegisterReads(message: string): void {
    for (const pending of this.pendingRegisterReads.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pendingRegisterReads.clear();
  }

  private setState(state: ConnectionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
