import { EncounterOutcome, EncounterType, type SpaceEncounter } from "@/lib/spacepilot";

interface EncounterProgressDotsProps {
  encounters: SpaceEncounter[];
}

/** MEDIUM/ADVANCED's analogue of StarProgressDots — same "secondary, corner-of-screen only" role, but reads the mixed star/asteroid/alien sequence instead of pure stars. */
export function EncounterProgressDots({ encounters }: EncounterProgressDotsProps) {
  return (
    <div className="pointer-events-none absolute top-[3vh] left-1/2 flex -translate-x-1/2 items-center gap-[0.8vmin]" aria-hidden="true">
      {encounters.map((encounter) => (
        <svg key={encounter.id} viewBox="0 0 24 24" className="h-[2.4vmin] w-[2.4vmin]">
          {encounter.type === EncounterType.STAR && (
            <path
              d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z"
              fill={encounter.status === EncounterOutcome.COLLECTED ? "#FBBF24" : "none"}
              stroke={encounter.status === EncounterOutcome.MISSED ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)"}
              strokeWidth={encounter.status === EncounterOutcome.COLLECTED ? 0 : 1.5}
              style={encounter.status === EncounterOutcome.COLLECTED ? { filter: "drop-shadow(0 0 3px rgba(251,191,36,0.9))" } : undefined}
            />
          )}
          {encounter.type === EncounterType.ASTEROID && (
            <path
              d="M12 3 L18 6 L20 12 L17 18 L12 21 L6 18 L4 12 L7 6 Z"
              fill={encounter.status === EncounterOutcome.CLEARED ? "#22D3EE" : "none"}
              stroke={encounter.status === EncounterOutcome.AVOIDED ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.55)"}
              strokeWidth={encounter.status === EncounterOutcome.CLEARED ? 0 : 1.5}
              style={encounter.status === EncounterOutcome.CLEARED ? { filter: "drop-shadow(0 0 3px rgba(34,211,238,0.9))" } : undefined}
            />
          )}
          {encounter.type === EncounterType.ALIEN && (
            <path d="M12 2 L20 12 L12 22 L4 12 Z" fill="none" stroke={encounter.status === EncounterOutcome.PASSED ? "rgba(255,255,255,0.25)" : "rgba(129,140,248,0.8)"} strokeWidth={1.5} />
          )}
        </svg>
      ))}
    </div>
  );
}
