import { Difficulty, PlayArea, TargetSize, TargetSpacing, type CreateSessionParams } from "@/lib/game";

/**
 * Fixed parameters for the Task 3 local visual demo. Firebase/`/control`
 * don't exist yet, so /display has no real way to receive a child's name or
 * a therapist's settings — this stands in for that until realtime
 * integration arrives. A development-only fixed seed keeps every reload
 * reproducible while testing.
 */
export const DEV_SESSION_PARAMS: Omit<CreateSessionParams, "now"> = {
  childFirstName: "محمد",
  difficulty: Difficulty.EASY,
  targetSize: TargetSize.MEDIUM,
  targetSpacing: TargetSpacing.MEDIUM,
  playArea: PlayArea.FULL,
  seed: "task3-local-demo-seed",
};
