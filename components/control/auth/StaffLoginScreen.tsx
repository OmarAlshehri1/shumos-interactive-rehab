"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { StaffSignInError } from "@/lib/realtime/staffAuthClient";
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

/** Firebase staff sign-in only. Device locking belongs to the managed device's OS. */
export function StaffLoginScreen({ onSignIn }: StaffLoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<StaffSignInError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await onSignIn(email.trim(), password);
      if (result) setError(result);
    } catch { setError("unknown"); }
    finally { setIsSubmitting(false); }
  };
  return <main className={styles.page} dir="rtl" lang="ar">
    <Image className={styles.background} src="/brand/image_for_Lpg%20in%20back-og.jpg" alt="" fill sizes="100vw" preload />
    <div className={styles.shade} aria-hidden="true" />
    <div className={styles.brand}><ShumosBrandMark /><div><strong>شموس كير</strong><span>التأهيل التفاعلي</span></div></div>
    <form onSubmit={handleSubmit} className={styles.card} aria-busy={isSubmitting} aria-labelledby="staff-login-title">
      <header className={styles.welcome}>
        <span className={styles.seal} aria-hidden="true"><ControlIcon name="shield" /></span>
        <h1 id="staff-login-title">تسجيل الدخول</h1>
        <p>البريد وكلمة المرور</p>
      </header>
      <div className={styles.fields}>
        <label className={styles.field} htmlFor="staff-email">البريد الإلكتروني<input id="staff-email" name="email" type="email" inputMode="email" autoComplete="username" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@clinic.com" required aria-invalid={error === "invalid-credentials" || undefined} aria-describedby={error ? "staff-auth-error" : undefined} disabled={isSubmitting} /></label>
        <div className={styles.field}><label htmlFor="staff-password">كلمة المرور</label><div className={styles.password}><input id="staff-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} required aria-invalid={error === "invalid-credentials" || undefined} aria-describedby={error ? "staff-auth-error" : undefined} disabled={isSubmitting} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={visible}><ControlIcon name={visible ? "eyeOff" : "eye"} /></button></div></div>
      </div>
      {error && <p id="staff-auth-error" role="alert" className={styles.error}>{ERROR_MESSAGES[error]}</p>}
      <button type="submit" className={styles.submit} disabled={!email.trim() || !password || isSubmitting}>{isSubmitting ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}<ControlIcon name="arrow" /></button>
      <span className={styles.status} role="status" aria-live="polite">{isSubmitting ? "جارٍ التحقق من بيانات الدخول" : ""}</span>
    </form>
    <footer className={styles.credit}><a href="https://velonweb.com" target="_blank" rel="noopener noreferrer" aria-label="تصميم وتطوير VelonWeb — يفتح في نافذة جديدة"><span>تصميم وتطوير <b lang="en">VelonWeb</b></span><span className={styles.velonMark}><Image src="/brand/Velonweb-logo.png" alt="" width={663} height={438} /></span></a></footer>
  </main>;
}
