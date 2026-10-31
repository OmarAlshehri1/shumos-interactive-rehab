import type { ReactNode } from "react";
import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import styles from "./clinicalHeader.module.css";

/** Compact context and identity, shared by patient and therapy-visit pages. */
export function ClinicalPageHeader({ backHref, backLabel, context, children }: {
  backHref: string; backLabel: string; context: string; children: ReactNode;
}) {
  return <header className={styles.header}>
    <div className={styles.bar}><ControlPageNav backHref={backHref} backLabel={backLabel}/><span>{context}</span></div>
    <div className={styles.identity}>{children}</div>
  </header>;
}
