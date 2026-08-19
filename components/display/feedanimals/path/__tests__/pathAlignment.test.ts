import { describe, expect, it } from "vitest";
import { Animal, Difficulty, getFeedAnimalsPathStage, sampleFeedAnimalsPathFraction, sampleFeedAnimalsPathPosition } from "@/lib/feedanimals";
import { facingForPathMovement, PATH_CONTACT_ANCHOR_STYLE, pathPositionStyle } from "../pathAlignment";
import { WALKER_GEOMETRY, walkerContactTranslationPercent } from "../../animals/walkerGeometry";

const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
const DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED] as const;

describe("Feed the Animals route alignment", () => {
  it("pins the contact wrapper to a physical origin in both LTR and RTL layouts", () => {
    expect(PATH_CONTACT_ANCHOR_STYLE).toEqual({
      left: 0,
      top: 0,
      transform: "translate(-50%, -100%)",
    });
  });

  it("uses one canonical sampler for the trail and active animal at every checkpoint", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const stageNumber of [1, 2, 3, 4, 5] as const) {
        const stage = getFeedAnimalsPathStage(difficulty, stageNumber)!;
        for (const leg of stage.legs) {
          for (const fraction of FRACTIONS) {
            const trailSample = sampleFeedAnimalsPathFraction(leg, fraction);
            const animalSample = sampleFeedAnimalsPathPosition(leg, leg.totalSteps * fraction);

            expect(animalSample.position.x).toBeCloseTo(trailSample.position.x, 12);
            expect(animalSample.position.y).toBeCloseTo(trailSample.position.y, 12);
            expect(pathPositionStyle(animalSample.position)).toEqual(pathPositionStyle(trailSample.position));
          }
        }
      }
    }
  });

  it("maps every animal SVG's real foot coordinate to the shared bottom-center contact anchor", () => {
    for (const animal of Object.values(Animal)) {
      const geometry = WALKER_GEOMETRY[animal];
      for (const facing of ["left", "right"] as const) {
        const translation = walkerContactTranslationPercent(animal, facing);
        const displayedContactX = facing === "left" ? geometry.viewBoxWidth - geometry.contactX : geometry.contactX;
        const contactXPercent = (displayedContactX / geometry.viewBoxWidth) * 100;
        const contactPercent = (geometry.contactY / geometry.viewBoxHeight) * 100;
        expect(contactXPercent + translation.x).toBeCloseTo(50, 12);
        expect(contactPercent + translation.y).toBeCloseTo(100, 12);
      }
    }
  });

  it("faces the animal in the actual horizontal direction of route travel", () => {
    expect(facingForPathMovement({ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.4 }, "left")).toBe("right");
    expect(facingForPathMovement({ x: 0.6, y: 0.5 }, { x: 0.4, y: 0.6 }, "right")).toBe("left");
    expect(facingForPathMovement({ x: 0.5, y: 0.6 }, { x: 0.5, y: 0.4 }, "left")).toBe("left");
  });
});
