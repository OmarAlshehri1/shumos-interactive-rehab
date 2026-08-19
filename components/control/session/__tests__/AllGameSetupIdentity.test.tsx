import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupScreen as BalloonSetup } from "@/components/control/setup/SetupScreen";
import { FootstepsSetupScreen } from "@/components/control/footsteps/setup/FootstepsSetupScreen";
import { BubblePopSetupScreen } from "@/components/control/bubblepop/setup/BubblePopSetupScreen";
import { FeedAnimalsSetupScreen } from "@/components/control/feedanimals/setup/FeedAnimalsSetupScreen";
import { SpacePilotSetupScreen } from "@/components/control/spacepilot/setup/SpacePilotSetupScreen";
import { ColorChaseSetupScreen } from "@/components/control/colorchase/ColorChaseControlScreen";
import { Difficulty, PlayArea, TargetSize, TargetSpacing } from "@/lib/game";
import { PathStyle, PathWidth, StepLength } from "@/lib/footsteps";
import { BubbleSize, ReachHeight as BubbleReachHeight, ReachSide as BubbleReachSide, TargetMode } from "@/lib/bubblepop";
import { FoodSize, MovementPattern, ReachHeight as FoodReachHeight, ReachSide as FoodReachSide } from "@/lib/feedanimals";

const noop = () => {};

describe("all six game Setup screens", () => {
  it("render the same patient and authenticated-therapist identity hierarchy before selection controls", () => {
    const common = { patientName: "سارة", therapistName: "أ. نورة", onChildNameChange: noop, onStart: noop };
    const screens = [
      <BalloonSetup key="balloon" {...common} draft={{ childFirstName: "سارة", difficulty: Difficulty.EASY, targetSize: TargetSize.LARGE, targetSpacing: TargetSpacing.WIDE, playArea: PlayArea.FULL, startingStage: 1 }} onDifficultyChange={noop} onStartingStageChange={noop} />,
      <FootstepsSetupScreen key="footsteps" {...common} draft={{ childFirstName: "سارة", difficulty: Difficulty.EASY, stepLength: StepLength.SHORT, pathStyle: PathStyle.STRAIGHT, pathWidth: PathWidth.NARROW, startingStage: 1 }} onDifficultyChange={noop} onStartingStageChange={noop} />,
      <BubblePopSetupScreen key="bubble" {...common} draft={{ childFirstName: "سارة", difficulty: Difficulty.EASY, bubbleSize: BubbleSize.LARGE, reachHeight: BubbleReachHeight.FULL, reachSide: BubbleReachSide.FULL, targetMode: TargetMode.COLOR_ONLY, startingStage: 1 }} onDifficultyChange={noop} onStartingStageChange={noop} />,
      <FeedAnimalsSetupScreen key="animals" {...common} draft={{ childFirstName: "سارة", difficulty: Difficulty.EASY, foodSize: FoodSize.LARGE, reachHeight: FoodReachHeight.FULL, reachSide: FoodReachSide.FULL, movementPattern: MovementPattern.CENTRAL, startingStage: 1 }} onDifficultyChange={noop} onStartingStageChange={noop} />,
      <SpacePilotSetupScreen key="space" {...common} draft={{ childFirstName: "سارة", difficulty: Difficulty.EASY }} onDifficultyChange={noop} />,
      <ColorChaseSetupScreen key="color" {...common} draft={{ childFirstName: "سارة", difficulty: Difficulty.EASY, startingStage: 1 }} onDifficultyChange={noop} onStartingStageChange={noop} />,
    ];

    for (const screen of screens) {
      const html = renderToStaticMarkup(screen);
      expect(html.match(/data-setup-identity/g)).toHaveLength(1);
      expect(html).toContain("المريض");
      expect(html).toContain("الأخصائي");
      expect(html).toContain("أ. نورة");
      expect(html.indexOf("data-setup-identity")).toBeLessThan(html.indexOf("اختر"));
      expect(html).not.toContain("هدف الجلسة");
    }
  });
});
