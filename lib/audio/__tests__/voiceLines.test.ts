import { describe, expect, it } from "vitest";
import { BalloonColor } from "@/lib/game";
import {
  allEncouragementLines,
  countdownLine,
  crossedEncouragementBand,
  encouragementLine,
  incorrectLine,
  instructionLine,
  pausedLine,
  sessionCompleteLine,
  stageCompleteLine,
  startZoneFirstLine,
  startZoneReturnLine,
  waitingWorldGreetingLine,
  welcomeLine,
} from "../voiceLines";

describe("dynamic child name — nothing hardcodes محمد", () => {
  it("welcome, stage-complete, and session-complete all interpolate the given name", () => {
    expect(welcomeLine("سارة")).toContain("سارة");
    expect(welcomeLine("سارة")).not.toContain("محمد");
    expect(stageCompleteLine("سارة", 1)).toContain("سارة");
    expect(sessionCompleteLine("سارة")).toContain("سارة");
  });

  it("stage-complete opener varies by stage number without changing the name slot", () => {
    expect(stageCompleteLine("علي", 1)).toBe("بطل يا علي! خلصت المرحلة الأولى!");
    expect(stageCompleteLine("علي", 2)).toBe("نجم يا علي! خلصت المرحلة الثانية!");
    expect(stageCompleteLine("علي", 3)).toBe("عبقري يا علي! خلصت المرحلة الثالثة!");
  });
});

describe("startZoneFirstLine / startZoneReturnLine", () => {
  it("are fixed, non-empty lines distinct from each other", () => {
    expect(startZoneFirstLine().length).toBeGreaterThan(0);
    expect(startZoneReturnLine().length).toBeGreaterThan(0);
    expect(startZoneFirstLine()).not.toBe(startZoneReturnLine());
  });
});

describe("instructionLine / countdownLine / incorrectLine", () => {
  it("speaks the actual target color passed in, not a fixed one", () => {
    expect(instructionLine(BalloonColor.BLUE)).toContain("الزرقاء");
    expect(instructionLine(BalloonColor.GREEN)).toContain("الخضراء");
    expect(instructionLine(BalloonColor.RED)).not.toContain("الزرقاء");
  });

  it("countdown ticks map to the correct Arabic words", () => {
    expect(countdownLine("3")).toBe("ثلاثة");
    expect(countdownLine("2")).toBe("اثنان");
    expect(countdownLine("1")).toBe("واحد");
    expect(countdownLine("start")).toBe("ابدأ!");
  });

  it("incorrect line is a warm, encouraging spoken phrase (deliberately not identical to the visual floating text)", () => {
    expect(incorrectLine()).toBe("قريب! جرّب مرة ثانية");
  });
});

describe("crossedEncouragementBand", () => {
  it("returns null before any threshold is crossed", () => {
    expect(crossedEncouragementBand(0, 0, 4)).toBeNull();
  });

  it("detects crossing the 25% threshold", () => {
    expect(crossedEncouragementBand(0, 1, 4)).toBe("quarter");
  });

  it("detects crossing the 50% threshold", () => {
    expect(crossedEncouragementBand(1, 2, 4)).toBe("half");
  });

  it("detects crossing the 75% threshold", () => {
    expect(crossedEncouragementBand(2, 3, 4)).toBe("threeQuarter");
  });

  it("picks the highest newly-crossed band when a single pop crosses more than one (small target counts)", () => {
    // 1/2 = 50%, crossing both the 25% and 50% thresholds in one pop.
    expect(crossedEncouragementBand(0, 1, 2)).toBe("half");
  });

  it("excludes the stage's final target — that moment belongs to the stage-complete line", () => {
    expect(crossedEncouragementBand(2, 3, 3)).toBeNull();
    expect(crossedEncouragementBand(1, 2, 2)).toBeNull();
  });

  it("never fires twice for the same threshold once already past it", () => {
    expect(crossedEncouragementBand(1, 1, 4)).toBeNull();
  });
});

describe("encouragementLine variety", () => {
  it("cycles deterministically through a band's pool by occurrence index, not randomly", () => {
    const first = encouragementLine("half", "نورة", 0);
    const second = encouragementLine("half", "نورة", 1);
    const third = encouragementLine("half", "نورة", 2); // wraps back to the first variant

    expect(first).not.toBe(second);
    expect(third).toBe(first);
    expect(first).toContain("نورة");
    expect(second).toContain("نورة");
  });

  it("different bands never produce identical text", () => {
    const quarter = encouragementLine("quarter", "نورة", 0);
    const half = encouragementLine("half", "نورة", 0);
    const threeQuarter = encouragementLine("threeQuarter", "نورة", 0);
    expect(new Set([quarter, half, threeQuarter]).size).toBe(3);
  });
});

describe("waitingWorldGreetingLine / pausedLine (voice coverage gaps)", () => {
  it("waiting world greeting matches ShumosWaitingWorld.tsx's own visible Arabic message verbatim", () => {
    expect(waitingWorldGreetingLine()).toBe("بانتظار اختيار النشاط من الأخصائي");
  });

  it("paused line is a fixed, non-empty phrase", () => {
    expect(pausedLine().length).toBeGreaterThan(0);
  });
});

describe("allEncouragementLines (prefetch helper)", () => {
  it("enumerates every possible encouragement phrase for a given child, with no duplicates", () => {
    const lines = allEncouragementLines("نورة");
    expect(lines).toHaveLength(6); // 3 bands x 2 variants each
    expect(new Set(lines).size).toBe(6);
    expect(lines.every((line) => line.includes("نورة"))).toBe(true);
  });
});
