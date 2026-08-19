import { CollectibleStarStatus, EncounterOutcome, EncounterType, isEncounterStage, isStarOnlyStage, type SpacePilotAnyStageRuntime } from "@/lib/spacepilot";

interface SpacePilotLiveProgressProps {
  stage: SpacePilotAnyStageRuntime;
}

function MiniStar({ collected, dim }: { collected: boolean; dim: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 sm:h-6 sm:w-6">
      <path
        d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z"
        fill={collected ? "#FBBF24" : "none"}
        stroke={dim ? "#CBD5E1" : "#94A3B8"}
        strokeWidth={collected ? 0 : 1.5}
        opacity={dim ? 0.35 : 1}
      />
    </svg>
  );
}

/** Small rocky dot standing in for an asteroid encounter — cleared (FIRE) glows cyan, avoided/pending stays a plain grey rock. */
function MiniAsteroid({ cleared, dim }: { cleared: boolean; dim: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 sm:h-6 sm:w-6">
      <path
        d="M12 3 L18 6 L20 12 L17 18 L12 21 L6 18 L4 12 L7 6 Z"
        fill={cleared ? "#22D3EE" : "none"}
        stroke={dim ? "#CBD5E1" : "#94A3B8"}
        strokeWidth={cleared ? 0 : 1.5}
        opacity={dim ? 0.35 : 1}
      />
    </svg>
  );
}

/** Small diamond marker for the friendly alien encounter. */
function MiniAlien({ dim }: { dim: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 sm:h-6 sm:w-6">
      <path d="M12 2 L20 12 L12 22 L4 12 Z" fill="none" stroke="#818CF8" strokeWidth={1.5} opacity={dim ? 0.35 : 1} />
    </svg>
  );
}

/** Therapist-facing progress strip — mirrors the child-facing progress indicator on /display (task's "Show a simple child-friendly progress indicator... keep it secondary"). Works for both EASY's star-only stage and MEDIUM/ADVANCED's mixed encounter sequence. */
export function SpacePilotLiveProgress({ stage }: SpacePilotLiveProgressProps) {
  if (isStarOnlyStage(stage)) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 py-2 sm:px-6">
        {stage.stars.map((star) => (
          <MiniStar key={star.id} collected={star.status === CollectibleStarStatus.COLLECTED} dim={star.status === CollectibleStarStatus.MISSED} />
        ))}
      </div>
    );
  }

  if (!isEncounterStage(stage)) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 py-2 sm:px-6">
      {stage.encounters.map((encounter) => {
        const isPending = encounter.status === EncounterOutcome.PENDING;
        if (encounter.type === EncounterType.STAR) {
          return <MiniStar key={encounter.id} collected={encounter.status === EncounterOutcome.COLLECTED} dim={!isPending && encounter.status === EncounterOutcome.MISSED} />;
        }
        if (encounter.type === EncounterType.ASTEROID) {
          return <MiniAsteroid key={encounter.id} cleared={encounter.status === EncounterOutcome.CLEARED} dim={!isPending && encounter.status === EncounterOutcome.AVOIDED} />;
        }
        return <MiniAlien key={encounter.id} dim={!isPending} />;
      })}
    </div>
  );
}
