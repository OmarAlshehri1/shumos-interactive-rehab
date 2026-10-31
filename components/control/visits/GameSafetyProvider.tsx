"use client";
import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { ActivityRecoveryCard } from "@/components/control/live/ActivityRecoveryCard";
import { createContext, useContext, useEffect, useState, useRef } from "react";
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
import { dismissCompletedSession } from "@/lib/realtime/dismissCompletedSession";
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
}
const Context = createContext<Safety>({
  live: null,
  known: false,
  connected: false,
  canLeave: false,
  error: null,
  holdVisit: () => {},
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
  const [canonical, setLive] = useState<LiveSessionRecord | null>(null),
    [pending, setPending] = useState<LiveSessionRecord | null>(null),
    [known, setKnown] = useState(!realtime),
    [connected, setConnected] = useState(!realtime),
    [proof, setProof] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [blocked, setBlocked] = useState(false),
    [visitHold, holdVisit] = useState(false);
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
    (!visitHold || isUnstartedActivity(live)) &&
    (!pending || isUnstartedActivity(pending)) &&
    known &&
    connected &&
    (!live ||
      (!!uid && ownsUnstartedActivity(live, controlTabId(), uid)) ||
      (live.session.gameState === "SESSION_COMPLETE" &&
        (!live.patientId || proof === key)));
  const route = GAME_REGISTRY.find((g) => g.id === live?.gameId)?.route;
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
      if (
        !canLeave &&
        (route === pathname ||
          GAME_REGISTRY.some((g) => g.route === next.pathname))
      ) {
        event.preventDefault();
        event.stopPropagation();
        setBlocked(true);
      }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [canLeave, pathname, route]);
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
  const wrongGame =
    GAME_REGISTRY.some((g) => g.route === pathname) &&
    !!live &&
    route !== pathname &&
    !canLeave;
  const waiting = GAME_REGISTRY.some((g) => g.route === pathname) && !known;
  const open = blocked || wrongGame;
  // Empty owned previews are retired automatically; only recoverable clinical
  // work and another window's activity need an explicit recovery action.
  const savedComplete = live?.session.gameState === "SESSION_COMPLETE" && (!live.patientId || proof === key);
  const needsAction = !savedComplete && !(live && uid && ownsUnstartedActivity(live, controlTabId(), uid));
  return (
    <Context.Provider
      value={{ live, known, connected, canLeave, error, holdVisit }}
    >
      {!wrongGame && !waiting && children}
      {waiting && (
        <div
          className="fixed inset-0 grid place-items-center bg-slate-50"
          dir="rtl"
        >
          جاري التحقق من النشاط الحالي…
        </div>
      )}
      {route && route !== pathname && live && known && needsAction && !open && (
        <ActivityRecoveryCard record={live} connected={connected} />
      )}
      {open && (
        <ControlDialog open title="حفظ النشاط قبل الانتقال" onClose={() => setBlocked(false)} role="dialog">
            <h2 className="text-lg font-bold">حفظ النشاط قبل الانتقال</h2>
            <p className="text-sm leading-7">
              {!known || !connected
                ? "يلزم اتصال التحكم والتحقق من الحالة قبل بدء نشاط آخر."
                : canLeave
                  ? "تأكد حفظ النتيجة. يمكنك متابعة الانتقال."
                  : "أنهِ النشاط من أدواته الحالية، وانتظر تأكيد حفظ نتيجته. يمكنك حفظ جلسة جزئية عبر إنهاء النشاط المبكر حيث يتوفر. لن يُمسح النشاط عند الانتقال."}
            </p>
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                autoFocus
                className="min-h-11 rounded-xl bg-teal-700 px-4 text-white"
                onClick={() => {
                  setBlocked(false);
                  if (route && route !== pathname) router.push(route);
                }}
              >
                {route ? "العودة إلى النشاط" : "إلغاء الانتقال"}
              </button>
              {canLeave && (
                <button
                  className="min-h-11 rounded-xl bg-slate-100 px-4"
                  onClick={() => {
                    setBlocked(false);
                    router.push("/control/activities");
                  }}
                >
                  متابعة إلى المكتبة
                </button>
              )}
            </div>
          </ControlDialog>
      )}
    </Context.Provider>
  );
}
