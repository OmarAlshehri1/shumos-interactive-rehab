"use client";

import { SensorHandCursor } from "./SensorHandCursor";
import { useSensorRuntime } from "./SensorRuntimeProvider";
import { useSensorPointerTargets, type SensorContactTarget } from "./useSensorPointerTargets";

interface SensorHandLayerProps {
  /** This game's own live target geometry for the current stage — see lib/physicalInput/gameSensorTargets.ts for the per-game derivation each real live map uses. */
  targets: readonly SensorContactTarget[];
  /** Mirrors whatever already disables mouse/touch on this map (offline, paused, stage complete, non-spatial phase, ...) — the sensor is never a separate on/off switch from the rest of the map. */
  active: boolean;
  /** Called once per contact "enter" with the target id — the SAME canonical action (selectBalloon/confirmFoodSelection/confirmCurrentFootstep/confirmBubblePopColor/confirmColorChasePad) the map's own onClick already calls, never a parallel path. */
  onContact: (targetId: string) => void;
}

/**
 * PRODUCTION SENSOR INTEGRATION — the one reusable "shared RIGHT_HAND
 * pointer, live inside a real game's own map" layer. Mount this directly
 * inside the SAME relatively-positioned container a game's map already
 * renders its clickable targets in (BalloonMap, AnimalFoodMap, FootMap,
 * StationBar, ColorChase's pad grid) — its normalized x/y already matches
 * that container's coordinate space, exactly like every *SensorContactDemo.tsx
 * reference implementation under this folder already proved.
 *
 * Renders nothing when there is no sensor connected/no pointer yet — a
 * disconnect never leaves a stale hand or a stuck "armed" contact state
 * behind (see useSensorPointerTargets -> SensorContactRouter, which resets
 * its ContactActivationGate whenever `connected`/`pointer` go falsy). Mouse
 * and touch are completely unaffected either way — this is a pure addition
 * next to the map's existing onClick handlers, never a replacement.
 */
export function SensorHandLayer({ targets, active, onContact }: SensorHandLayerProps) {
  const { pointer, connected } = useSensorRuntime();
  useSensorPointerTargets(targets, onContact, active);
  return <SensorHandCursor pointer={pointer?.pointer ?? null} visible={connected && !!pointer} />;
}
