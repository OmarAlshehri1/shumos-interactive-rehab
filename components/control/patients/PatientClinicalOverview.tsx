"use client";
import Link from "next/link";
import type { usePatientVisitHistory } from "@/components/control/visits/usePatientVisitHistory";
import { numberFor } from "@/lib/therapyVisits/numbering";
import styles from "./profile.module.css";

/** Presentation of stored visit ratings and notes only; no inferred clinical measurements. */
export function PatientClinicalOverview({ patientId, history }: { patientId: string; history: ReturnType<typeof usePatientVisitHistory> }) {
  const { visits, numbering, error } = history;
  const ordered = visits ? [...visits].sort((a,b) => a.startedAt - b.startedAt) : [];
  const latest = ordered.at(-1);
  const rated = ordered.filter(v => v.overallRating !== null).slice(-12);
  const latestRating = rated.at(-1)?.overallRating;
  return <section className={styles.overview} aria-label="ملخص المتابعة">
    <h2>ملخص المتابعة</h2>
    {error ? <p role="alert">{error}</p> : <>
      <dl><div><dt>الجلسات المسجلة</dt><dd>{visits === null ? "…" : visits.length.toLocaleString("ar-SA")}</dd></div><div><dt>آخر تقييم مسجل</dt><dd className={styles.rating}>{latestRating == null ? "—" : `${latestRating} / 5`}</dd></div></dl>
      {rated.length > 0 && <div><div className={styles.trend} aria-label="التقييمات المسجلة في آخر ١٢ جلسة مقيّمة">{rated.map(v => <Link key={v.visitId} href={`/control/patients/${patientId}/visits/${v.visitId}`} aria-label={`الجلسة ${numberFor(numbering,v.visitId) ?? ""} · تقييم ${v.overallRating} من 5`} title={`تقييم ${v.overallRating} من 5`}><i style={{height:`${Math.max(6, v.overallRating! / 5 * 100)}%`}}/></Link>)}</div><p className={styles.footnote}>تقييم الأخصائي · حتى آخر ١٢ جلسة مقيّمة</p></div>}
      {latest ? <div className={styles.latest}><strong>آخر جلسة · {latest.title}</strong><span>{latest.therapistName} · {new Date(latest.startedAt).toLocaleDateString("ar-SA",{calendar:"gregory",day:"numeric",month:"short"})}</span>{(latest.finalNotes || latest.initialNotes) && <p>{latest.finalNotes || latest.initialNotes}</p>}<Link className={styles.footnote} href={`/control/patients/${patientId}/visits/${latest.visitId}`}>مراجعة الجلسة ←</Link></div> : visits !== null && <p className={styles.footnote}>ابدأ جلسة علاجية لتوثيق الأنشطة والتقييمات.</p>}
    </>}
  </section>;
}
