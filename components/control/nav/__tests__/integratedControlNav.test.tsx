import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ path: "/control" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/lib/realtime/useStaffAuth", () => ({ useStaffAuth: () => ({ phase: "authorized", signOut: vi.fn() }) }));
vi.mock("@/lib/realtime/firebaseClient", () => ({ isRealtimeEnabled: () => true }));
vi.mock("@/lib/patients/PatientSessionContext", () => ({ usePatientContext: () => ({ clearPatient: vi.fn() }) }));
import { ControlShell } from "../ControlShell";
import { ControlPageNav } from "../ControlPageNav";
import { GAME_REGISTRY } from "@/lib/games/registry";

describe("integrated Control branding and navigation", () => {
  it("renders one official logo, one navigation landmark and real destinations", () => {
    state.path = "/control";
    const html = renderToStaticMarkup(<ControlShell><main>Clinical content</main></ControlShell>);
    expect(html.match(/alt="شعار شموس كير"/g)).toHaveLength(1);
    expect(html.match(/aria-label="التنقل الرئيسي"/g)).toHaveLength(1);
    for (const href of ["/control", "/control/activities", "/control/patients", "/control/youtube"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Clinical content");
    expect(html).toContain("data-control-logout");
  });
  it("keeps contextual back navigation and a single brand on a deep patient route", () => {
    state.path = "/control/patients/p1";
    const html = renderToStaticMarkup(<ControlShell><ControlPageNav backHref="/control/patients" backLabel="المرضى" /></ControlShell>);
    expect(html.match(/alt="شعار شموس كير"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="رجوع إلى المرضى"');
    expect(html).toContain('title="المرضى" aria-current="page" href="/control/patients"');
    expect(html).not.toContain("data-control-logout");
  });
  it("wraps every canonical route without mounting a second game or exposing sign-out during gameplay", () => {
    for (const game of GAME_REGISTRY) {
      state.path = game.route;
      const html = renderToStaticMarkup(<ControlShell><div>Native controller</div></ControlShell>);
      expect(html).toContain(game.nameAr);
      expect(html.match(/Native controller/g)).toHaveLength(1);
      expect(html).not.toContain("data-control-logout");
    }
  });
});
