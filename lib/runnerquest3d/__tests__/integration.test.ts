import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENCOURAGE_AR, HINT_AR, LIFECYCLE_AR, SOURCE_AR, SOURCE_NOTE_AR, SUSPEND_AR } from "../arabic";
import { runnerQuestAvailable } from "../availability";
import { RUNNER_QUEST_3D_GAME_ID, RUNNER_QUEST_3D_REGISTRATION as REG } from "../registration";
import { INPUT_SOURCES, UNVALIDATED_SOURCES } from "../types";

const root = join(__dirname, "../../..");

describe("availability / rollback", () => {
  it("development: on unless explicitly disabled; production: off unless explicitly enabled", () => {
    expect(runnerQuestAvailable("development", undefined)).toBe(true);
    expect(runnerQuestAvailable("development", "0")).toBe(false);
    expect(runnerQuestAvailable("production", undefined)).toBe(false);
    expect(runnerQuestAvailable("production", "0")).toBe(false);
    expect(runnerQuestAvailable("production", "true")).toBe(false);
    expect(runnerQuestAvailable("production", "1")).toBe(true);
    expect(runnerQuestAvailable("test", "1")).toBe(true);
    expect(runnerQuestAvailable(undefined, undefined)).toBe(false);
  });
});

describe("library registration manifest", () => {
  it("uses the agreed names, id and routes, and points at pages that exist", () => {
    expect(REG.nameAr).toBe("مغامرة العدّاء");
    expect(REG.nameEn).toBe("Runner Quest 3D");
    expect(REG.id).toBe(RUNNER_QUEST_3D_GAME_ID);
    expect(REG.route).toBe("/control/runner-quest-3d");
    expect(REG.displayRoute).toBe("/display/runner-quest-3d");
    expect(existsSync(join(root, "app/control/runner-quest-3d/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app/display/runner-quest-3d/page.tsx"))).toBe(true);
  });
  it("never claims validated foot sensors", () => {
    expect(REG.physicalFootSensorsValidated).toBe(false);
    expect(REG.shortDescriptionAr).toMatch(/قيد التحقق/);
    expect(REG.supportedInputs.join(" ")).toMatch(/simulated only/);
    expect(UNVALIDATED_SOURCES).toEqual(["RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"]);
    for (const s of UNVALIDATED_SOURCES) expect(SOURCE_NOTE_AR[s]).toMatch(/لم تُختبر/);
  });
  it("the integrated pages are gated by the availability flag and show no diagnostics", () => {
    const display = readFileSync(join(root, "app/display/runner-quest-3d/page.tsx"), "utf8");
    const control = readFileSync(join(root, "app/control/runner-quest-3d/page.tsx"), "utf8");
    for (const src of [display, control]) { expect(src).toMatch(/RUNNER_QUEST_3D_ENABLED/); expect(src).toMatch(/notFound\(\)/); }
    expect(display).toMatch(/diagnostics: false/);
    expect(display).toMatch(/preview: false/);
  });
  it("the experimental prototype routes stay development-only", () => {
    for (const p of ["app/control/runner-quest-3d-prototype/page.tsx", "app/display/runner-quest-3d-prototype/page.tsx"]) expect(readFileSync(join(root, p), "utf8")).toMatch(/NODE_ENV !== "development"\) notFound\(\)/);
  });
});

describe("isolation: no Firebase, no shared production module is imported", () => {
  const files = [
    "lib/runnerquest3d/controlRuntime.ts", "lib/runnerquest3d/controlMount.ts", "lib/runnerquest3d/displayMount.ts", "lib/runnerquest3d/protocol.ts", "lib/runnerquest3d/session.ts",
    "lib/runnerquest3d/input/hub.ts", "components/display/runnerquest3d/RunnerQuest3DDisplay.tsx", "components/control/runnerquest3d/RunnerQuest3DControl.tsx",
  ];
  it("does not touch Firebase, realtime repositories or patient history", () => {
    for (const f of files) {
      const src = readFileSync(join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(src, f).not.toMatch(/firebase|lib\/realtime|sessionHistory|patients\/|localStorage/i);
    }
  });
  it("imports only TYPES/enums from lib/physicalInput (no BLE driver, no calibration)", () => {
    for (const f of ["lib/runnerquest3d/controlRuntime.ts", "lib/runnerquest3d/input/hub.ts", "lib/runnerquest3d/input/simulatedFoot.ts", "lib/runnerquest3d/input/footRecognizer.ts", "lib/runnerquest3d/controlMount.ts"]) {
      const imports = [...readFileSync(join(root, f), "utf8").matchAll(/from "(@\/lib\/physicalInput[^"]*)"/g)].map((m) => m[1]);
      for (const i of imports) expect(i, f).toBe("@/lib/physicalInput/types");
    }
  });
});

describe("Arabic copy is complete", () => {
  it("has text for every hint, lifecycle, suspend reason and source", () => {
    for (const k of ["move-left", "move-right", "step", "choose-path", "go"] as const) expect(HINT_AR[k].length).toBeGreaterThan(3);
    for (const k of ["ready", "playing", "paused", "suspended", "stage-complete", "completed", "ended"] as const) expect(LIFECYCLE_AR[k]).toBeTruthy();
    for (const k of ["input-lost", "display-unavailable", "control-hidden", "scheduling-gap"] as const) expect(SUSPEND_AR[k]).toBeTruthy();
    for (const s of INPUT_SOURCES) expect(SOURCE_AR[s]).toBeTruthy();
    expect(ENCOURAGE_AR.length).toBeGreaterThan(2);
  });
});
