"use client";

import { usePathname } from "next/navigation";
import { shouldShowLogout } from "@/lib/control/topLevelNavigation";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { StaffLoginScreen } from "./StaffLoginScreen";

/**
 * STAFF AUTHENTICATION FOUNDATION — wraps the ENTIRE /control subtree (see
 * app/control/layout.tsx, which renders this around every page under
 * /control/*, so both the Game Library and /control/balloon-quest are
 * covered by the same gate — opening /control/balloon-quest directly,
 * bypassing the library, is gated exactly the same way). Nothing inside
 * `children` ever renders until an authorized staff session exists.
 *
 * Local dev/demo mode (no Firebase configured — see isRealtimeEnabled())
 * bypasses this entirely, same as ControlScreen/DisplayScreen's own
 * local-adapter fallback: there is no staff data to protect when there's
 * no Firebase project behind it.
 */
export function StaffAuthGate({ children }: { children: React.ReactNode }) {
  if (!isRealtimeEnabled()) return <>{children}</>;
  return <RealtimeStaffAuthGate>{children}</RealtimeStaffAuthGate>;
}

function RealtimeStaffAuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const staffAuth = useStaffAuth();
  // RELIABILITY FIX — PatientSessionContext is sessionStorage-backed
  // (tab-scoped), not staff-scoped: on a shared clinic device, signing out
  // without clearing it left the NEXT therapist's Setup screen silently
  // prefilled with the PREVIOUS therapist's selected patient (name +
  // resume-suggested difficulty/stage) the instant they reached it — no
  // manual selection required. PatientSessionProvider wraps this component
  // (see app/control/layout.tsx), so it's always safe to reach up and clear
  // it here, at the one place every sign-out (both the normal "authorized"
  // corner button and the "unauthorized" account's own sign-out) funnels
  // through.
  const patientContext = usePatientContext();
  const signOut = () => {
    patientContext.clearPatient();
    staffAuth.signOut();
  };

  switch (staffAuth.phase) {
    case "authorized":
      return (
        <>
          {children}
          {shouldShowLogout(pathname) && <LogoutCorner email={staffAuth.email} onSignOut={signOut} />}
        </>
      );

    case "initializing":
    case "checkingAccess":
      return (
        <AuthShell>
          <Spinner label="جاري التحقق من الحساب..." />
        </AuthShell>
      );

    case "unauthorized":
      return (
        <AuthShell>
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-3xl" aria-hidden="true">
              🔒
            </span>
            <h2 className="text-lg font-bold text-slate-800">هذا الحساب غير مُفعّل</h2>
            <p className="max-w-xs text-sm leading-relaxed text-slate-500">
              حساب البريد الإلكتروني صحيح، لكنه غير مُفعّل كموظف في النظام. تواصل مع إدارة شموس كير.
            </p>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
            >
              تسجيل الخروج
            </button>
          </div>
        </AuthShell>
      );

    case "error":
      return (
        <AuthShell>
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-3xl" aria-hidden="true">
              ⚠️
            </span>
            <h2 className="text-lg font-bold text-slate-800">تعذّر الاتصال بالنظام</h2>
            <p className="max-w-xs text-sm leading-relaxed text-slate-500">
              لم نتمكن من تجهيز الاتصال الآمن بالخادم. تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة.
            </p>
          </div>
        </AuthShell>
      );

    case "signedOut":
    default:
      return <StaffLoginScreen onSignIn={staffAuth.signIn} />;
  }
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw flex-col items-center justify-center bg-slate-50 text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      {children}
    </main>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

/** A small fixed control shown only on approved top-level therapist pages. */
function LogoutCorner({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <button
      type="button"
      onClick={onSignOut}
      title={email ?? undefined}
      className="fixed top-2 end-2 z-40 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm transition-colors hover:bg-white hover:text-slate-700"
    >
      تسجيل الخروج
    </button>
  );
}
