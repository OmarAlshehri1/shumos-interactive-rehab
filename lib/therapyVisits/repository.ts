import {
  get,
  onValue,
  ref,
  runTransaction,
  set,
  type Unsubscribe,
} from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import { createNumberedVisit } from "./numbering";
import { assertVisit, reviveVisit, safeKey, type Visit } from "./model";
export interface ActiveVisitPointer {
  patientId: string;
  visitId: string;
  controlTabId: string;
}
const path = (p: string, id: string) => {
  if (!safeKey(p) || !safeKey(id)) throw Error("مرجع جلسة غير صالح");
  return `therapyVisits/${p}/${id}`;
};
export async function createPatientVisit(v: Visit): Promise<void> {
  assertVisit(v);
  if (!v.patientId) throw Error("يلزم مريض محفوظ");
  const pointer: ActiveVisitPointer = {
    patientId: v.patientId,
    visitId: v.visitId,
    controlTabId: v.controlTabId,
  };
  await createNumberedVisit(v, pointer);
}
export function subscribeActiveVisit(
  uid: string,
  cb: (p: ActiveVisitPointer | null) => void,
  error: (e: Error) => void,
): Unsubscribe {
  return onValue(
    ref(getStaffDb(), `activeTherapyVisits/${uid}`),
    (s) => {
      const p = s.val();
      cb(
        p &&
          safeKey(p.patientId) &&
          safeKey(p.visitId) &&
          typeof p.controlTabId === "string"
          ? p
          : null,
      );
    },
    error,
  );
}
export function subscribeVisit(
  p: string,
  id: string,
  cb: (v: Visit | null) => void,
  error: (e: Error) => void,
): Unsubscribe {
  return onValue(
    ref(getStaffDb(), path(p, id)),
    (s) => cb(reviveVisit(s.val())),
    error,
  );
}
export function subscribePatientVisits(
  p: string,
  cb: (v: Visit[]) => void,
  error: (e: Error) => void,
): Unsubscribe {
  if (!safeKey(p)) throw Error("مريض غير صالح");
  return onValue(
    ref(getStaffDb(), `therapyVisits/${p}`),
    (s) =>
      cb(
        Object.values(s.val() ?? {})
          .map(reviveVisit)
          .filter((v): v is Visit => !!v && v.patientId === p)
          .sort(
            (a, b) =>
              b.startedAt - a.startedAt ||
              (a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0),
          ),
      ),
    error,
  );
}
/** The expected revision and tab prevent lost updates, double submissions and concurrent writers. */
export async function commitVisit(
  previous: Visit,
  next: Visit,
): Promise<Visit> {
  if (!previous.patientId) throw Error("الضيف مؤقت");
  const v = { ...next, revision: previous.revision + 1 };
  assertVisit(v);
  if (
    v.visitId !== previous.visitId ||
    v.patientId !== previous.patientId ||
    v.ownerUid !== previous.ownerUid ||
    v.controlTabId !== previous.controlTabId ||
    v.startedAt !== previous.startedAt
  )
    throw Error("لا يمكن تغيير هوية الجلسة");
  for (const [id, e] of Object.entries(previous.entries))
    if (
      e.kind === "game" &&
      (!v.entries[id] ||
        v.entries[id].kind !== "game" ||
        (v.entries[id] as { gameId: string }).gameId !== e.gameId ||
        (v.entries[id] as { linkedAt: number }).linkedAt !== e.linkedAt)
    )
      throw Error("لا يمكن حذف مراجع النتائج");
  for (const [id, e] of Object.entries(v.entries))
    if (e.kind === "game" && !previous.entries[id]) {
      const result = await getSessionHistoryRecord(v.patientId!, e.sessionId);
      if (
        !result ||
        result.gameId !== e.gameId ||
        result.createdByUid !== v.ownerUid ||
        result.startedAt === null ||
        result.startedAt < v.startedAt
      )
        throw Error("لم يتأكد حفظ نتيجة النشاط لهذه الجلسة");
      // An immutable claim remains authoritative even if a visit presentation is edited later.
      const claimRef = ref(
        getStaffDb(),
        `visitResultClaims/${v.patientId}/${id}`,
      );
      const claim = await get(claimRef);
      if (claim.exists() && claim.val() !== v.visitId)
        throw Error("النتيجة مرتبطة بزيارة أخرى");
      if (!claim.exists()) {
        try {
          await set(claimRef, v.visitId);
        } catch (error) {
          const confirmed = await get(claimRef);
          if (confirmed.val() !== v.visitId) throw error;
        }
      }
    }
  const target = ref(getStaffDb(), path(previous.patientId, previous.visitId));
  await get(target);
  const result = await runTransaction(
    target,
    (raw) => {
      const current = reviveVisit(raw);
      return current?.revision === previous.revision &&
        current.controlTabId === previous.controlTabId
        ? v
        : undefined;
    },
    { applyLocally: false },
  );
  if (!result.committed)
    throw Error("تغيّرت الجلسة في نافذة أخرى. انتظر المزامنة وحاول مجددًا.");
  return reviveVisit(result.snapshot.val()) ?? v;
}

export function subscribeVisitResultClaims(
  p: string,
  cb: (v: Record<string, string>) => void,
  error: (e: Error) => void,
): Unsubscribe {
  if (!safeKey(p)) throw Error("مريض غير صالح");
  return onValue(
    ref(getStaffDb(), `visitResultClaims/${p}`),
    (s) => cb(s.val() ?? {}),
    error,
  );
}
