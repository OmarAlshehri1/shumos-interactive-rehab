"use client";

import { useCallback, useState } from "react";
import { PhysicalRole, clearDeviceHint, clearRoleAssignment, LocalStorageRoleAssignmentStore } from "@/lib/physicalInput";
import { LEFT_HAND_RUNTIME_CONFIG, RIGHT_HAND_RUNTIME_CONFIG } from "@/lib/physicalInput/SensorHandRuntimeConfig";
import { useSensorRuntime, useLeftHandSensorRuntime } from "./SensorRuntimeProvider";

/**
 * "تم العثور على حساس جديد" first-time role-assignment prompt (tonight's
 * dual-sensor brief, section 5). Purely presentational: the actual
 * assignment already happens automatically the instant a role-specific
 * connect() succeeds against a brand-new device (see
 * useSensorHandRuntime.ts's persisted-role guard, which calls the SAME
 * assignRole() this prompt would call) — this component exists for the
 * explicit-confirmation UX the brief asks for, wherever a future connect
 * flow wants to show it BEFORE silently accepting a first-time device
 * rather than after.
 */
export function SensorRoleAssignmentPrompt({ onAssignRight, onAssignLeft, onCancel }: { onAssignRight: () => void; onAssignLeft: () => void; onCancel?: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <p className="text-sm font-bold text-teal-900">تم العثور على حساس جديد</p>
      <p className="text-xs font-semibold text-teal-800">تعيين هذا الحساس:</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAssignRight} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">اليد اليمنى</button>
        <button type="button" onClick={onAssignLeft} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">اليد اليسرى</button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-xl border border-teal-200 px-4 py-2.5 text-sm font-bold text-teal-700">إلغاء</button>
        )}
      </div>
    </div>
  );
}

/**
 * "استبدال حساس اليد اليمنى/اليسرى" — the ONLY sanctioned way to move a
 * role from one physical sensor to another (tonight's brief, section 5:
 * "if replacing a sensor, provide an explicit therapist action"). Clears
 * BOTH halves of that role's persisted identity: the general device->role
 * map (roleAssignment.ts's clearRoleAssignment) and this role's own
 * Wt901BleInputSource hint key (clearDeviceHint) — otherwise the old
 * device would keep winning the "prefer the last-known device" silent
 * reconnect race even after being logically un-assigned. Disconnects first
 * if the old sensor is currently connected, so there is never a moment
 * where a role has two candidate physical devices.
 */
function ReplaceRoleButton({ role, arabicLabel, deviceHintKey, runtime }: { role: PhysicalRole; arabicLabel: string; deviceHintKey: string; runtime: ReturnType<typeof useSensorRuntime> }) {
  const [status, setStatus] = useState<string | null>(null);

  const handleReplace = useCallback(async () => {
    if (runtime.connected) await runtime.disconnect();
    const clearedDeviceId = clearRoleAssignment(new LocalStorageRoleAssignmentStore(), role);
    clearDeviceHint(deviceHintKey);
    setStatus(clearedDeviceId ? "تم إلغاء تعيين الحساس السابق — اضغط «ربط» لتوصيل الحساس الجديد." : "لا يوجد حساس معيَّن حاليًا لهذا الدور.");
  }, [runtime, role, deviceHintKey]);

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => void handleReplace()} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800">
        استبدال {arabicLabel}
      </button>
      {status && <p className="text-[11px] font-semibold text-slate-500">{status}</p>}
    </div>
  );
}

export function SensorReplaceRoleControls() {
  const rightHand = useSensorRuntime();
  const leftHand = useLeftHandSensorRuntime();

  return (
    <div className="flex flex-wrap gap-2">
      <ReplaceRoleButton role={PhysicalRole.RIGHT_HAND} arabicLabel="حساس اليد اليمنى" deviceHintKey={RIGHT_HAND_RUNTIME_CONFIG.deviceHintKey} runtime={rightHand} />
      <ReplaceRoleButton role={PhysicalRole.LEFT_HAND} arabicLabel="حساس اليد اليسرى" deviceHintKey={LEFT_HAND_RUNTIME_CONFIG.deviceHintKey} runtime={leftHand} />
    </div>
  );
}
