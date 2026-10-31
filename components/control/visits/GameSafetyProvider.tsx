"use client";
import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { ActivityRecoveryCard } from "@/components/control/live/ActivityRecoveryCard";
import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { SwitchFinalizerRegistry, hasDirectSwitchAdapter, type GameSwitchFinalizer } from "@/lib/liveGame/switchFinalizer";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { getPatient } from "@/lib/patients/patientRepository";
import { get, ref } from "firebase/database";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";
import { usePathname, useRouter } from "next/navigation";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  subscribeToLiveSession,
  discardUnstartedPreview,
  subscribeToConnectionStatus,
} from "@/lib/realtime/sessionRepository";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { dismissCompletedSession, canResumeSession } from "@/lib/realtime/dismissCompletedSession";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import {
  confirmedLiveResult,
  historyKeyForLive,
  isUnstartedActivity,
  ownsUnstartedActivity,
} from "@/lib/therapyVisits/gameSafety";

import { observePublishIntent } from "@/lib/realtime/publishIntent";

import { stopOwnedVideo } from "@/lib/youtube/repository";
import { controlTabId } from "@/lib/liveGame/ownership";

interface Safety {
  live: LiveSessionRecord | null;
  known: boolean;
  connected: boolean;
  canLeave: boolean;
  error: string | null;
  holdVisit: (hold: boolean) => void;
  queuedDestination: string | null;
  cancelQueuedSwitch: () => void;
  registerFinalizer: (adapter: GameSwitchFinalizer) => () => void;
  finalizingSwitch: boolean;
  setVisitReady: (ready: boolean) => void;
  blockNativeMount: boolean;
}
const Context = createContext<Safety>({
  live: null,
  known: false,
  connected: false,
  canLeave: false,
  error: null,
  holdVisit: () => {},
  queuedDestination: null,
  cancelQueuedSwitch: () => {},
  registerFinalizer: () => () => {},
  finalizingSwitch: false,
  setVisitReady: () => {},
  blockNativeMount: false,
});
export const useGameSafety = () => useContext(Context);
export function GameSafetyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const realtime = isRealtimeEnabled(),
    pathname = usePathname(),
    router = useRouter();
  const { uid } = useStaffAuth();
  const patient = usePatientContext();
  const [canonical, setLive] = useState<LiveSessionRecord | null>(null),
    [pending, setPending] = useState<LiveSessionRecord | null>(null),
    [known, setKnown] = useState(!realtime),
    [connected, setConnected] = useState(!realtime),
    [proof, setProof] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [blocked, setBlocked] = useState(false),
    [visitHold, holdVisit] = useState(false);
  const [visitReady, setVisitReady] = useState(!realtime);
  const [requestedSwitch, setRequestedSwitch] = useState<{
    href: string; sessionId: string; activityKey: string | null; ownerUid: string;
  } | null>(null);
  const [finalizingSwitch, setFinalizingSwitch] = useState(false);
  const [finalizers] = useState(() => new SwitchFinalizerRegistry());
  const automaticEnd = useRef<{ sessionId: string; activityKey: string | null } | null>(null);
  const facts = useRef({ live: null as LiveSessionRecord | null, key: null as string | null, connected: false });
  const registerFinalizer = useCallback((adapter: GameSwitchFinalizer) => {
    const stop = finalizers.register(adapter);
    queueMicrotask(() => {
      const intent = automaticEnd.current, current = facts.current;
      if (!intent || !current.live || !current.connected || !finalizers.matches(current.live)) return;
      if (intent.sessionId !== current.live.sessionId || intent.activityKey !== current.key) return;
      automaticEnd.current = null;
      if (!canResumeSession(getStaffDb(), current.live)) return;
      try { finalizers.finalize(current.live); }
      catch { setError("تعذّر إنهاء النشاط المستعاد. لم يتغيّر تقدمه."); setBlocked(true); setFinalizingSwitch(false); }
    });
    return stop;
  }, [finalizers]);
  const cancelSwitch = () => { automaticEnd.current = null; setRequestedSwitch(null); setBlocked(false); setFinalizingSwitch(false); };
  const live = pending ?? canonical;
  const lastRoute = useRef(pathname);
  useEffect(() => {
    const previous = lastRoute.current;
    lastRoute.current = pathname;
    if (realtime && previous === "/control/youtube" && pathname !== previous) {
      void stopOwnedVideo(getStaffDb(), controlTabId()).catch(() => setError("تعذّر إغلاق الفيديو. سيتوقف العرض عند انتهاء إشارة التحكم."));
    }
  }, [pathname, realtime]);
  useEffect(
    () =>
      observePublishIntent((event) => {
        if (!event.acknowledged) setPending(event.record);
        else
          setPending((current) =>
            current?.sessionId === event.record.sessionId &&
            current.revision <= event.record.revision
              ? null
              : current,
          );
      }),
    [],
  );
  const key = live
    ? `${live.gameId}:${live.patientId}:${historyKeyForLive(live)}`
    : null;
  const canLeave =
    visitReady &&
    (!visitHold || isUnstartedActivity(live)) &&
    (!pending || isUnstartedActivity(pending)) &&
    known &&
    connected &&
    (!live ||
      (!!uid && ownsUnstartedActivity(live, controlTabId(), uid)) ||
      (live.session.gameState === "SESSION_COMPLETE" &&
        (!live.patientId || proof === key)));
  const route = GAME_REGISTRY.find((g) => g.id === live?.gameId)?.route;
  useEffect(() => { facts.current = { live, key, connected }; }, [live, key, connected]);
  useEffect(() => {
    if (!finalizingSwitch || !requestedSwitch) return;
    const timer = setTimeout(() => {
      if (!automaticEnd.current) return; // Native end was accepted; its normal save/review guards remain authoritative.
      automaticEnd.current = null;
      setFinalizingSwitch(false);
      setBlocked(true);
      setError("تعذّر تجهيز الإنهاء المباشر لهذه الجلسة. لم تُحذف بياناتها؛ استخدم أدوات النشاط أو أعد المحاولة بعد التحقق من الاتصال.");
    }, 15000);
    return () => clearTimeout(timer);
  }, [finalizingSwitch, requestedSwitch]);
  useEffect(() => {
    if (!requestedSwitch || !canLeave || requestedSwitch.ownerUid !== uid) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRequestedSwitch(null);
      setFinalizingSwitch(false);
      setBlocked(false);
      // A removed/replaced activity or a new run invalidates this intent.
      // Only the original live activity's verified completion can continue it.
      if (live?.sessionId === requestedSwitch.sessionId && key === requestedSwitch.activityKey)
        router.push(requestedSwitch.href);
    });
    return () => { cancelled = true; };
  }, [requestedSwitch, canLeave, uid, live, key, router]);
  // Includes direct route entry after a reload: obsolete empty setups never
  // require an explicit recovery action. Transactions recheck Start/ownership.
  useEffect(() => {
    if (!realtime || !known || !connected || !live || pending || route === pathname || !uid) return;
    if (ownsUnstartedActivity(live, controlTabId(), uid)) {
      void discardUnstartedPreview(getStaffDb(), live.sessionId, controlTabId())
        .catch(() => setError("تعذّر إغلاق المعاينة. تحقق من الاتصال."));
    } else if (canLeave && live.session.gameState === "SESSION_COMPLETE") {
      void dismissCompletedSession(getStaffDb(), live.sessionId, live.revision)
        .catch(() => setError("تعذّر إغلاق العرض السابق. لم تتغير النتائج المحفوظة."));
    }
  }, [realtime, known, connected, live, pending, route, pathname, uid, canLeave]);
  useEffect(() => {
    if (!realtime) return;
    const a = subscribeToLiveSession(getStaffDb(), (v) => {
        setLive(v);
        setKnown(true);
      }),
      b = subscribeToConnectionStatus(getStaffDb(), (v) =>
        setConnected(v === "connected"),
      );
    return () => {
      a();
      b();
    };
  }, [realtime]);
  useEffect(() => {
    if (
      !live?.patientId ||
      live.session.gameState !== "SESSION_COMPLETE" ||
      !connected
    )
      return;
    let cancelled = false;
    const id = historyKeyForLive(live);
    if (!id) return;
    const check = () =>
      void getSessionHistoryRecord(live.patientId!, id)
        .then((result) => {
          if (!cancelled && confirmedLiveResult(live, result)) {
            setProof(key);
            setError(null);
          }
        })
        .catch(() => {
          if (!cancelled)
            setError(
              "تعذّر تأكيد حفظ النتيجة. ابقَ في النشاط وأعد محاولة الحفظ من أدواته.",
            );
        });
    check();
    const timer = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, key, connected]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const a = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!a || event.defaultPrevented || a.target === "_blank") return;
      const next = new URL(a.href, location.href);
      if (next.origin !== location.origin || next.pathname === pathname) return;
      const safeEmptyEntry = known && connected && (!live || (!!uid && ownsUnstartedActivity(live, controlTabId(), uid)));
      if (
        !canLeave && !safeEmptyEntry &&
        (route === pathname ||
          GAME_REGISTRY.some((g) => g.route === next.pathname))
      ) {
        event.preventDefault();
        event.stopPropagation();
        setRequestedSwitch(live && uid ? {
          href: `${next.pathname}${next.search}${next.hash}`,
          sessionId: live.sessionId,
          activityKey: key,
          ownerUid: uid,
        } : null);
        setFinalizingSwitch(false);
        setBlocked(true);
      }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [canLeave, pathname, route, live, key, uid, known, connected]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (live && !canLeave) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [live, canLeave]);
  // Browser back/direct route entry must not mount a different game while a previous result is recoverable.
  const foreignOwner = !!live && !!uid && !canResumeSession(getStaffDb(), live);
  const wrongGame =
    GAME_REGISTRY.some((g) => g.route === pathname) &&
    !!live &&
    (route !== pathname || foreignOwner) &&
    !canLeave &&
    !(uid && ownsUnstartedActivity(live, controlTabId(), uid));
  const waiting = GAME_REGISTRY.some((g) => g.route === pathname) && (!known || !visitReady);
  const open = blocked || (wrongGame && !finalizingSwitch);
  // Empty owned previews are retired automatically; only recoverable clinical
  // work and another window's activity need an explicit recovery action.
  const savedComplete = live?.session.gameState === "SESSION_COMPLETE" && (!live.patientId || proof === key);
  const needsAction = !savedComplete && !(live && uid && ownsUnstartedActivity(live, controlTabId(), uid));
  const nativeEndAvailable = !!live && !foreignOwner && (live.session.gameState === "SESSION_COMPLETE" || finalizers.matches(live) || (route !== pathname && hasDirectSwitchAdapter(live)));
  const finalizeAndSwitch = async () => {
    if (!live || !uid || !known || !connected || !canResumeSession(getStaffDb(), live)) return;
    // A refreshed/deep-linked game has no intercepted click, but is still an explicit destination.
    const request = requestedSwitch ?? (wrongGame ? {
      href: `${pathname}${location.search}${location.hash}`, sessionId: live.sessionId, activityKey: key, ownerUid: uid,
    } : null);
    if (!request) return;
    if (live.sessionId !== request.sessionId || key !== request.activityKey) {
      setError("تغيّر النشاط الحالي. اضغط رجوع وتحقق من حالته قبل الانتقال.");
      return;
    }
    if (!nativeEndAvailable) return;
    if (!requestedSwitch) setRequestedSwitch(request);
    setFinalizingSwitch(true);
    setBlocked(false);
    try {
      if (live.session.gameState !== "SESSION_COMPLETE" && !finalizers.matches(live)) {
        if (!route || !hasDirectSwitchAdapter(live) || route === pathname) {
          setError("هذا النشاط لا يدعم الإنهاء المباشر في حالته الحالية. لم يتغير تقدمه.");
          setFinalizingSwitch(false);
          setBlocked(true);
          return;
        }
        automaticEnd.current = { sessionId: live.sessionId, activityKey: key };
        const activeVisit = (await get(ref(getStaffDb(), `activeTherapyVisits/${uid}`))).val() as { patientId?: string; controlTabId?: string } | null;
        if (activeVisit && (activeVisit.patientId !== live.patientId || activeVisit.controlTabId !== controlTabId()))
          throw Error("conflicting-visit-owner");
        if (live.patientId) {
          const original = await getPatient(live.patientId);
          if (!original) throw Error("missing-patient");
          if (automaticEnd.current?.sessionId !== live.sessionId) return;
          if (!facts.current.live || facts.current.live.sessionId !== live.sessionId || facts.current.key !== key || !canResumeSession(getStaffDb(), facts.current.live))
            throw Error("activity-changed");
          patient.selectPatient(original);
        } else patient.selectWalkIn(live.session.config.childFirstName);
        if (!automaticEnd.current) return;
        router.push(route); // Recover through the existing native paused lifecycle; its registration ends it.
      } else if (live.session.gameState !== "SESSION_COMPLETE") {
        finalizers.finalize(live);
      }
      setFinalizingSwitch(true);
      setBlocked(false);
      setError(null);
    } catch {
      automaticEnd.current = null;
      setFinalizingSwitch(false);
      setBlocked(true);
      setError("تعذّر إنهاء النشاط. بقيت بياناته في مكانها؛ تحقق من الاتصال وأعد المحاولة.");
    }
  };
  return (
    <Context.Provider
      value={{ live, known, connected, canLeave, error, holdVisit,
        queuedDestination: requestedSwitch?.href ?? null,
        cancelQueuedSwitch: cancelSwitch, registerFinalizer, finalizingSwitch,
        setVisitReady, blockNativeMount: wrongGame || waiting }}
    >
      {children}
      {route && route !== pathname && live && known && needsAction && !open && !finalizingSwitch && (
        <ActivityRecoveryCard record={live} connected={connected} />
      )}
      {open && (
        <ControlDialog open title="الانتقال إلى نشاط جديد" onClose={() => { cancelSwitch(); if (wrongGame) router.push("/control/activities"); }} role="dialog">
          <div className="flex justify-center"><ShumosBrandMark compact /></div>
          <h2 className="text-center text-lg font-bold">الانتقال إلى نشاط جديد</h2>
          <p className="text-sm leading-7">
            {!known || !connected
              ? "يلزم الاتصال والتحقق من الحالة قبل إنهاء النشاط وفتح الجديدة."
              : foreignOwner ? "النشاط الحالي يخص حسابًا آخر. لن يُنهى أو يُستبدل من حساب المدير."
              : !nativeEndAvailable
                ? "هذا النشاط لا يتيح الإنهاء المباشر في حالته الحالية. احتفظنا بتقدمه؛ يلزم استخدام أدواته الأصلية لإنهائه وحفظه."
                : "سننهي النشاط السابق من أدواته الأصلية ونحفظ نتيجته قبل الانتقال. راجع التقييم إذا ظهر؛ لن تُضاف أي تقييمات تلقائيًا."}
          </p>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <button autoFocus className="min-h-11 rounded-xl bg-teal-700 px-4 text-white disabled:opacity-40"
              disabled={(!requestedSwitch && !wrongGame) || !nativeEndAvailable || !connected || !known}
              onClick={finalizeAndSwitch}>إنهاء السابق وفتح الجديدة</button>
            <button className="min-h-11 rounded-xl bg-slate-100 px-4" onClick={() => {
              cancelSwitch(); if (wrongGame) router.push("/control/activities");
            }}>رجوع</button>
          </div>
        </ControlDialog>
      )}
    </Context.Provider>
  );
}
