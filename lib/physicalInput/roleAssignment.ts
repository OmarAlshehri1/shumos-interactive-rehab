import { PhysicalRole } from "./types";

/**
 * Stable device-id -> role assignment, so a second real sensor can be
 * discovered and assigned to LEFT_HAND tomorrow/later without any product
 * code hardcoding a MAC address or CoreBluetooth UUID (see tonight's
 * brief). The assignment itself is just a small persisted map; discovery
 * (finding nearby WT901BLECL devices) stays entirely inside whichever
 * InputSource adapter implements it - this module only decides, given a
 * device id that adapter already discovered, which role (if any) it maps
 * to, and lets a therapist confirm or change that mapping.
 *
 * RoleAssignmentStore is an interface so this can be backed by
 * localStorage, Firebase, or (in tests) memory, without roleAssignment.ts
 * itself depending on any of those.
 */
export interface RoleAssignmentStore {
  get(deviceId: string): PhysicalRole | null;
  set(deviceId: string, role: PhysicalRole): void;
  /** All current device->role pairs, e.g. so a setup screen can show "this device is currently RIGHT_HAND". */
  entries(): ReadonlyArray<readonly [string, PhysicalRole]>;
  clear(deviceId: string): void;
}

export class InMemoryRoleAssignmentStore implements RoleAssignmentStore {
  private readonly map = new Map<string, PhysicalRole>();

  get(deviceId: string): PhysicalRole | null {
    return this.map.get(deviceId) ?? null;
  }

  set(deviceId: string, role: PhysicalRole): void {
    this.map.set(deviceId, role);
  }

  entries(): ReadonlyArray<readonly [string, PhysicalRole]> {
    return Array.from(this.map.entries());
  }

  clear(deviceId: string): void {
    this.map.delete(deviceId);
  }
}

export interface RoleConflict {
  readonly requestedRole: PhysicalRole;
  /** Set when a DIFFERENT device already owns requestedRole - the ordinary "role taken" conflict. */
  readonly currentOwnerDeviceId?: string;
  /**
   * Set when `deviceId` itself already owns a DIFFERENT role - refusing to
   * let one physical WT901BLECL silently serve two roles at once (e.g. a
   * therapist double-tapping "استبدال" on the wrong picker, or two staff
   * members assigning the same sensor from two tabs). Requesting the SAME
   * role the device already owns is a no-op, not a conflict.
   */
  readonly existingRoleOfDevice?: PhysicalRole;
}

/**
 * Assigns `deviceId` to `role`, refusing (returning a RoleConflict instead
 * of silently reassigning) in either direction:
 *  - a DIFFERENT device already owns that role - a therapist must
 *    explicitly clear the old assignment first (`store.clear(oldDeviceId)`)
 *    rather than a newly-discovered sensor ever silently displacing an
 *    already-working one; or
 *  - this SAME device already owns a DIFFERENT role - one physical sensor
 *    must never simultaneously be RIGHT_HAND and LEFT_HAND (see tonight's
 *    dual-sensor brief, "prevent accidentally assigning the same physical
 *    device to both roles"). A therapist replacing a sensor's role must
 *    explicitly clear its old role first, same as above.
 */
export function assignRole(store: RoleAssignmentStore, deviceId: string, role: PhysicalRole): RoleConflict | null {
  const existingOwner = store.entries().find(([, assignedRole]) => assignedRole === role);
  if (existingOwner && existingOwner[0] !== deviceId) {
    return { requestedRole: role, currentOwnerDeviceId: existingOwner[0] };
  }
  const existingRoleOfDevice = store.get(deviceId);
  if (existingRoleOfDevice !== null && existingRoleOfDevice !== role) {
    return { requestedRole: role, existingRoleOfDevice };
  }
  store.set(deviceId, role);
  return null;
}

export function resolveRole(store: RoleAssignmentStore, deviceId: string): PhysicalRole | null {
  return store.get(deviceId);
}

/**
 * Explicit therapist "استبدال" (replace) action: clears whichever device
 * currently owns `role`, if any, so a NEW device can subsequently be
 * assigned to that role without a conflict. Returns the cleared device id,
 * or null if the role had no owner. Deliberately the ONLY way a role's
 * owner changes — see assignRole's own doc comment for why silent
 * displacement is refused.
 */
export function clearRoleAssignment(store: RoleAssignmentStore, role: PhysicalRole): string | null {
  const owner = store.entries().find(([, assignedRole]) => assignedRole === role);
  if (!owner) return null;
  store.clear(owner[0]);
  return owner[0];
}

const STORAGE_KEY_PREFIX = "shumos:sensor:role:";

/**
 * Persistent RoleAssignmentStore backed by localStorage - one key per
 * device id (`shumos:sensor:role:<deviceId>` -> role string), so a
 * newly-authorized WT901BLECL's role assignment survives a page reload/
 * browser restart, matching Wt901BleInputSource's own
 * RIGHT_HAND_DEVICE_HINT_KEY persistence pattern. `entries()` needs an
 * explicit index (`knownDeviceIds`) rather than enumerating
 * `localStorage` directly, since localStorage has no "list keys matching
 * a prefix" API of its own and a clinic's origin may hold unrelated keys.
 */
export class LocalStorageRoleAssignmentStore implements RoleAssignmentStore {
  private static readonly INDEX_KEY = "shumos:sensor:role:__index";

  private key(deviceId: string): string {
    return `${STORAGE_KEY_PREFIX}${deviceId}`;
  }

  private readIndex(): string[] {
    try {
      const raw = window.localStorage.getItem(LocalStorageRoleAssignmentStore.INDEX_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  private writeIndex(deviceIds: readonly string[]): void {
    try {
      window.localStorage.setItem(LocalStorageRoleAssignmentStore.INDEX_KEY, JSON.stringify(deviceIds));
    } catch {
      // Best-effort only, matching this codebase's other localStorage writes.
    }
  }

  get(deviceId: string): PhysicalRole | null {
    try {
      const value = window.localStorage.getItem(this.key(deviceId));
      return value !== null && value in PhysicalRole ? (value as PhysicalRole) : null;
    } catch {
      return null;
    }
  }

  set(deviceId: string, role: PhysicalRole): void {
    try {
      window.localStorage.setItem(this.key(deviceId), role);
      const index = this.readIndex();
      if (!index.includes(deviceId)) this.writeIndex([...index, deviceId]);
    } catch {
      // Best-effort only.
    }
  }

  entries(): ReadonlyArray<readonly [string, PhysicalRole]> {
    return this.readIndex()
      .map((deviceId): readonly [string, PhysicalRole | null] => [deviceId, this.get(deviceId)])
      .filter((entry): entry is readonly [string, PhysicalRole] => entry[1] !== null);
  }

  clear(deviceId: string): void {
    try {
      window.localStorage.removeItem(this.key(deviceId));
      this.writeIndex(this.readIndex().filter((id) => id !== deviceId));
    } catch {
      // Best-effort only.
    }
  }
}
