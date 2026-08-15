import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { StaffAuthGate } from "@/components/control/auth/StaffAuthGate";
import { PatientSessionProvider } from "@/lib/patients/PatientSessionContext";
import "./control.css";

const plexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-control",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * A different, more restrained Arabic typeface than /display's playful
 * Baloo Bhaijaan 2 (see app/display/layout.tsx) — the therapist controller
 * is a professional clinical tool, not the child-facing game, and should
 * read that way typographically. Route-scoped the same way, so this never
 * affects /display.
 *
 * STAFF AUTHENTICATION FOUNDATION: StaffAuthGate wraps every route under
 * /control/* here — both the Game Library (/control) and Balloon Quest's
 * controller (/control/balloon-quest) — the layout-level, App Router-
 * idiomatic place for "this whole section requires auth," so neither page
 * needs to know auth exists. See StaffAuthGate.tsx.
 */
export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${plexSansArabic.variable} contents`}>
      <PatientSessionProvider>
        <StaffAuthGate>{children}</StaffAuthGate>
      </PatientSessionProvider>
    </div>
  );
}
