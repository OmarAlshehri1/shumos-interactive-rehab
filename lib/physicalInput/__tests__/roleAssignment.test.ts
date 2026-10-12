import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryRoleAssignmentStore, LocalStorageRoleAssignmentStore, assignRole, clearRoleAssignment, resolveRole } from "../roleAssignment";
import { PhysicalRole } from "../types";

describe("roleAssignment", () => {
  it("assigns a newly discovered device id to a role with no hardcoded identifiers", () => {
    const store = new InMemoryRoleAssignmentStore();
    const conflict = assignRole(store, "sensor-1-discovered-address", PhysicalRole.RIGHT_HAND);
    expect(conflict).toBeNull();
    expect(resolveRole(store, "sensor-1-discovered-address")).toBe(PhysicalRole.RIGHT_HAND);
  });

  it("assigns a second, independently discovered device to LEFT_HAND", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    const conflict = assignRole(store, "sensor-2", PhysicalRole.LEFT_HAND);
    expect(conflict).toBeNull();
    expect(resolveRole(store, "sensor-1")).toBe(PhysicalRole.RIGHT_HAND);
    expect(resolveRole(store, "sensor-2")).toBe(PhysicalRole.LEFT_HAND);
  });

  it("refuses to silently displace an existing role owner", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    const conflict = assignRole(store, "sensor-2", PhysicalRole.RIGHT_HAND);
    expect(conflict).toEqual({ requestedRole: PhysicalRole.RIGHT_HAND, currentOwnerDeviceId: "sensor-1" });
    expect(resolveRole(store, "sensor-2")).toBeNull();
  });

  it("allows reassignment after the previous owner is explicitly cleared", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    store.clear("sensor-1");
    const conflict = assignRole(store, "sensor-2", PhysicalRole.RIGHT_HAND);
    expect(conflict).toBeNull();
    expect(resolveRole(store, "sensor-2")).toBe(PhysicalRole.RIGHT_HAND);
  });

  it("returns null for an unknown device", () => {
    const store = new InMemoryRoleAssignmentStore();
    expect(resolveRole(store, "unknown-device")).toBeNull();
  });

  it("refuses to assign the SAME physical device to a second, different role", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    const conflict = assignRole(store, "sensor-1", PhysicalRole.LEFT_HAND);
    expect(conflict).toEqual({ requestedRole: PhysicalRole.LEFT_HAND, existingRoleOfDevice: PhysicalRole.RIGHT_HAND });
    expect(resolveRole(store, "sensor-1")).toBe(PhysicalRole.RIGHT_HAND); // unchanged
  });

  it("treats re-requesting a device's own current role as a no-op, not a conflict", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    const conflict = assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    expect(conflict).toBeNull();
    expect(resolveRole(store, "sensor-1")).toBe(PhysicalRole.RIGHT_HAND);
  });

  it("allows a device to take a new role once its old one is explicitly cleared (explicit replace flow)", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    store.clear("sensor-1");
    const conflict = assignRole(store, "sensor-1", PhysicalRole.LEFT_HAND);
    expect(conflict).toBeNull();
    expect(resolveRole(store, "sensor-1")).toBe(PhysicalRole.LEFT_HAND);
  });
});

describe("clearRoleAssignment — explicit therapist replace flow", () => {
  it("clears the current owner of a role and returns its device id", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "old-right-sensor", PhysicalRole.RIGHT_HAND);
    const clearedDeviceId = clearRoleAssignment(store, PhysicalRole.RIGHT_HAND);
    expect(clearedDeviceId).toBe("old-right-sensor");
    expect(resolveRole(store, "old-right-sensor")).toBeNull();
  });

  it("returns null and changes nothing when the role has no current owner", () => {
    const store = new InMemoryRoleAssignmentStore();
    expect(clearRoleAssignment(store, PhysicalRole.LEFT_HAND)).toBeNull();
  });

  it("allows a genuinely different device to take the role immediately after clearing", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "old-right-sensor", PhysicalRole.RIGHT_HAND);
    clearRoleAssignment(store, PhysicalRole.RIGHT_HAND);
    expect(assignRole(store, "new-right-sensor", PhysicalRole.RIGHT_HAND)).toBeNull();
    expect(resolveRole(store, "new-right-sensor")).toBe(PhysicalRole.RIGHT_HAND);
  });

  it("never touches the OTHER role's assignment", () => {
    const store = new InMemoryRoleAssignmentStore();
    assignRole(store, "right-sensor", PhysicalRole.RIGHT_HAND);
    assignRole(store, "left-sensor", PhysicalRole.LEFT_HAND);
    clearRoleAssignment(store, PhysicalRole.RIGHT_HAND);
    expect(resolveRole(store, "left-sensor")).toBe(PhysicalRole.LEFT_HAND);
  });
});

describe("LocalStorageRoleAssignmentStore", () => {
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

  it("persists a role assignment across a fresh store instance (simulating a page reload)", () => {
    new LocalStorageRoleAssignmentStore().set("sensor-1", PhysicalRole.LEFT_HAND);
    expect(new LocalStorageRoleAssignmentStore().get("sensor-1")).toBe(PhysicalRole.LEFT_HAND);
  });

  it("lists every persisted device/role pair via entries(), across independent store instances", () => {
    const store = new LocalStorageRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    assignRole(store, "sensor-2", PhysicalRole.LEFT_HAND);

    const reopened = new LocalStorageRoleAssignmentStore();
    expect(new Set(reopened.entries())).toEqual(
      new Set([
        ["sensor-1", PhysicalRole.RIGHT_HAND],
        ["sensor-2", PhysicalRole.LEFT_HAND],
      ]),
    );
  });

  it("removes a device from both storage and the index on clear()", () => {
    const store = new LocalStorageRoleAssignmentStore();
    store.set("sensor-1", PhysicalRole.RIGHT_HAND);
    store.clear("sensor-1");
    expect(store.get("sensor-1")).toBeNull();
    expect(store.entries()).toEqual([]);
  });

  it("enforces the same duplicate-device-role refusal as InMemoryRoleAssignmentStore", () => {
    const store = new LocalStorageRoleAssignmentStore();
    assignRole(store, "sensor-1", PhysicalRole.RIGHT_HAND);
    const conflict = assignRole(store, "sensor-1", PhysicalRole.LEFT_HAND);
    expect(conflict).toEqual({ requestedRole: PhysicalRole.LEFT_HAND, existingRoleOfDevice: PhysicalRole.RIGHT_HAND });
  });
});
