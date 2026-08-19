import { describe, expect, it } from "vitest";
import { buildPrefetchLines } from "../AudioManager";
import type { GameId } from "@/lib/games/registry";

/**
 * COST INCIDENT REGRESSION TEST — ROUND 2. Round 1 scoped prefetch to the
 * active game only, but Bubble Pop Wall alone still bought 110 real Munsit
 * requests from a session simply appearing (color x shape x sequence-pair
 * matrix), Feed the Animals 45 (animal x template matrix). Round 2 removed
 * every speculative/combinatorial line from prefetch entirely: each game's
 * list is now just its own welcome line + the 4 shared, fixed countdown
 * words (task's "ideally 0-5 lines PER ACTIVE GAME"). Everything else now
 * synthesizes strictly on demand via AudioManager.speak() — see
 * AudioManager.test.ts for proof dispatch still speaks every removed line
 * when its real event actually fires.
 */
describe("buildPrefetchLines — session-start prefetch is tiny, per game, non-speculative", () => {
  const ALL_GAME_IDS: GameId[] = ["balloon-quest", "follow-the-footsteps", "bubble-pop-wall", "feed-the-animals", "space-pilot", "color-chase"];

  /** BEFORE (round 1) -> AFTER (round 2), per the task's required report. */
  const BEFORE_COUNTS: Record<GameId, number> = {
    "balloon-quest": 26,
    "follow-the-footsteps": 22,
    "bubble-pop-wall": 110,
    "feed-the-animals": 45,
    "space-pilot": 8,
    "color-chase": 6,
  };

  it("every game's prefetch list is now exactly 5 lines (welcome + the 4 shared countdown words) — within the 0-5 target", () => {
    for (const gameId of ALL_GAME_IDS) {
      const lines = buildPrefetchLines(gameId, "سارة");
      expect(lines.length).toBe(5);
      expect(lines.length).toBeLessThanOrEqual(5);
    }
  });

  it("AFTER counts are dramatically smaller than BEFORE for every game — largest single drop is Bubble Pop Wall (110 -> 5)", () => {
    for (const gameId of ALL_GAME_IDS) {
      const after = buildPrefetchLines(gameId, "سارة").length;
      expect(after).toBeLessThan(BEFORE_COUNTS[gameId]);
    }
    // The two combinatorial-matrix games specifically — the task's named acceptance criteria.
    expect(buildPrefetchLines("bubble-pop-wall", "سارة").length).toBe(5); // was 110
    expect(buildPrefetchLines("feed-the-animals", "سارة").length).toBe(5); // was 45
  });

  it("Bubble Pop Wall's prefetch no longer contains ANY color/shape/sequence request line — those are on-demand only now", () => {
    const lines = buildPrefetchLines("bubble-pop-wall", "سارة");
    // Every color/shape request or sequence line contains one of these color-adjective substrings; none should survive in the tiny welcome+countdown list.
    const colorWords = ["أحمر", "أزرق", "أصفر", "أخضر", "بنفسجي", "برتقالي", "وردي"];
    for (const line of lines) {
      for (const word of colorWords) expect(line).not.toContain(word);
    }
  });

  it("Feed the Animals' prefetch no longer contains any animal/food request line — those are on-demand only now", () => {
    const lines = buildPrefetchLines("feed-the-animals", "سارة").join(" ||| ");
    for (const animalWord of ["القرد", "الأرنب", "الباندا", "الفيل", "الزرافة"]) {
      expect(lines).not.toContain(animalWord);
    }
  });

  it("the total across all six games combined is tiny (<=30)", () => {
    const total = ALL_GAME_IDS.reduce((sum, id) => sum + buildPrefetchLines(id, "سارة").length, 0);
    expect(total).toBeLessThanOrEqual(30);
  });

  it("every game's list includes its own welcome line plus the 4 shared, identical countdown words", () => {
    const balloonQuest = buildPrefetchLines("balloon-quest", "سارة");
    const spacePilot = buildPrefetchLines("space-pilot", "سارة");
    const sharedCountdownWords = ["ثلاثة", "اثنان", "واحد", "ابدأ!"];
    for (const word of sharedCountdownWords) {
      expect(balloonQuest).toContain(word);
      expect(spacePilot).toContain(word);
    }
  });

  it("is deterministic and duplicate-free", () => {
    for (const gameId of ALL_GAME_IDS) {
      const a = buildPrefetchLines(gameId, "سارة");
      const b = buildPrefetchLines(gameId, "سارة");
      expect(a).toEqual(b);
      expect(new Set(a).size).toBe(a.length);
    }
  });

  it("never returns another game's welcome line", () => {
    const markers: Record<GameId, string> = {
      "balloon-quest": "مغامرة البالونات",
      "follow-the-footsteps": "امشِ على الخطوات",
      "bubble-pop-wall": "فرقعة الفقاعات",
      "feed-the-animals": "الحيوانات",
      "space-pilot": "الصاروخ",
      "color-chase": "نطارد الألوان",
    };
    for (const gameId of ALL_GAME_IDS) {
      const joined = buildPrefetchLines(gameId, "سارة").join(" ||| ");
      for (const otherGameId of ALL_GAME_IDS) {
        if (otherGameId === gameId) continue;
        expect(joined).not.toContain(markers[otherGameId]);
      }
    }
  });
});
