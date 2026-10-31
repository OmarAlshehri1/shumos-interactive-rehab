"use client";

import { useState, type FormEvent } from "react";
import { requestStaffPasswordReset, type StaffSignInError } from "@/lib/realtime/staffAuthClient";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";
import { ControlIcon } from "@/components/control/ui/ControlIcon";
import styles from "./login.module.css";

const ERROR_MESSAGES: Record<StaffSignInError, string> = {
  "invalid-credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  network: "تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.",
  unknown: "تعذّر إكمال الطلب. حاول مرة أخرى بعد قليل.",
};
interface StaffLoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<StaffSignInError | null>;
}

/** Uses only the existing staff Firebase Auth instance; no public registration or alternate credential. */
export function StaffLoginScreen({ onSignIn }: StaffLoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<StaffSignInError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      if (recovering) {
        const result = await requestStaffPasswordReset(email.trim());
        if (result) setError(result);
        else setSent(true);
      } else {
        const result = await onSignIn(email.trim(), password);
        if (result) setError(result);
      }
    } catch { setError("unknown"); }
    finally { setIsSubmitting(false); }
  };
  const changeMode = () => { setRecovering(!recovering); setError(null); setSent(false); setPassword(""); setVisible(false); };
  return <main className={styles.page} dir="rtl" lang="ar">
    <form onSubmit={handleSubmit} className={styles.card} aria-busy={isSubmitting}>
      <div className={styles.identity}><ShumosBrandMark/><div><strong>شموس كير</strong><span>نظام التأهيل التفاعلي</span></div></div>
      <div className={styles.welcome}><h1>{recovering ? "استعادة كلمة المرور" : "أهلًا بعودتك"}</h1><p>{recovering ? "أدخل بريد العيادة لاستلام رابط إعادة تعيين كلمة المرور." : "سجّل دخولك إلى مساحة الأخصائي، ولنبدأ خطوة جديدة."}</p></div>
      <div className={styles.fields}>
        <label className={styles.field} htmlFor="staff-email">البريد الإلكتروني<input id="staff-email" name="email" type="email" inputMode="email" autoComplete="username" dir="ltr" value={email} onChange={event => { setEmail(event.target.value); setSent(false); }} placeholder="name@clinic.com" required aria-describedby={error ? "staff-auth-error" : undefined}/></label>
        {!recovering && <div className={styles.field}><label htmlFor="staff-password">كلمة المرور</label><div className={styles.password}><input id="staff-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} required aria-describedby={error ? "staff-auth-error" : undefined}/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={visible}><ControlIcon name={visible ? "eyeOff" : "eye"}/></button></div></div>}
      </div>
      {error && <p id="staff-auth-error" role="alert" className={styles.error}>{ERROR_MESSAGES[error]}</p>}
      {sent && <p role="status" className={styles.success}>إذا كان البريد مسجلًا، فستصلك رسالة تتضمن رابط إعادة تعيين كلمة المرور. تحقّق من البريد غير المرغوب فيه أيضًا.</p>}
      <button type="submit" className={styles.submit} disabled={!email.trim() || (!recovering && !password) || isSubmitting || sent}>{isSubmitting ? "جارٍ الإرسال…" : recovering ? "إرسال رابط الاستعادة" : "تسجيل الدخول"}</button>
      <button type="button" className={styles.recover} disabled={isSubmitting} onClick={changeMode}>{recovering ? "العودة إلى تسجيل الدخول" : "نسيت كلمة المرور؟"}</button>
      <p className={styles.footer}><ControlIcon name="shield"/>مساحة آمنة للأخصائيين المصرّح لهم</p>
    </form>
    <aside className={styles.story} aria-label="شموس كير"><span className={styles.eyebrow} lang="en" dir="ltr">SHUMOS CARE</span><h2>خطوات صغيرة،<br/><em>إمكانات أكبر.</em></h2><p>رعاية تفاعلية تفتح آفاق الحركة، وتجعل رحلة التأهيل أقرب إلى الطفل.</p><div className={styles.art} aria-hidden="true"><div className={styles.orbit}><div className={styles.sun}><ControlIcon name="spark"/></div></div><div className={styles.chip}><ControlIcon name="activities"/>تعلّم بالحركة واللعب</div><div className={styles.chip}><ControlIcon name="patients"/>رعاية ترافق كل خطوة</div></div><small>نحو تجربة تأهيل أكثر تفاعلًا وإنسانية.</small></aside>
  </main>;
}
