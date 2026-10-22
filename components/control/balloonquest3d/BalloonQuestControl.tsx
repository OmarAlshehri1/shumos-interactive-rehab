"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mountControl, type ControlHandle } from "@/lib/balloonquest/controlMount";
import type { ControlView } from "@/lib/balloonquest/controlRuntime";
import type { InputMode } from "@/lib/balloonquest/types";
import { PRODUCTION_DEFAULT_SETTINGS, useBalloonQuest3DRealtimeControl } from "@/lib/control/balloonquest3d/useBalloonQuest3DRealtimeControl";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { ConnectionBadge } from "../ConnectionBadge";
import { LeaseContestedOverlay } from "../LeaseContestedOverlay";
import { EndSessionReasonSheet } from "../session/EndSessionReasonSheet";
import { ControlPanels, type ProductionPanelOptions } from "./BalloonQuest3DControl";

/** Real-hardware status: only RIGHT_HAND has been validated. Keyboard (development), left/both hands (experimental), foot and handheld (simulation) stay in the engine but are not offered to therapists. */
const PRODUCTION_INPUT_MODES: readonly InputMode[] = ["therapist", "right-hand"];
const SHOW_SIMULATOR = process.env.NODE_ENV !== "production";

/**
 * The Balloon Quest (redesigned) therapist screen, mounted at /control/balloon-quest.
 * Realtime deployments use the platform's Firebase session; a deployment without
 * Firebase (local development) uses the local BroadcastChannel to a Display window.
 */
export function BalloonQuestControl() {
  return isRealtimeEnabled() ? <RealtimeBalloonQuestControl /> : <LocalBalloonQuestControl />;
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { selectedPatient, clearPatient } = usePatientContext();
  return (
    <main dir="rtl" lang="ar" className="fixed inset-0 flex h-dvh w-dvw flex-col overflow-y-auto bg-slate-50 text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }} data-testid="bq-control">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <Link href="/control/activities" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600">
          <span aria-hidden="true">→</span>
          العودة للأنشطة
        </Link>
        <h1 className="text-lg font-extrabold text-slate-800">مغامرة البالونات</h1>
        <div className="flex items-center gap-2">
          {right}
          {selectedPatient && (
            <button type="button" onClick={clearPatient} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100">
              {selectedPatient.firstName}
              <span aria-hidden="true">·</span>
              تغيير المريض
            </button>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-4 sm:px-6">{children}</div>
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

function RealtimeBalloonQuestControl() {
  const c = useBalloonQuest3DRealtimeControl();
  const [endOpen, setEndOpen] = useState(false);
  if (c.authPhase !== "authorized") return <Shell><Spinner label="جاري تجهيز الاتصال..." /></Shell>;
  const production: ProductionPanelOptions = {
    requireChildName: true,
    childName: c.childName,
    onChildNameChange: c.setChildName,
    onRequestEnd: () => setEndOpen(true),
    showSimulator: SHOW_SIMULATOR,
    inputModes: PRODUCTION_INPUT_MODES,
  };
  return (
    <Shell right={<ConnectionBadge status={c.connectionStatus} hasLoadedInitialSession syncRestoredAt={null} />}>
      {!c.isOwner && <ControlSlot slot="dialogs"><LeaseContestedOverlay onTakeOver={c.claimOwnership} takeoverBlocked={c.takeoverBlocked} /></ControlSlot>}
      {c.superseded ? (
        <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center" data-testid="bq-superseded" role="alert">
          <p className="text-base font-bold text-amber-900">تم نقل هذه الجلسة إلى نافذة تحكم أخرى.</p>
          <p className="mt-2 text-sm text-amber-800">هذه النافذة لم تعد تتحكم باللعبة. أغلقها أو أعد تحميلها.</p>
        </div>
      ) : c.recoveryBlocked ? (
        <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center" data-testid="bq-recovery-blocked" role="alert">
          <p className="text-base font-bold text-amber-900">توجد جلسة غير منتهية تعمل في نافذة تحكم أخرى.</p>
          {c.takeoverAllowed ? (
            <>
              <p className="mt-2 text-sm text-amber-800">إذا كانت تلك النافذة مغلقة أو متوقفة، يمكنك استعادة الجلسة هنا. ستعود متوقفة مؤقتًا بنقاطها كما هي.</p>
              <button type="button" onClick={c.takeOverSession} className="mt-4 min-h-12 rounded-xl bg-teal-700 px-6 text-sm font-bold text-white" data-testid="bq-take-over">استعادة الجلسة هنا</button>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-800" data-testid="bq-take-over-unavailable">تلك الجلسة تخص مريضًا آخر غير المختار هنا. أغلق النافذة الأخرى، أو اختر المريض نفسه لاستعادتها.</p>
          )}
        </div>
      ) : c.runtime && c.view ? (
        <>
          {c.recovered && (c.view.session.lifecycle === "paused" || c.view.session.lifecycle === "stage-complete") && (
            <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900" data-testid="bq-recovered" role="status">
              تمت استعادة الجلسة بعد إعادة تحميل الصفحة، وتم الاحتفاظ بالمرحلة والنقاط. اللعبة متوقفة مؤقتًا حتى تضغط «{c.view.session.lifecycle === "paused" ? "استئناف" : "المرحلة التالية"}».
            </div>
          )}
          <ControlPanels runtime={c.runtime} view={c.view} production={production} />
        </>
      ) : <Spinner label="جاري التحقق من الجلسة..." />}
      <ControlSlot slot="dialogs"><EndSessionReasonSheet
        open={endOpen}
        onCancel={() => setEndOpen(false)}
        onConfirm={(selection) => {
          c.endWithReason(selection);
          setEndOpen(false);
        }}
      /></ControlSlot>
    </Shell>
  );
}

function LocalBalloonQuestControl() {
  const [view, setView] = useState<ControlView | null>(null);
  const [handle, setHandle] = useState<ControlHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [endOpen, setEndOpen] = useState(false);

  useEffect(() => {
    return mountControl({
      settings: PRODUCTION_DEFAULT_SETTINGS,
      onView: setView,
      onReady: (h) => {
        setHandle(h);
        setView(h.runtime.view());
      },
      onWaiting: setWaiting,
      onError: setError,
    });
  }, []);

  if (error) return <Shell><p className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p></Shell>;
  if (!handle || !view) return <Shell><Spinner label={waiting ? "بانتظار تحرير نافذة التحكم الأخرى…" : "جاري التحضير…"} /></Shell>;
  const production: ProductionPanelOptions = {
    requireChildName: false,
    childName: "",
    onChildNameChange: () => {},
    onRequestEnd: () => setEndOpen(true),
    showSimulator: SHOW_SIMULATOR,
    inputModes: PRODUCTION_INPUT_MODES,
  };
  return (
    <Shell>
      <ControlPanels runtime={handle.runtime} view={view} production={production} />
      <ControlSlot slot="dialogs"><EndSessionReasonSheet open={endOpen} onCancel={() => setEndOpen(false)} onConfirm={() => { handle.runtime.command({ type: "end" }); setEndOpen(false); }} /></ControlSlot>
    </Shell>
  );
}
