"use client";
import Link from "next/link";
import { usePatientVisitHistory } from "./usePatientVisitHistory";
import { numberFor } from "@/lib/therapyVisits/numbering";
import { elapsedMs, formatClock } from "@/lib/therapyVisits/model";
import { visitStatus, missing } from "@/lib/therapyVisits/clinicalSummary";
import styles from "./visitHistory.module.css";
export function PatientVisitHistory({ patientId }: { patientId: string }) {
  const { visits, numbering, error } = usePatientVisitHistory(patientId);
  return (
    <section className={styles.section} aria-label="الجلسات العلاجية">
      <h2>الجلسات العلاجية</h2>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {visits === null ? (
        <p className={styles.muted}>جارٍ تحميل الجلسات…</p>
      ) : visits.length === 0 ? (
        <p className={styles.muted}>لا توجد جلسات علاجية مسجلة.</p>
      ) : (
        <>
          <div className={styles.list}>
            {visits.map((v) => {
              const number = numberFor(numbering, v.visitId);
              return (
                <Link
                  key={v.visitId}
                  href={`/control/patients/${patientId}/visits/${v.visitId}`}
                  className={styles.row}
                >
                  <div className={styles.top}>
                    <strong className={styles.number}>
                      {number === null
                        ? "رقم الجلسة غير مسجل"
                        : `الجلسة ${number}`}
                    </strong>
                    <span className={styles.status}>{visitStatus(v)}</span>
                  </div>
                  <h3 className={styles.title}>{v.title}</h3>
                  <div className={styles.meta}>
                    <time dateTime={new Date(v.startedAt).toISOString()}>
                      {new Date(v.startedAt).toLocaleDateString("ar-SA", {
                        calendar: "gregory",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <span>{v.therapistName || missing}</span>
                    <span>
                      المدة:{" "}
                      {formatClock(elapsedMs(v, v.endedAt ?? v.updatedAt))}
                      {!v.endedAt ? " مسجلة حتى آخر تحديث" : ""}
                    </span>
                    <span className={styles.rating}>
                      {v.overallRating === null
                        ? "التقييم غير مسجل"
                        : `★ ${v.overallRating}/5`}
                    </span>
                    <span>فتح التفاصيل ←</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <details className={styles.separator}>
            <summary>التقييمات السابقة وتواريخها</summary>
            <div className={styles.trend}>
              {[...visits].reverse().map((v) => (
                <Link
                  key={v.visitId}
                  href={`/control/patients/${patientId}/visits/${v.visitId}`}
                >
                  <strong>
                    الجلسة {numberFor(numbering, v.visitId) ?? "—"}
                  </strong>
                  <span>
                    {new Date(v.startedAt).toLocaleDateString("ar-SA", {
                      calendar: "gregory",
                    })}
                  </span>
                  <p>
                    {v.overallRating === null
                      ? missing
                      : `★ ${v.overallRating}/5`}
                  </p>
                </Link>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
