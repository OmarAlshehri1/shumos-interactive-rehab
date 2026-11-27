import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StagePicker,
  ProgressiveStageSelect,
  optionsOf,
} from "../ProgressiveStages";
import { GAME_REGISTRY, LAUNCHABLE_GAMES } from "@/lib/games/registry";
import { DEVICE_GAMES, launchHref } from "@/lib/games/library/capabilities";
import { filteredGames, libraryFilter } from "@/lib/games/library/filters";
import {
  GAME_INSTRUCTIONS,
  participationCue,
} from "@/lib/games/setup/introduction";
import type { AnySessionState } from "@/lib/realtime/types";
describe("stage metadata", () => {
  it("preserves native curriculum descriptions and disallowed stages", () => {
    const options = optionsOf(
      <>
        <option value={2} data-stage-description="تذكّر خطوتين" disabled>
          مسار الذاكرة
        </option>
        <option value={3}>مسار منحني</option>
      </>,
    );
    expect(options).toEqual([
      {
        value: 2,
        label: "مسار الذاكرة",
        description: "تذكّر خطوتين",
        disabled: true,
      },
      {
        value: 3,
        label: "مسار منحني",
        description: undefined,
        disabled: undefined,
      },
    ]);
  });
});
describe("unique canonical library and real progressive stages", () => {
  it("deduplicates All and derives every category directly from canonical capabilities", () => {
    expect(
      filteredGames([...GAME_REGISTRY, ...GAME_REGISTRY], "ALL"),
    ).toHaveLength(LAUNCHABLE_GAMES.length);
    for (const filter of ["HAND", "FOOT", "JOYSTICK", "DRIVING"] as const) {
      expect(filteredGames(GAME_REGISTRY, filter).map((g) => g.id).sort()).toEqual(
        DEVICE_GAMES[filter].filter((id) =>
          GAME_REGISTRY.some((g) => g.id === id),
        ).slice().sort(),
      );
      expect(
        new Set(filteredGames(GAME_REGISTRY, filter).map((g) => g.id)).size,
      ).toBe(filteredGames(GAME_REGISTRY, filter).length);
    }
    expect(libraryFilter(null)).toBe("HAND");
    expect(libraryFilter("__proto__")).toBe("HAND");
    expect(launchHref("/control/balloon-quest", "HAND")).toContain(
      "input=HAND",
    );
  });
  it("renders only the selected difficulty’s three stages and preserves forbidden-stage state", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({
      value: i,
      label: `هدف ${i + 1}`,
      disabled: i === 7,
    }));
    const html = renderToStaticMarkup(
      <StagePicker items={items} value={6} onSelect={() => {}} />,
    );
    expect(html.match(/data-stage-choice=/g)).toHaveLength(3);
    expect(html).toContain('data-stage-choice="6"');
    expect(html).toContain('data-stage-choice="8"');
    expect(html).not.toContain('data-stage-choice="0"');
    expect(html).toMatch(/disabled=""[^>]*data-stage-choice="7"/);
  });
  it("never invents a ninth-stage layout for a legacy five-stage select", () => {
    const html = renderToStaticMarkup(
      <ProgressiveStageSelect onSelect={() => {}}>
        <select value={1} onChange={() => {}}>
          {[1, 2, 3, 4, 5].map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </ProgressiveStageSelect>,
    );
    expect(html).not.toContain("data-progressive-stages");
    expect(html.match(/<option/g)).toHaveLength(5);
  });
  it("has game-specific objective copy for all registered games and does not infer live hardware", () => {
    for (const game of GAME_REGISTRY)
      expect(GAME_INSTRUCTIONS[game.id].goal.length).toBeGreaterThan(10);
    const state = (config: Record<string, unknown>) =>
      ({
        engine: "mock",
        mock: { payload: JSON.stringify({ config }) },
      }) as unknown as AnySessionState;
    expect(participationCue(state({ mode: "MANUAL" }))).toContain("الأخصائي");
    expect(participationCue(state({ mode: "RIGHT_HAND" }))).toContain("يدك");
    expect(participationCue(state({ input: "simulated" }))).toContain(
      "ليس قياسًا",
    );
    expect(participationCue(state({ control: "pedal" }))).toContain("الدواسة");
    expect(
      participationCue(state({ control: "manual", mode: "combined" })),
    ).toContain("الأخصائي");
    expect(
      participationCue(state({ control: "wheel-pedal", mode: "combined" })),
    ).toContain("الدواسة");
    expect(
      participationCue(state({ source: "wheel", mode: "auto-throttle" })),
    ).toContain("الوضع الآلي");
    expect(
      participationCue(state({ source: "hand", mode: "assisted" })),
    ).toContain("يدك");
  });
});
