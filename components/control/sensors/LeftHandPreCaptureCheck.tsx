"use client";

import { useCallback, useMemo, useState } from "react";
import { useLeftHandSensorRuntime } from "./SensorRuntimeProvider";
import { SensorHandCursor } from "./SensorHandCursor";

/**
 * PRE-CAPTURE SANITY CHECK (tonight's dual-sensor brief, section 9) — a
 * hard gate BEFORE LeftHandEnrollmentScreen may begin recording anything.
 * Confirms physical UP -> screen UP, DOWN -> DOWN, RIGHT -> RIGHT,
 * LEFT -> LEFT for THIS specific mounting, on THIS specific session, before
 * a single labeled sample is trusted enough to save. This is a HUMAN
 * confirmation, not an automated one — there is no camera/ground-truth
 * input this app has to verify "did the hand really move up" on its own,
 * so the therapist is asked to look at the on-screen cursor while moving
 * the physical sensor and explicitly attest whether it matched. Marking
 * ANY direction wrong blocks continuing (`onPassed` is never called) and
 * shows a concrete diagnosis hint instead — exactly the brief's "if wrong:
 * do not save mislabeled data; allow diagnosis before proceeding."
 *
 * Uses useLeftHandSensorRuntime() — entirely independent of RIGHT_HAND's
 * own runtime/state (see SensorRuntimeProvider.tsx) — so running this check
 * can never interact with or disturb an in-progress RIGHT_HAND session.
 */
const DIRECTIONS = [
  { id: "up", ar: "الأعلى" },
  { id: "down", ar: "الأسفل" },
  { id: "right", ar: "اليمين" },
  { id: "left", ar: "اليسار" },
] as const;

type DirectionId = (typeof DIRECTIONS)[number]["id"];
type DirectionResult = "pending" | "correct" | "wrong";

export function LeftHandPreCaptureCheck({ onPassed }: { onPassed: () => void }) {
  const { connected, pointer, sample } = useLeftHandSensorRuntime();
  const [results, setResults] = useState<Record<DirectionId, DirectionResult>>({ up: "pending", down: "pending", right: "pending", left: "pending" });
  const [activeIndex, setActiveIndex] = useState(0);

  const active = DIRECTIONS[activeIndex];
  const allCorrect = useMemo(() => DIRECTIONS.every((d) => results[d.id] === "correct"), [results]);

  const mark = useCallback(
    (result: DirectionResult) => {
      if (!active) return;
      setResults((prev) => ({ ...prev, [active.id]: result }));
      if (result === "correct" && activeIndex < DIRECTIONS.length - 1) {
        setActiveIndex((i) => i + 1);
      }
    },
    [active, activeIndex],
  );

  const retry = useCallback(() => {
    setResults({ up: "pending", down: "pending", right: "pending", left: "pending" });
    setActiveIndex(0);
  }, []);

  if (allCorrect) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-bold text-emerald-900">✓ تم التحقق من الاتجاهات الأربعة بنجاح.</p>
        <button type="button" onClick={onPassed} className="self-start rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">
          متابعة إلى الجلسة الموجّهة
        </button>
      </div>
    );
  }

  const anyWrong = DIRECTIONS.some((d) => results[d.id] === "wrong");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-bold text-slate-800">فحص الاتجاه قبل بدء التسجيل</p>
      <p className="text-xs text-slate-500">لا يمكن بدء جلسة اليد اليسرى قبل التأكد من أن حركة اليد الفعلية تطابق حركة المؤشر على الشاشة.</p>

      {!connected && <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">اربط حساس اليد اليسرى أولًا لبدء الفحص.</p>}

      {connected && !anyWrong && active && (
        <>
          <div className="relative h-56 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <SensorHandCursor pointer={pointer?.pointer ?? null} visible={connected && !!pointer} handRole="LEFT_HAND" />
          </div>
          <p className="text-base font-bold text-teal-700">حرّك يدك اليسرى الآن نحو {active.ar}</p>
          <p className="text-xs text-slate-500">راقب المؤشر أعلاه — هل تحرك فعليًا نحو {active.ar} على الشاشة؟</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => mark("correct")} disabled={!sample} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
              ✓ نعم، تحرك بشكل صحيح
            </button>
            <button type="button" onClick={() => mark("wrong")} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white">
              ✗ لا، لم يتحرك بشكل صحيح
            </button>
          </div>
        </>
      )}

      {anyWrong && (
        <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">لم يتم التأكد من الاتجاه — لن يتم حفظ أي بيانات حتى يتم إصلاح ذلك.</p>
          <ul className="list-inside list-disc text-xs font-semibold text-red-700">
            <li>تأكد أن السهم/العلامة +X على الحساس يشير نحو الأصابع.</li>
            <li>تأكد من أن الحساس مثبّت بإحكام ولا ينزلق أثناء الحركة.</li>
            <li>أعد الاتصال بالحساس إذا استمرت المشكلة، ثم أعد الفحص.</li>
          </ul>
          <button type="button" onClick={retry} className="self-start rounded-xl border border-red-300 px-4 py-2.5 text-xs font-bold text-red-700">
            إعادة الفحص من البداية
          </button>
        </div>
      )}

      <div className="flex gap-1.5">
        {DIRECTIONS.map((d) => (
          <span
            key={d.id}
            className={`h-2 flex-1 rounded-full ${results[d.id] === "correct" ? "bg-emerald-500" : results[d.id] === "wrong" ? "bg-red-500" : "bg-slate-200"}`}
          />
        ))}
      </div>
    </div>
  );
}
