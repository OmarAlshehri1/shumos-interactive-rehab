import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => { vi.stubEnv("NODE_ENV", "development"); return ({ path: "/control/balloon-quest", patient: null as null | { patientId: string } }); });
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/lib/patients/PatientSessionContext", () => ({ usePatientContext: () => ({ selectedPatient: state.patient }) }));
vi.mock("@/components/control/library/launch/LibraryLaunchBoundary", () => ({ LibraryLaunchControls: () => null }));
vi.mock("@/components/control/patients/PatientContextBanner", () => ({ PatientContextBanner: () => null }));
vi.mock("@/components/control/ui/ControlWorkspace", () => ({
  ControlWorkspace: ({ children }: { children: ReactNode }) => <>{children}</>,
  SetupOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
  WorkspaceNative: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
import { ControlPageNav } from "../ControlPageNav";
import { ControlGameFrame } from "@/components/control/setup/ControlGameFrame";
import { GAME_REGISTRY } from "@/lib/games/registry";

afterAll(() => vi.unstubAllEnvs());
describe("visible contextual navigation", () => {
  it("renders an ordinary accessible back link without duplicating the shell logo", () => {
    const html = renderToStaticMarkup(<ControlPageNav backHref="/control/patients/p1" backLabel="ملف المريض" />);
    expect(html).toContain('href="/control/patients/p1"');
    expect(html).toContain('aria-label="رجوع إلى ملف المريض"');
    expect(html).toContain("رجوع");
    expect(html).not.toContain('alt="شعار شموس كير"');
    expect(html).not.toContain('target="_blank"');
  });
  it("provides the same visible back action for all 22 canonical game pages", () => {
    state.patient = null;
    expect(GAME_REGISTRY).toHaveLength(22);
    for (const game of GAME_REGISTRY) {
      state.path = game.route;
      const html = renderToStaticMarkup(<ControlGameFrame><div>Native settings</div></ControlGameFrame>);
      expect(html).toContain('aria-label="رجوع إلى مكتبة الأنشطة"');
      expect(html).toContain(`data-control-game="${game.id}"`);
      expect(html).toContain("Native settings");
    }
  });
  it("returns to the selected patient when game setup has patient context", () => {
    state.patient = { patientId: "p1" };
    state.path = GAME_REGISTRY[0].route;
    const html = renderToStaticMarkup(<ControlGameFrame><div /></ControlGameFrame>);
    expect(html).toContain('href="/control/patients/p1"');
    expect(html).toContain('aria-label="رجوع إلى ملف المريض"');
    state.patient = null;
  });
});
