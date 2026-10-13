"use client";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { subscribePatientVisits } from "@/lib/therapyVisits/repository";
import {
  ensurePatientVisitNumbers,
  parseNumbering,
  NUMBERING_KEY,
  type VisitNumbering,
} from "@/lib/therapyVisits/numbering";
import type { Visit } from "@/lib/therapyVisits/model";
export function usePatientVisitHistory(patientId: string) {
  const auth = useStaffAuth();
  const [visits, setVisits] = useState<Visit[] | null>(null),
    [numbering, setNumbering] = useState<VisitNumbering>(() =>
      parseNumbering(null),
    ),
    [error, setError] = useState("");
  useEffect(() => {
    if (auth.phase !== "authorized") return;
    const fail = () =>
      setError("تعذّر تحميل سجل الجلسات. تحقق من الاتصال وصلاحيات الوصول.");
    const stops = [
      subscribePatientVisits(patientId, setVisits, fail),
      onValue(
        ref(getStaffDb(), `therapyVisits/${patientId}/${NUMBERING_KEY}`),
        (s) => {
          try {
            setNumbering(parseNumbering(s.val()));
          } catch {
            fail();
          }
        },
        fail,
      ),
    ];
    void ensurePatientVisitNumbers(patientId).catch(() =>
      setError(
        "تعذّر تثبيت أرقام الجلسات؛ تحقق من الاتصال والقواعد المعتمدة. لم تُغيّر هوية الزيارات.",
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [patientId, auth.phase]);
  return { visits, numbering, error };
}
