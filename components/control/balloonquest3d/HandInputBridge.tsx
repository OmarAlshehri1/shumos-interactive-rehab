"use client";

import { useEffect, useRef } from "react";
import { useDualSensorRuntime } from "@/components/control/sensors/SensorRuntimeProvider";
import type { ControlRuntime } from "@/lib/balloonquest/controlRuntime";

/**
 * Feeds the EXISTING shared hand runtimes (RIGHT_HAND, LEFT_HAND — see
 * SensorRuntimeProvider) into the Balloon Quest 3D input hub. It only READS
 * the final normalised pointer each runtime already publishes: no BLE, no
 * calibration, no filtering, no extra smoothing, no Firebase. LEFT_HAND
 * remains experimental — its real-hardware validation is still pending.
 */
export function HandInputBridge({ runtime }: { runtime: ControlRuntime | null }): null {
  const { right, left } = useDualSensorRuntime();
  const seq = useRef({ right: 0, left: 0 });

  useEffect(() => {
    if (!runtime) return;
    const p = right.pointer?.pointer;
    runtime.ingestPointer({ sourceId: "RIGHT_HAND", x: p?.x ?? 0, y: p?.y ?? 0, visible: right.connected && !!p, seq: ++seq.current.right, atMs: performance.now() });
  }, [runtime, right.pointer, right.connected]);

  useEffect(() => {
    if (!runtime) return;
    const p = left.pointer?.pointer;
    runtime.ingestPointer({ sourceId: "LEFT_HAND", x: p?.x ?? 0, y: p?.y ?? 0, visible: left.connected && !!p, seq: ++seq.current.left, atMs: performance.now() });
  }, [runtime, left.pointer, left.connected]);

  const rightEpoch = useRef(right.recenterEpoch);
  const leftEpoch = useRef(left.recenterEpoch);
  useEffect(() => {
    if (runtime && rightEpoch.current !== right.recenterEpoch) {
      rightEpoch.current = right.recenterEpoch;
      runtime.notePendingRecenter("RIGHT_HAND");
    }
    if (runtime && leftEpoch.current !== left.recenterEpoch) {
      leftEpoch.current = left.recenterEpoch;
      runtime.notePendingRecenter("LEFT_HAND");
    }
  }, [runtime, right.recenterEpoch, left.recenterEpoch]);

  return null;
}
