"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";

import Link from "next/link";
import { useState } from "react";
import { PRODUCTION_DEFAULT_SETTINGS, useRunnerQuestRealtimeControl } from "@/lib/control/runnerquest3d/useRunnerQuestRealtimeControl";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { GAME_NAME_AR } from "@/lib/runnerquest3d/arabic";
import type { InputSourceId } from "@/lib/runnerquest3d/types";
import { ConnectionBadge } from "../ConnectionBadge";
import { LeaseContestedOverlay } from "../LeaseContestedOverlay";
import { EndSessionReasonSheet } from "../session/EndSessionReasonSheet";
import { RunnerControlPanels, RunnerQuest3DControl } from "./RunnerQuest3DControl";

/** Manual touch control is the default and needs nothing; foot modes are prepared but unvalidated. */
const PRODUCTION_INPUT_SOURCES: readonly InputSourceId[] = ["MANUAL", "RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"];
const SHOW_SIMULATOR = process.env.NODE_ENV !== "production";

/**
 * The Runner Quest 3D therapist screen at /control/runner-quest-3d (library card target). With Firebase
 * configured it is the cross-device production screen (therapist iPad/computer <-> Display on another
 * device); without Firebase (local development) it falls back to the same-computer channel.
 */
export function RunnerQuestControl() {
  return isRealtimeEnabled() ? <RealtimeRunnerQuestControl /> : <RunnerQuest3DControl displayHref="/display/runner-quest-3d" />;
}
export { PRODUCTION_DEFAULT_SETTINGS };

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { selectedPatient, clearPatient } = usePatientContext();
  return (
    <main dir="rtl" lang="ar" className="fixed inset-0 flex h-dvh w-dvw flex-col overflow-y-auto bg-slate-50 text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }} data-testid="rq-control-shell">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <Link href="/control/activities" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700">
          <span aria-hidden="true">→</span>
          العودة للأنشطة
        </Link>
        <h1 className="sr-only">{GAME_NAME_AR}</h1>
        <div className="flex items-center gap-2">
          {right}
          {selectedPatient && (
            <button type="button" onClick={clearPatient} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100">
              {selectedPatient.firstName}
              <span aria-hidden="true">·</span>
              تغيير المريض
            </button>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-2 sm:px-6">{children}</div>
    </main>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function RealtimeRunnerQuestControl() {
  const c = useRunnerQuestRealtimeControl();
  const [endOpen, setEndOpen] = useState(false);
  if (c.authPhase !== "authorized") return <Shell><Spinner label="جاري تجهيز الاتصال..." /></Shell>;
  return (
    <Shell right={<ConnectionBadge status={c.connectionStatus} hasLoadedInitialSession syncRestoredAt={null} />}>
      {!c.isOwner && <ControlSlot slot="dialogs"><LeaseContestedOverlay onTakeOver={c.claimOwnership} takeoverBlocked={c.takeoverBlocked} /></ControlSlot>}
      {c.runtime && c.view ? (
        <RunnerControlPanels runtime={c.runtime} view={c.view} options={{
          crossDevice: true, requireChildName: true, childName: c.childName, onChildNameChange: c.setChildName, onRequestEnd: () => setEndOpen(true),
          showSimulator: SHOW_SIMULATOR, inputSources: PRODUCTION_INPUT_SOURCES, publishError: c.publishError,
        }} />
      ) : <Spinner label="جاري التحقق من الجلسة..." />}
      <ControlSlot slot="dialogs"><EndSessionReasonSheet open={endOpen} onCancel={() => setEndOpen(false)} onConfirm={(selection) => { c.endWithReason(selection); setEndOpen(false); }} /></ControlSlot>
    </Shell>
  );
}
