"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { onValue, ref } from "firebase/database";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { controlTabId } from "@/lib/liveGame/ownership";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { subscribeToPatient } from "@/lib/patients/patientRepository";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import {
  assertVisit,
  blankEvaluation,
  reviveVisit,
  type Visit,
} from "@/lib/therapyVisits/model";
import {
  createPatientVisit,
  commitVisit,
  subscribeActiveVisit,
  subscribeVisit,
  type ActiveVisitPointer,
} from "@/lib/therapyVisits/repository";
import {
  historyKeyForLive,
  isUnstartedActivity,
  ownedByTab,
} from "@/lib/therapyVisits/gameSafety";
import { useGameSafety } from "./GameSafetyProvider";

const GUEST_KEY = "shumos.control.guestVisit.v1";
interface Value {
  visit: Visit | null;
  now: number;
  busy: boolean;
  error: string | null;
  restored: boolean;
  writable: boolean;
  start: (v: Visit) => Promise<void>;
  change: (fn: (v: Visit) => Visit) => Promise<void>;
  dismiss: () => void;
}
const Context = createContext<Value | null>(null);
export function useVisit() {
  const c = useContext(Context);
  if (!c) throw Error("Visit provider missing");
  return c;
}
export function VisitProvider({ children }: { children: React.ReactNode }) {
  const auth = useStaffAuth(),
    realtime = isRealtimeEnabled(),
    patient = usePatientContext(),
    safety = useGameSafety();
  const [visit, setVisit] = useState<Visit | null>(null),
    [pointer, setPointer] = useState<ActiveVisitPointer | null>(null),
    [restored, setRestored] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [now, setNow] = useState(() => Date.now());
  const offset = useRef(0),
    current = useRef(visit),
    lock = useRef(false);
  useEffect(() => {
    current.current = visit;
  }, [visit]);
  const uid = realtime ? auth.uid : "local-demo";
  const writable =
    !!visit &&
    visit.ownerUid === uid &&
    visit.controlTabId === controlTabId() &&
    (!visit.patientId || safety.connected);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!realtime || auth.phase !== "authorized") return;
    return onValue(ref(getStaffDb(), ".info/serverTimeOffset"), (s) => {
      offset.current = typeof s.val() === "number" ? s.val() : 0;
    });
  }, [auth.phase, realtime]);
  useEffect(() => {
    if (realtime && auth.phase !== "authorized") return;
    // A microtask keeps restored sessionStorage outside server rendering.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const guest = reviveVisit(
          JSON.parse(sessionStorage.getItem(GUEST_KEY) ?? "null"),
        );
        if (guest?.ownerUid === uid && guest.controlTabId === controlTabId())
          setVisit(guest);
        else sessionStorage.removeItem(GUEST_KEY);
      } catch {
        sessionStorage.removeItem(GUEST_KEY);
      }
      if (!realtime) setRestored(true);
    });
    const unsubscribe =
      realtime && uid
        ? subscribeActiveVisit(
            uid,
            (p) => {
              setPointer(p);
              setRestored(true);
            },
            () => {
              setError(
                "تعذّر تحميل الجلسة المحفوظة. تحقّق من الاتصال وقواعد الوصول.",
              );
              setRestored(false);
            },
          )
        : undefined;
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [realtime, auth.phase, uid]);
  useEffect(() => {
    if (!pointer) return;
    return subscribeVisit(
      pointer.patientId,
      pointer.visitId,
      (v) => {
        if (
          v &&
          (!v.endedAt || current.current?.visitId === v.visitId) &&
          (current.current?.visitId !== v.visitId ||
            v.revision >= current.current.revision)
        ) {
          setVisit(v);
          current.current = v;
        }
      },
      () => setError("تعذّر قراءة الجلسة. لم تُفقد بياناتها؛ أعد الاتصال."),
    );
  }, [pointer]);
  // A visit pins the canonical patient selection; guest selection explicitly removes all permanent patient binding.
  useEffect(() => {
    if (!visit || visit.endedAt || visit.controlTabId !== controlTabId())
      return;
    if (!visit.patientId) {
      if (patient.selectedPatient || patient.walkInName !== visit.childName)
        patient.selectWalkIn(visit.childName);
      return;
    }
    if (patient.selectedPatient?.patientId === visit.patientId) return;
    return subscribeToPatient(visit.patientId, (p) => {
      if (p)
        patient.selectPatient({
          patientId: p.patientId,
          patientNumber: p.patientNumber,
          firstName: p.firstName,
        });
    });
  }, [visit, patient]);
  const start = useCallback(
    async (v: Visit) => {
      if (
        lock.current ||
        !restored ||
        (current.current && !current.current.endedAt)
      )
        throw Error("توجد جلسة قائمة أو لم يكتمل التحقق منها");
      if (
        v.ownerUid !== uid ||
        v.controlTabId !== controlTabId() ||
        !safety.canLeave
      )
        throw Error("أنهِ النشاط الحالي وتأكد من حفظه أولًا");
      lock.current = true;
      setBusy(true);
      setError(null);
      try {
        assertVisit(v);
        if (v.patientId) await createPatientVisit(v);
        else sessionStorage.setItem(GUEST_KEY, JSON.stringify(v));
        current.current = v;
        setVisit(v);
      } catch (e) {
        setError(e instanceof Error ? e.message : "تعذّر بدء الجلسة");
        throw e;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [restored, uid, safety.canLeave],
  );
  const change = useCallback(
    async (fn: (v: Visit) => Visit) => {
      const previous = current.current;
      if (!previous || lock.current) throw Error("انتظر اكتمال الحفظ");
      if (
        previous.ownerUid !== uid ||
        previous.controlTabId !== controlTabId() ||
        (previous.patientId && !safety.connected)
      )
        throw Error("الجلسة في نافذة أخرى أو الاتصال غير متاح");
      lock.current = true;
      setBusy(true);
      setError(null);
      try {
        const next = {
          ...fn(previous),
          updatedAt: Date.now() + offset.current,
        };
        assertVisit(next);
        const saved = previous.patientId
          ? await commitVisit(previous, next)
          : { ...next, revision: previous.revision + 1 };
        if (!previous.patientId)
          sessionStorage.setItem(GUEST_KEY, JSON.stringify(saved));
        current.current = saved;
        setVisit(saved);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "تعذّر الحفظ. احتفظ بالتعديلات وأعد المحاولة.",
        );
        throw e;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [uid, safety.connected],
  );
  const holdVisit = safety.holdVisit;
  useEffect(() => {
    const live = safety.live,
      key = live ? historyKeyForLive(live) : null;
    const hold = !!(
      visit &&
      !visit.endedAt &&
      live &&
      !isUnstartedActivity(live) &&
      live.patientId === visit.patientId &&
      live.session.createdAt >= visit.startedAt &&
      ownedByTab(live, controlTabId()) &&
      key &&
      !visit.entries[key]
    );
    holdVisit(hold);
    return () => holdVisit(false);
  }, [visit, safety.live, holdVisit]);
  // Only the current tab's completed game and this visit's pinned patient may be linked. No history is re-saved here.
  useEffect(() => {
    const live = safety.live;
    if (
      !visit ||
      visit.endedAt ||
      !writable ||
      !live ||
      live.session.gameState !== "SESSION_COMPLETE" ||
      live.patientId !== visit.patientId ||
      !ownedByTab(live, controlTabId())
    )
      return;
    const key = historyKeyForLive(live);
    if (!key || visit.entries[key]) return;
    let cancelled = false;
    const link = async () => {
      if (lock.current) return;
      const result = visit.patientId
        ? await getSessionHistoryRecord(visit.patientId, key)
        : null;
      if (
        cancelled ||
        (visit.patientId &&
          (!result ||
            result.createdByUid !== visit.ownerUid ||
            result.startedAt === null ||
            result.startedAt < visit.startedAt ||
            result.gameId !== live.gameId)) ||
        (!visit.patientId && live.session.createdAt < visit.startedAt)
      )
        return;
      if (!live.gameId) return;
      await change((v) =>
        v.entries[key]
          ? v
          : {
              ...v,
              entries: {
                ...v.entries,
                [key]: {
                  kind: "game",
                  sessionId: key,
                  gameId: live.gameId!,
                  linkedAt: Date.now() + offset.current,
                  evaluation: blankEvaluation(
                    v.ownerUid,
                    Date.now() + offset.current,
                  ),
                },
              },
            },
      );
    };
    void link().catch(() => {});
    const timer = setInterval(() => void link().catch(() => {}), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visit, safety.live, writable, change]);
  const dismiss = () => {
    if (current.current && !current.current.endedAt) return;
    sessionStorage.removeItem(GUEST_KEY);
    current.current = null;
    setVisit(null);
    patient.clearPatient();
  };
  return (
    <Context.Provider
      value={{
        visit,
        now,
        busy,
        error,
        restored,
        writable,
        start,
        change,
        dismiss,
      }}
    >
      {children}
    </Context.Provider>
  );
}
