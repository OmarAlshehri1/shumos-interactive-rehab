"use client";

import { useCallback } from "react";
import { useSensorRuntime, useLeftHandSensorRuntime } from "./SensorRuntimeProvider";

/**
 * Therapist recenter controls for BOTH hands (tonight's dual-sensor brief,
 * section 13). Each button calls ONLY that hand's own
 * ContinuousMotionController.recenter() (via useSensorRuntime()/
 * useLeftHandSensorRuntime()'s independent `recenter` functions) — there is
 * no shared recenter state between roles anywhere in this stack (see
 * PhysicalInputManager, one ContinuousMotionController instance per role).
 * "إعادة تعيين اليدين" is a plain convenience that calls both, one after the
 * other; it does not introduce any new shared state or synchronization —
 * either call can independently no-op (e.g. "لا توجد قراءة بعد" for a hand
 * with no sample yet) without affecting the other.
 *
 * None of this touches score, session phase, or game activation — recenter()
 * only ever resets that ContinuousMotionController's own center reference
 * (see its own doc comment); nothing here calls into session/game state.
 *
 * Not mounted into any production game screen yet — a plain reusable
 * component, ready for whichever dual-hand screen needs it once real
 * LEFT_HAND validation passes (see tonight's brief, section 12's same
 * "prepared, not yet enabled" policy).
 */
export function DualHandRecenterControls() {
  const rightHand = useSensorRuntime();
  const leftHand = useLeftHandSensorRuntime();

  const recenterBoth = useCallback(() => {
    rightHand.recenter();
    leftHand.recenter();
  }, [rightHand, leftHand]);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={rightHand.recenter}
        disabled={!rightHand.connected || !rightHand.sample}
        title="للمعالج فقط — يعيد ضبط مرجع اليد اليمنى فقط"
        className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 disabled:opacity-40"
      >
        إعادة تعيين اليد اليمنى
      </button>
      <button
        type="button"
        onClick={leftHand.recenter}
        disabled={!leftHand.connected || !leftHand.sample}
        title="للمعالج فقط — يعيد ضبط مرجع اليد اليسرى فقط"
        className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 disabled:opacity-40"
      >
        إعادة تعيين اليد اليسرى
      </button>
      <button
        type="button"
        onClick={recenterBoth}
        disabled={(!rightHand.connected || !rightHand.sample) && (!leftHand.connected || !leftHand.sample)}
        title="للمعالج فقط — يعيد ضبط كل يد متصلة بشكل مستقل"
        className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-bold text-teal-700 disabled:opacity-40"
      >
        إعادة تعيين اليدين
      </button>
    </div>
  );
}
