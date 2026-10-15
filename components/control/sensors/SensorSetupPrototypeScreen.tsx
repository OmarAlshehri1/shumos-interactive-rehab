"use client";

import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import { useState } from "react";
import Link from "next/link";

/**
 * ISOLATED UX PROTOTYPE — therapist-facing sensor setup screen, prepared
 * per tonight's brief ("sensor setup UX", section 7). Deliberately not
 * linked from ControlNav or any other normal navigation, and deliberately
 * NOT wired to lib/physicalInput, Firebase, or any real BLE connection —
 * every state transition here is local mock state so the interaction shape
 * (بحث عن الحساسات / ربط / معايرة / إعادة المعايرة / اختبار الحركة / فصل)
 * can be reviewed and clicked through before any of it is real. Reachable
 * only via its direct URL (/control/sensor-setup-prototype), still behind
 * StaffAuthGate like every other /control page since this is therapist-
 * facing, not public.
 *
 * Wiring this to a real PhysicalInputManager (lib/physicalInput) — device
 * discovery, real connect/disconnect, real calibration flows per role — is
 * explicitly a later, separate task once WT901BLECL validation is finished
 * (see tools/witmotion_ble/docs/left-hand-phase2-plan.md and
 * balloon-quest-integration-plan.md).
 */

type ConnectionState = "not_added" | "disconnected" | "connecting" | "connected";
type CalibrationState = "not_added" | "needs_calibration" | "calibrating" | "calibrated";

interface RoleMockState {
  readonly labelAr: string;
  connection: ConnectionState;
  calibration: CalibrationState;
}

type RoleKey = "RIGHT_HAND" | "LEFT_HAND" | "RIGHT_FOOT" | "LEFT_FOOT";

const INITIAL_STATE: Record<RoleKey, RoleMockState> = {
  RIGHT_HAND: { labelAr: "اليد اليمنى", connection: "disconnected", calibration: "needs_calibration" },
  LEFT_HAND: { labelAr: "اليد اليسرى", connection: "disconnected", calibration: "needs_calibration" },
  RIGHT_FOOT: { labelAr: "الرجل اليمنى", connection: "not_added", calibration: "not_added" },
  LEFT_FOOT: { labelAr: "الرجل اليسرى", connection: "not_added", calibration: "not_added" },
};

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  not_added: "غير مضاف",
  disconnected: "غير متصل",
  connecting: "جاري البحث…",
  connected: "متصل",
};

const CALIBRATION_LABEL: Record<CalibrationState, string> = {
  not_added: "—",
  needs_calibration: "يحتاج معايرة",
  calibrating: "جاري المعايرة…",
  calibrated: "معاير ✓",
};

function connectionColor(state: ConnectionState): string {
  if (state === "connected") return "text-emerald-600";
  if (state === "connecting") return "text-amber-600";
  if (state === "not_added") return "text-slate-400";
  return "text-red-600";
}

function calibrationColor(state: CalibrationState): string {
  if (state === "calibrated") return "text-emerald-600";
  if (state === "calibrating") return "text-amber-600";
  if (state === "not_added") return "text-slate-400";
  return "text-amber-600";
}

export function SensorSetupPrototypeScreen() {
  const [roles, setRoles] = useState<Record<RoleKey, RoleMockState>>(INITIAL_STATE);
  const [selected, setSelected] = useState<RoleKey>("RIGHT_HAND");

  function updateRole(role: RoleKey, patch: Partial<RoleMockState>): void {
    setRoles((previous) => ({ ...previous, [role]: { ...previous[role], ...patch } }));
  }

  function handleDiscoverAndConnect(role: RoleKey): void {
    updateRole(role, { connection: "connecting" });
    setTimeout(() => updateRole(role, { connection: "connected" }), 900);
  }

  function handleDisconnect(role: RoleKey): void {
    updateRole(role, { connection: "disconnected" });
  }

  function handleCalibrate(role: RoleKey): void {
    updateRole(role, { calibration: "calibrating" });
    setTimeout(() => updateRole(role, { calibration: "calibrated" }), 1200);
  }

  const activeRole = roles[selected];
  const activeIsAssignable = activeRole.connection !== "not_added";

  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
        <ControlPageNav backHref="/control" backLabel="الرئيسية" />
        <header className="flex flex-col items-center gap-1.5 text-center">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            نموذج أولي — غير متصل ببيانات حقيقية
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">حساسات الحركة</h1>
          <p className="text-sm text-slate-500">إعداد وربط حساسات اليد والرجل لكل طفل</p>
        </header>

        <div className="flex flex-col gap-3">
          {(Object.keys(roles) as RoleKey[]).map((role) => {
            const state = roles[role];
            const isSelected = role === selected;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelected(role)}
                className={`flex items-center justify-between rounded-2xl border-2 p-4 text-right transition-colors ${
                  isSelected ? "border-teal-500 bg-teal-50/60" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-slate-900">{state.labelAr}</span>
                  {state.connection !== "not_added" ? (
                    <span className="text-sm text-slate-500">
                      <span className={connectionColor(state.connection)}>{CONNECTION_LABEL[state.connection]}</span>
                      {" · "}
                      <span className={calibrationColor(state.calibration)}>{CALIBRATION_LABEL[state.calibration]}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400">{CONNECTION_LABEL.not_added}</span>
                  )}
                </div>
                <span className="text-slate-300">›</span>
              </button>
            );
          })}
        </div>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
          <h2 className="text-center text-lg font-bold text-slate-900">{activeRole.labelAr}</h2>

          {!activeIsAssignable && (
            <p className="text-center text-sm text-slate-400">
              لم يتم تخصيص حساس لهذا الطرف بعد. اضغط «بحث عن الحساسات» لإضافة حساس جديد وتعيينه.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              label="بحث عن الحساسات"
              onClick={() => handleDiscoverAndConnect(selected)}
              disabled={activeRole.connection === "connecting"}
              tone="primary"
            />
            <ActionButton
              label="ربط"
              onClick={() => handleDiscoverAndConnect(selected)}
              disabled={activeRole.connection === "connected" || activeRole.connection === "connecting"}
            />
            <ActionButton
              label="معايرة"
              onClick={() => handleCalibrate(selected)}
              disabled={activeRole.connection !== "connected" || activeRole.calibration === "calibrating"}
            />
            <ActionButton
              label="إعادة المعايرة"
              onClick={() => handleCalibrate(selected)}
              disabled={activeRole.calibration !== "calibrated"}
            />
            <ActionButton
              label="اختبار الحركة"
              onClick={() => {}}
              disabled={activeRole.calibration !== "calibrated"}
            />
            <ActionButton
              label="فصل"
              onClick={() => handleDisconnect(selected)}
              disabled={activeRole.connection === "disconnected" || activeRole.connection === "not_added"}
              tone="danger"
            />
          </div>
        </section>

        <Link href="/control" className="text-center text-sm font-semibold text-teal-700">
          العودة إلى الرئيسية
        </Link>
      </div>
    </main>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClasses =
    tone === "primary"
      ? "bg-teal-600 text-white active:bg-teal-700"
      : tone === "danger"
        ? "border-2 border-red-200 bg-white text-red-600 active:bg-red-50"
        : "border-2 border-slate-200 bg-white text-slate-700 active:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-14 touch-manipulation rounded-2xl px-3 text-sm font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses}`}
    >
      {label}
    </button>
  );
}
