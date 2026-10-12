import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Wt901BleInputSource, clearDeviceHint } from "../Wt901BleInputSource";
import { ConnectionState } from "../types";

/**
 * Mocks navigator.bluetooth entirely — no real hardware, no real browser
 * chooser — to verify the silent authorized-device reconnect path
 * (getDevices(), never requestDevice()) without needing a real Bluetooth
 * adapter. This vitest project runs in a plain Node environment (no
 * jsdom), so `navigator` is stubbed via vi.stubGlobal (Node itself now
 * ships a read-only global `navigator`, hence stubGlobal rather than plain
 * assignment) and `window.localStorage` via a small in-memory shim, rather
 * than pulling in a DOM test harness this codebase doesn't otherwise use.
 */

function fakeCharacteristic() {
  return {
    value: undefined,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    startNotifications: vi.fn().mockResolvedValue(undefined),
    stopNotifications: vi.fn().mockResolvedValue(undefined),
    writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeGattServer() {
  const notify = fakeCharacteristic();
  const write = fakeCharacteristic();
  const server = {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getPrimaryService: vi.fn().mockResolvedValue({
      getCharacteristic: vi.fn((uuid: string) => Promise.resolve(uuid.includes("ffe4") ? notify : write)),
    }),
  };
  server.connect.mockImplementation(async () => server);
  return server;
}

function fakeDevice(id: string, name = "WT901BLE68D5") {
  const gatt = fakeGattServer();
  return {
    id,
    name,
    gatt,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// The fake GATT server above only needs to hand back SOME object per characteristic lookup, matched
// loosely via "ffe4" appearing in the real NOTIFY uuid string (already true of the real constant).
vi.mock("../WitmotionBleProtocol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../WitmotionBleProtocol")>();
  return { ...actual, WITMOTION_NOTIFY_UUID: "0000ffe4-0000-1000-8000-00805f9b34fb" };
});

describe("Wt901BleInputSource — silent authorized-device reconnect", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports supportsAuthorizedReconnect only when the browser implements getDevices()", () => {
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn() } });
    expect(new Wt901BleInputSource().supportsAuthorizedReconnect).toBe(false);

    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn() } });
    expect(new Wt901BleInputSource().supportsAuthorizedReconnect).toBe(true);
  });

  it("never shows the chooser: connects straight from getDevices() when exactly one authorized WT901BLE device exists", async () => {
    const device = fakeDevice("device-1");
    const requestDevice = vi.fn();
    vi.stubGlobal("navigator", { bluetooth: { requestDevice, getDevices: vi.fn().mockResolvedValue([device]) } });

    const source = new Wt901BleInputSource();
    const reconnected = await source.tryReconnectAuthorizedDevice();

    expect(reconnected).toBe(true);
    expect(requestDevice).not.toHaveBeenCalled();
    expect(source.connectionState).toBe(ConnectionState.CONNECTED);
  });

  it("returns false (not an error) when getDevices() is unsupported", async () => {
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn() } });
    const source = new Wt901BleInputSource();
    await expect(source.tryReconnectAuthorizedDevice()).resolves.toBe(false);
    expect(source.connectionState).toBe(ConnectionState.DISCONNECTED);
  });

  it("returns false when no authorized device matches the WT901BLE name prefix", async () => {
    const unrelated = fakeDevice("device-2", "SomeOtherSensor");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([unrelated]) } });
    const source = new Wt901BleInputSource();
    expect(await source.tryReconnectAuthorizedDevice()).toBe(false);
  });

  it("prefers the device id previously confirmed as RIGHT_HAND when getDevices() returns more than one match", async () => {
    const first = fakeDevice("device-first");
    const preferred = fakeDevice("device-preferred");
    storage.set("shumos:sensor:right-hand:deviceId", "device-preferred");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([first, preferred]) } });

    const source = new Wt901BleInputSource();
    await source.tryReconnectAuthorizedDevice();

    expect(preferred.gatt.connect).toHaveBeenCalled();
    expect(first.gatt.connect).not.toHaveBeenCalled();
  });

  it("does not attempt a silent reconnect while already connected or connecting", async () => {
    const device = fakeDevice("device-3");
    const getDevices = vi.fn().mockResolvedValue([device]);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices } });

    const source = new Wt901BleInputSource();
    await source.tryReconnectAuthorizedDevice();
    expect(source.connectionState).toBe(ConnectionState.CONNECTED);

    getDevices.mockClear();
    expect(await source.tryReconnectAuthorizedDevice()).toBe(false);
    expect(getDevices).not.toHaveBeenCalled();
  });

  it("records the connected device id as the RIGHT_HAND hint for next time, without hardcoding any device identity in source", async () => {
    const device = fakeDevice("device-learned");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([device]) } });
    const source = new Wt901BleInputSource();
    await source.tryReconnectAuthorizedDevice();

    expect(storage.get("shumos:sensor:right-hand:deviceId")).toBe("device-learned");
  });
});

