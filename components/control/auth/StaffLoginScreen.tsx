"use client";

import { useState, type FormEvent } from "react";
import type { StaffSignInError } from "@/lib/realtime/staffAuthClient";

/** TASK 11 — LOGIN ERROR UX: simple Arabic messages, never a raw Firebase error code, never a hint about which field was wrong. */
const ERROR_MESSAGES: Record<StaffSignInError, string> = {
  "invalid-credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  network: "تعذر الاتصال بالخادم. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.",
  unknown: "حدث خطأ غير متوقع. حاول مرة أخرى.",
};

interface StaffLoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<StaffSignInError | null>;
}

/**
 * STAFF AUTHENTICATION FOUNDATION — /control's login screen, shown by
 * StaffAuthGate.tsx whenever no authorized staff session exists. Deliberately
 * NOT child-facing (this never appears on /display — see the report's
 * "critical distinction" section) and deliberately has no "إنشاء حساب" /
 * public sign-up affordance anywhere on this screen: staff accounts are
 * created manually in the Firebase Console only.
 */
export function StaffLoginScreen({ onSignIn }: StaffLoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<StaffSignInError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const result = await onSignIn(email.trim(), password);
    setIsSubmitting(false);
    if (result) setError(result);
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw flex-col items-center justify-center bg-slate-50 px-6 text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_10px_30px_rgba(30,41,59,0.08)]"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs font-semibold tracking-[0.25em] text-teal-600 uppercase">Shumos Care</span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">شموس كير</h1>
          <p className="text-sm text-slate-500">نظام التأهيل التفاعلي</p>
        </div>

        <div className="h-px bg-slate-100" />

        <h2 className="text-center text-base font-bold text-slate-800">تسجيل دخول الموظفين</h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">البريد الإلكتروني</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-medium text-slate-900 outline-none transition-colors focus:border-teal-600"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">كلمة المرور</span>
            <input
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-medium text-slate-900 outline-none transition-colors focus:border-teal-600"
              required
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
            {ERROR_MESSAGES[error]}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-12 touch-manipulation rounded-2xl bg-teal-600 text-base font-bold text-white shadow-md shadow-teal-900/15 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {isSubmitting ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
      </form>
    </main>
  );
}
