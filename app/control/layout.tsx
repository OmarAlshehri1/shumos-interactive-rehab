import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { StaffAuthGate } from "@/components/control/auth/StaffAuthGate";
import { PatientSessionProvider } from "@/lib/patients/PatientSessionContext";
import { SessionWorkflowProvider } from "@/components/control/session/SessionWorkflowContext";
import { SensorRuntimeProvider } from "@/components/control/sensors/SensorRuntimeProvider";
import { SensorPointerDisplaySync } from "@/components/control/sensors/SensorPointerDisplaySync";
import { LocalPointerBroadcastSync } from "@/components/control/sensors/LocalPointerBroadcastSync";
import { PrototypeLocalOnlyBoundary } from "@/components/control/spacepilot3d/PrototypeLocalOnlyBoundary";
import { BuildQuestLocalOnlyBoundary } from "@/components/control/buildquest3d/BuildQuestLocalOnlyBoundary";
import "./control.css";
import { LibraryLaunchBoundary } from "@/components/control/library/launch/LibraryLaunchBoundary";

import { GameSafetyProvider } from '@/components/control/visits/GameSafetyProvider';
import { VisitProvider } from '@/components/control/visits/VisitProvider';
import { VisitWorkspace } from '@/components/control/visits/VisitWorkspace';

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
 *
 * SHARED SENSOR RUNTIME: SensorRuntimeProvider (see its own doc comment)
 * lives here, above every game route, specifically so one RIGHT_HAND
 * Bluetooth connection survives client-side navigation between them —
 * connect once, play one sensor-compatible game, return to the library,
 * play another, without reconnecting. Placed outside StaffAuthGate so a
 * sign-out/sign-in during a session doesn't tear down an active connection.
 * SensorPointerDisplaySync (inside the provider, so it can read the shared
 * pointer) mirrors that same connection onto /display at a throttled rate —
 * see its own doc comment — so the child-facing screen can show the virtual
 * hand too, not just /control. LocalPointerBroadcastSync is its same-Mac
 * sibling (see lib/display/LocalPointerChannel.ts): an unthrottled
 * BroadcastChannel mirror /display prefers whenever it's actually receiving
 * it, falling back to the Firebase path above for a genuinely separate
 * Display device.
 */
export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${plexSansArabic.variable} contents shumos-control`}>
      <SensorRuntimeProvider>
        <BuildQuestLocalOnlyBoundary><PrototypeLocalOnlyBoundary><SensorPointerDisplaySync /></PrototypeLocalOnlyBoundary></BuildQuestLocalOnlyBoundary>
        <LocalPointerBroadcastSync />
        <PatientSessionProvider>
          <SessionWorkflowProvider>
            <StaffAuthGate><GameSafetyProvider><VisitProvider><LibraryLaunchBoundary>{children}</LibraryLaunchBoundary><VisitWorkspace /></VisitProvider></GameSafetyProvider></StaffAuthGate>
          </SessionWorkflowProvider>
        </PatientSessionProvider>
      </SensorRuntimeProvider>
    </div>
  );
}
