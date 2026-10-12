"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { PhysicalRole } from "@/lib/physicalInput";
import { LEFT_HAND_RUNTIME_CONFIG, RIGHT_HAND_RUNTIME_CONFIG } from "@/lib/physicalInput/SensorHandRuntimeConfig";
import { useSensorHandRuntime, type SensorRuntime } from "./useSensorHandRuntime";

export type { SensorRuntime } from "./useSensorHandRuntime";

const RightHandRuntimeContext = createContext<SensorRuntime | null>(null);
const LeftHandRuntimeContext = createContext<SensorRuntime | null>(null);

/**
 * TWO independent WT901BLECL connections (RIGHT_HAND, LEFT_HAND), owned at
 * the /control layout level (see app/control/layout.tsx) so both survive
 * client-side navigation between game routes — connect once per hand,
 * auto-center, play a game, return to the library, play another compatible
 * game, all without reconnecting Bluetooth. This is only possible because
 * Next.js App Router keeps a shared layout's component tree mounted across
 * navigations within it; it does NOT survive a full page reload (Web
 * Bluetooth requires a fresh user gesture then) — that is a real browser
 * security limitation, not something to fake.
 *
 * RIGHT_HAND is the accepted, real-gameplay/video-validated baseline (see
 * SensorHandRuntimeConfig.ts's frozen RIGHT_HAND_RUNTIME_CONFIG) — every
 * existing game reads it via `useSensorRuntime()`, whose behavior is
 * unchanged by this file now also owning a second, independent LEFT_HAND
 * runtime alongside it (`useLeftHandSensorRuntime()` /
 * `useDualSensorRuntime()`). Both roles instantiate the SAME reusable
 * useSensorHandRuntime hook with their own config/state — never two
 * duplicated provider implementations (tonight's dual-sensor brief,
 * section 6). Each role's Wt901BleInputSource is told to exclude the OTHER
 * role's currently-connected device id from its own silent/manual connect
 * attempts, so one physical sensor can never end up serving both hands at
 * once — see useSensorHandRuntime's own doc comment and
 * Wt901BleInputSource's `excludeDeviceIds` parameter.
 *
 * Every game that wants RIGHT_HAND sensor input keeps reading
 * useSensorRuntime() (via useSensorPointerTargets.ts) exactly as before —
 * this file's dual-hand wiring is purely additive.
 */
export function SensorRuntimeProvider({ children }: { children: React.ReactNode }) {
  // Two stable refs (identity never changes across renders), each holding
  // the OTHER role's most recently known device id. Both the accessor
  // functions below (created once via useMemo(() => fn, []), never
  // recreated on a dependency — a closure merely MENTIONING a ref is fine
  // to build during render; only actually READING/WRITING `.current`
  // during render itself is disallowed) and the two effects that keep the
  // refs current run in an order that sidesteps the chicken-and-egg problem
  // of needing rightHand.deviceId before rightHand exists (hooks must run
  // unconditionally, so leftHand's hook call can't literally come "after"
  // rightHand's in a data-dependency sense): both refs are updated, in an
  // effect, AFTER both useSensorHandRuntime calls below, every render — and
  // since either role's connect logic only ever calls its accessor
  // asynchronously (after a BLE getDevices()/requestDevice() promise
  // resolves, never synchronously during this render), it always observes
  // whatever this same render's effects already committed to the ref.
  const rightHandDeviceIdRef = useRef<string | null>(null);
  const leftHandDeviceIdRef = useRef<string | null>(null);
  const getExcludedForLeft = useMemo(() => () => (rightHandDeviceIdRef.current ? [rightHandDeviceIdRef.current] : []), []);
  const getExcludedForRight = useMemo(() => () => (leftHandDeviceIdRef.current ? [leftHandDeviceIdRef.current] : []), []);

  const rightHand = useSensorHandRuntime(RIGHT_HAND_RUNTIME_CONFIG, getExcludedForRight);
  const leftHand = useSensorHandRuntime(LEFT_HAND_RUNTIME_CONFIG, getExcludedForLeft);

  useEffect(() => {
    rightHandDeviceIdRef.current = rightHand.deviceId;
  }, [rightHand.deviceId]);
  useEffect(() => {
    leftHandDeviceIdRef.current = leftHand.deviceId;
  }, [leftHand.deviceId]);

  return (
    <RightHandRuntimeContext.Provider value={rightHand}>
      <LeftHandRuntimeContext.Provider value={leftHand}>{children}</LeftHandRuntimeContext.Provider>
    </RightHandRuntimeContext.Provider>
  );
}

/** Throws outside SensorRuntimeProvider — every /control/* route has it via app/control/layout.tsx. Unchanged: every existing game/screen keeps reading RIGHT_HAND through this exact call. */
export function useSensorRuntime(): SensorRuntime {
  const runtime = useContext(RightHandRuntimeContext);
  if (!runtime) throw new Error("useSensorRuntime must be used within a SensorRuntimeProvider");
  return runtime;
}

/** LEFT_HAND's own independent runtime — same shape as useSensorRuntime(), never sharing state with it. Not read by any production game yet (see tonight's dual-sensor brief, section 11: prepared architecture only, not enabled until real LEFT_HAND validation passes). */
export function useLeftHandSensorRuntime(): SensorRuntime {
  const runtime = useContext(LeftHandRuntimeContext);
  if (!runtime) throw new Error("useLeftHandSensorRuntime must be used within a SensorRuntimeProvider");
  return runtime;
}

export interface DualSensorRuntime {
  readonly right: SensorRuntime;
  readonly left: SensorRuntime;
}

/** Convenience for UI that genuinely needs both at once (readiness dashboard, role-assignment screens, recenter-both control) — see components/control/home/SystemReadinessCard.tsx. */
export function useDualSensorRuntime(): DualSensorRuntime {
  const right = useSensorRuntime();
  const left = useLeftHandSensorRuntime();
  return useMemo(() => ({ right, left }), [right, left]);
}

/** Maps a role to its runtime — a small convenience for UI (e.g. the role-assignment screen) that's handed a `PhysicalRole` rather than statically knowing which hand it wants. */
export function useSensorRuntimeForRole(role: PhysicalRole): SensorRuntime {
  const dual = useDualSensorRuntime();
  return role === PhysicalRole.LEFT_HAND ? dual.left : dual.right;
}
