import { useEffect, useMemo, useRef, useState } from "react";
import { SensorContactRouter, type CircularContactTarget, type NormalizedPointer } from "@/lib/physicalInput";
import { useSensorRuntime } from "./SensorRuntimeProvider";

export type SensorContactTarget = CircularContactTarget;

export interface SensorPointerTargetsResult {
  /** How many distinct sensor contacts have fired an onEnter call so far this mount — for on-screen diagnostics only, never gameplay logic. */
  readonly contactCount: number;
}

/**
 * The one reusable "sensor pointer enters a target -> call this game's
 * existing canonical action" adapter (Part 3/4). Each game supplies only
 * its own target geometry (id/x/y/radius, normalized 0-1) and its own
 * already-existing action callback — this hook owns none of that game's
 * scoring/session/display logic, only the contact detection in between.
 *
 * A thin React wrapper over SensorContactRouter (the framework-free,
 * directly unit-tested core — see lib/physicalInput/SensorContactRouter.ts
 * and its tests for "one entry = one action," "hold does not repeat," and
 * "exit rearms," none of which are re-tested here).
 *
 * Takes `pointer`/`connected` as plain values rather than reading
 * SensorRuntimeProvider's context directly, so it works equally for a game
 * on the shared play runtime AND for a standalone/independently-configured
 * controller instance (e.g. the diagnostic lab's own axis/filter/rotation-
 * compensation experiments in SensorHandDemoScreen.tsx, which intentionally
 * never joins the shared runtime) — see useSensorPointerTargets below for
 * the shared-runtime convenience wrapper most games should actually use.
 *
 * `active` gates whether contacts are even considered — false during a
 * game's non-spatial stages/phases (e.g. a non-spatial game phase,
 * or any screen that isn't GameState.PLAYING) without unmounting this hook.
 *
 * `recenterEpoch` (optional — the standalone diagnostic-lab caller has no
 * equivalent and simply never passes it) primes this router's contact gate
 * at the freshly-recentered position instead of firing a phantom contact
 * for the pointer's jump whenever it changes — see
 * SensorContactRouter.notePendingRecenter and ContactActivationGate.primeAt.
 */
export function useContactTargets(
  pointer: NormalizedPointer | null,
  connected: boolean,
  targets: readonly SensorContactTarget[],
  onEnter: (targetId: string) => void,
  active = true,
  recenterEpoch?: number,
): SensorPointerTargetsResult {
  const routerRef = useRef<SensorContactRouter | null>(null);
  if (routerRef.current === null) routerRef.current = new SensorContactRouter(active);
  const [contactCount, setContactCount] = useState(0);
  const onEnterRef = useRef(onEnter);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);

  const lastRecenterEpochRef = useRef(recenterEpoch);
  useEffect(() => {
    if (recenterEpoch !== undefined && lastRecenterEpochRef.current !== recenterEpoch) {
      lastRecenterEpochRef.current = recenterEpoch;
      routerRef.current!.notePendingRecenter();
    }
  }, [recenterEpoch]);

  useEffect(() => {
    const router = routerRef.current!;
    const targetId = router.observe(active, connected, pointer, targets);
    if (targetId !== null) {
      onEnterRef.current(targetId);
      setContactCount(router.count);
    }
  }, [active, connected, pointer, targets]);

  return useMemo(() => ({ contactCount }), [contactCount]);
}

/**
 * Convenience wrapper for the common case: a game reading the shared
 * RIGHT_HAND runtime (SensorRuntimeProvider, see app/control/layout.tsx)
 * rather than an independent controller instance. See useContactTargets
 * above for the underlying, runtime-agnostic mechanism.
 */
export function useSensorPointerTargets(
  targets: readonly SensorContactTarget[],
  onEnter: (targetId: string) => void,
  active = true,
): SensorPointerTargetsResult {
  const { connected, pointer, recenterEpoch } = useSensorRuntime();
  return useContactTargets(pointer, connected, targets, onEnter, active, recenterEpoch);
}