describe("Wt901BleInputSource — dual-sensor role isolation", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists its learned device under an independent, caller-supplied hint key (never the shared RIGHT_HAND key)", async () => {
    const device = fakeDevice("left-device");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([device]) } });
    const source = new Wt901BleInputSource("shumos:sensor:left-hand:deviceId");
    await source.tryReconnectAuthorizedDevice();

    expect(storage.get("shumos:sensor:left-hand:deviceId")).toBe("left-device");
    expect(storage.has("shumos:sensor:right-hand:deviceId")).toBe(false);
  });

  it("excludes device ids another role already owns from silent authorized reconnect", async () => {
    const alreadyRightHand = fakeDevice("device-right");
    const genuinelyLeft = fakeDevice("device-left");
    vi.stubGlobal("navigator", {
      bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([alreadyRightHand, genuinelyLeft]) },
    });
    const source = new Wt901BleInputSource("shumos:sensor:left-hand:deviceId");
    const reconnected = await source.tryReconnectAuthorizedDevice({ excludeDeviceIds: ["device-right"] });

    expect(reconnected).toBe(true);
    expect(genuinelyLeft.gatt.connect).toHaveBeenCalled();
    expect(alreadyRightHand.gatt.connect).not.toHaveBeenCalled();
  });

  it("returns false rather than connecting when every candidate is excluded", async () => {
    const onlyDevice = fakeDevice("device-right");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([onlyDevice]) } });
    const source = new Wt901BleInputSource("shumos:sensor:left-hand:deviceId");
    expect(await source.tryReconnectAuthorizedDevice({ excludeDeviceIds: ["device-right"] })).toBe(false);
  });

  it("refuses the manual chooser flow when the picked device is already excluded (in use by another role)", async () => {
    const device = fakeDevice("device-right");
    const requestDevice = vi.fn().mockResolvedValue(device);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice, getDevices: vi.fn() } });
    const source = new Wt901BleInputSource("shumos:sensor:left-hand:deviceId");

    await expect(source.connect({ excludeDeviceIds: ["device-right"] })).rejects.toThrow("WT901BLECL_DEVICE_ALREADY_IN_USE");
    expect(device.gatt.connect).not.toHaveBeenCalled();
  });

  it("clearDeviceHint forgets a role's learned device, so the next silent reconnect no longer prefers it", async () => {
    storage.set("shumos:sensor:left-hand:deviceId", "old-left-device");
    clearDeviceHint("shumos:sensor:left-hand:deviceId");
    expect(storage.has("shumos:sensor:left-hand:deviceId")).toBe(false);

    const first = fakeDevice("device-first");
    const oldPreferred = fakeDevice("old-left-device");
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([first, oldPreferred]) } });
    const source = new Wt901BleInputSource("shumos:sensor:left-hand:deviceId");
    await source.tryReconnectAuthorizedDevice();

    expect(first.gatt.connect).toHaveBeenCalled(); // no hint left, so first candidate wins - not the forgotten device
    expect(oldPreferred.gatt.connect).not.toHaveBeenCalled();
  });
});
