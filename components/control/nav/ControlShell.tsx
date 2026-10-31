"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";
import { ControlIcon, type ControlIconName } from "@/components/control/ui/ControlIcon";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { shouldShowLogout } from "@/lib/control/topLevelNavigation";
import { GAME_REGISTRY } from "@/lib/games/registry";
import styles from "./shell.module.css";

const destinations: { href: string; label: string; icon: ControlIconName }[] = [
  { href: "/control", label: "الرئيسية", icon: "home" },
  { href: "/control/activities", label: "الأنشطة", icon: "activities" },
  { href: "/control/patients", label: "المرضى", icon: "patients" },
  { href: "/control/youtube", label: "يوتيوب", icon: "youtube" },
];

/** All links retain the document-level active-session guard. No session owner is mounted here. */
export function ControlShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = destinations.find(item => item.href === "/control" ? pathname === item.href : pathname.startsWith(item.href));
  const game = GAME_REGISTRY.find(item => item.route === pathname);
  const title = game?.nameAr ?? active?.label ?? (pathname.includes("visits") ? "الجلسة العلاجية" : pathname.includes("calibration") ? "معايرة الإسقاط" : "مساحة الأخصائي");
  return <div className={styles.shell} dir="rtl" lang="ar" data-control-shell>
    <a className={styles.skip} href="#control-content">تجاوز إلى المحتوى</a>
    <aside className={styles.sidebar} aria-label="القائمة الجانبية">
      <Link href="/control" className={styles.brand} aria-label="شموس كير · الرئيسية">
        <ShumosBrandMark /><span><strong>شموس كير</strong><small>التأهيل التفاعلي</small></span>
      </Link>
      <span className={styles.menuLabel}>مساحة العمل</span>
      <nav className={styles.nav} aria-label="التنقل الرئيسي">
        {destinations.map(item => <Link key={item.href} href={item.href} title={item.label} aria-current={active?.href === item.href ? "page" : undefined}>
          <ControlIcon name={item.icon} /><span>{item.label}</span>{item.icon === "activities" && <small>{GAME_REGISTRY.length}</small>}
        </Link>)}
      </nav>
      <div className={styles.sidebarBottom}>
        <div className={styles.careNote}><ControlIcon name="spark"/><strong>كل خطوة تصنع فرقًا</strong><span>مساحة للرعاية، وفرصة للتقدّم.</span></div>
        <Link href="/control/calibration" className={styles.utility} title="معايرة الإسقاط"><ControlIcon name="calibrate"/><span>معايرة الإسقاط</span></Link>
      </div>
    </aside>
    <div className={styles.body}>
      <header className={styles.topbar}>
        <div className={styles.location}><span>مساحة الأخصائي</span><i>/</i><strong>{title}</strong></div>
        <div className={styles.account}><span className={styles.avatar}><ControlIcon name="shield"/></span><span>حساب العيادة<small>{isRealtimeEnabled() ? "وصول الأخصائيين" : "نسخة محلية"}</small></span>
          {isRealtimeEnabled() && shouldShowLogout(pathname) && <StaffSignOut />}
        </div>
      </header>
      <div id="control-content" className={styles.content} tabIndex={-1} data-shell-content>{children}</div>
    </div>
  </div>;
}

function StaffSignOut() {
  const auth = useStaffAuth();
  const patient = usePatientContext();
  return <button type="button" data-control-logout aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={() => { patient.clearPatient(); auth.signOut(); }}><ControlIcon name="logout"/></button>;
}
