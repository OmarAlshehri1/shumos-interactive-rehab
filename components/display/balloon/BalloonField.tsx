import type { Balloon as EngineBalloon } from "@/lib/game";
import { Balloon } from "./Balloon";

interface IncorrectSignal {
  balloonId: string;
  token: number;
}

interface BalloonFieldProps {
  balloons: EngineBalloon[];
  incorrectSignal: IncorrectSignal | null;
  onSelect: (balloonId: string) => void;
  onCorrectEvent?: () => void;
  onPopEvent?: () => void;
}

/**
 * Renders the current stage's balloons at their engine-defined normalized
 * positions. Positions and sizes come straight from lib/game — this
 * component never invents its own layout.
 */
export function BalloonField({ balloons, incorrectSignal, onSelect, onCorrectEvent, onPopEvent }: BalloonFieldProps) {
  return (
    <div className="absolute inset-0">
      {balloons.map((balloon) => (
        <Balloon
          key={balloon.id}
          balloon={balloon}
          shakeToken={incorrectSignal?.balloonId === balloon.id ? incorrectSignal.token : 0}
          onSelect={onSelect}
          onCorrectEvent={onCorrectEvent}
          onPopEvent={onPopEvent}
        />
      ))}
    </div>
  );
}
