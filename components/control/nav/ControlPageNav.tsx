import Link from "next/link";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";
import styles from "./pageNav.module.css";

/** Real links keep navigation visible and pass through the shared active-game guard. */
export function ControlPageNav({ backHref, backLabel, children }: {
  backHref: string;
  backLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.bar} dir="rtl" data-control-page-nav>
      <nav className={styles.actions} aria-label="التنقل في الصفحة">
        <Link href={backHref} className={styles.back} aria-label={`رجوع إلى ${backLabel}`}>
          <span aria-hidden="true">→</span> رجوع
        </Link>
        {children}
      </nav>
      <ShumosBrandMark compact />
    </div>
  );
}
