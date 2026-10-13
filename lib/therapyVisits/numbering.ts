import { get, ref, update } from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { reviveVisit, safeKey, type Visit } from "./model";
export const NUMBERING_KEY = "_numbering";
export interface VisitNumbering {
  lastNumber: number;
  lastVisitId: string;
  byVisit: Record<string, string>;
  byNumber: Record<string, string>;
}
export function parseNumbering(raw: unknown): VisitNumbering {
  if (!raw)
    return { lastNumber: 0, lastVisitId: "", byVisit: {}, byNumber: {} };
  const r = { ...(raw as VisitNumbering) };
  if (reviveVisit(raw)) throw Error("تعارض في مرجع الترقيم؛ لم يُغيّر أي سجل.");
  if (
    !Number.isInteger(r.lastNumber) ||
    r.lastNumber < 1 ||
    typeof r.lastVisitId !== "string" ||
    !safeKey(r.lastVisitId) ||
    !r.byVisit ||
    !r.byNumber
  )
    throw Error("فهرس الجلسات غير صالح.");
  r.byVisit = Object.fromEntries(
    Object.entries(r.byVisit).filter(([, value]) => value !== null),
  );
  r.byNumber = Object.fromEntries(
    Object.entries(r.byNumber).filter(([, value]) => value !== null),
  );
  for (const [id, n] of Object.entries(r.byVisit))
    if (
      !safeKey(id) ||
      typeof n !== "string" ||
      !/^[1-9][0-9]{0,8}$/.test(n) ||
      r.byNumber[n] !== id ||
      Number(n) > r.lastNumber
    )
      throw Error("فهرس الجلسات غير صالح.");
  for (const [n, id] of Object.entries(r.byNumber))
    if (typeof id !== "string" || r.byVisit[id] !== n)
      throw Error("فهرس الجلسات غير صالح.");
  if (r.byVisit[r.lastVisitId] !== String(r.lastNumber))
    throw Error("فهرس الجلسات غير صالح.");
  return r;
}
export function chronologicalVisits(visits: Visit[]) {
  return [...visits].sort(
    (a, b) =>
      a.startedAt - b.startedAt ||
      (a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0),
  );
}
export function numberFor(
  index: VisitNumbering,
  visitId: string,
): number | null {
  return index.byVisit[visitId] ? Number(index.byVisit[visitId]) : null;
}
export function allocationPatch(
  patientId: string,
  visitId: string,
  index: VisitNumbering,
) {
  if (!safeKey(patientId) || !safeKey(visitId) || visitId === NUMBERING_KEY)
    throw Error("مرجع جلسة غير صالح");
  const n = index.lastNumber + 1,
    base = `therapyVisits/${patientId}/${NUMBERING_KEY}`;
  return {
    [`${base}/lastNumber`]: n,
    [`${base}/lastVisitId`]: visitId,
    [`${base}/byVisit/${visitId}`]: String(n),
    [`${base}/byNumber/${n}`]: visitId,
  };
}
/** Optimistic atomic updates + rule validation prevent duplicate numbers and phantom reservations. */
async function allocate(
  patientId: string,
  visitId: string,
  extra: Record<string, unknown> = {},
) {
  const db = getStaffDb(),
    target = ref(db, `therapyVisits/${patientId}/${NUMBERING_KEY}`);
  for (let attempt = 0; attempt < 8; attempt++) {
    const index = parseNumbering((await get(target)).val());
    if (index.byVisit[visitId]) return;
    try {
      await update(ref(db), {
        ...allocationPatch(patientId, visitId, index),
        ...extra,
      });
      return;
    } catch (error) {
      const current = parseNumbering((await get(target)).val());
      if (current.byVisit[visitId]) return; // The prior acknowledgement may have been lost.
      if (current.lastNumber === index.lastNumber) throw error;
    }
  }
  throw Error("تزامنت طلبات متعددة؛ حاول مجدداً.");
}
export async function ensurePatientVisitNumbers(patientId: string) {
  if (!safeKey(patientId)) throw Error("مريض غير صالح");
  const raw =
    (await get(ref(getStaffDb(), `therapyVisits/${patientId}`))).val() ?? {};
  const index = parseNumbering(raw[NUMBERING_KEY]);
  const visits = Object.values(raw)
    .map(reviveVisit)
    .filter((v): v is Visit => !!v && v.patientId === patientId);
  for (const v of chronologicalVisits(visits))
    if (!index.byVisit[v.visitId]) await allocate(patientId, v.visitId);
}
export async function createNumberedVisit(v: Visit, pointer: unknown) {
  if (!v.patientId) throw Error("يلزم مريض محفوظ");
  await ensurePatientVisitNumbers(v.patientId);
  const existing = reviveVisit(
    (
      await get(ref(getStaffDb(), `therapyVisits/${v.patientId}/${v.visitId}`))
    ).val(),
  );
  if (existing) {
    if (
      existing.ownerUid !== v.ownerUid ||
      existing.controlTabId !== v.controlTabId ||
      existing.startedAt !== v.startedAt
    )
      throw Error("مرجع جلسة مستخدم");
    return;
  }
  await allocate(v.patientId, v.visitId, {
    [`therapyVisits/${v.patientId}/${v.visitId}`]: v,
    [`activeTherapyVisits/${v.ownerUid}`]: pointer,
  });
}
