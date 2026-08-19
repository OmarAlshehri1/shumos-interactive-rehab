"use client";

import { motion } from "motion/react";
import { Animal } from "@/lib/feedanimals";

interface AnimalArtProps {
  animal: Animal;
  /** Fires the animal's own unique happy/eating reaction (task section 9/21/27) — otherwise a gentle idle/waiting loop plays. */
  celebrating?: boolean;
}

/**
 * HERO CHARACTERS (task section 8) — five polished, original SVG/Motion
 * animals, never emoji as production artwork. Each has a recognizable
 * silhouette, friendly face, simple body, and its OWN idle + happy
 * animation (task section 9's personalities): Monkey bounces + waves,
 * Rabbit wiggles its ears + hops, Panda claps + sways, Elephant swings its
 * trunk + flaps an ear, Giraffe tilts its head + nods. Deliberately simple
 * SVG groups + Motion (no skeletal rigging, no physics), per task section
 * 27/78's performance guidance.
 */
export function AnimalArt({ animal, celebrating = false }: AnimalArtProps) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={celebrating ? undefined : { y: [0, -2, 0, 1, 0] }}
      transition={celebrating ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {animal === Animal.MONKEY && <Monkey celebrating={celebrating} />}
      {animal === Animal.RABBIT && <Rabbit celebrating={celebrating} />}
      {animal === Animal.PANDA && <Panda celebrating={celebrating} />}
      {animal === Animal.ELEPHANT && <Elephant celebrating={celebrating} />}
      {animal === Animal.GIRAFFE && <Giraffe celebrating={celebrating} />}
    </motion.div>
  );
}

/** Playful bounce + hand wave (task section 9). */
function Monkey({ celebrating }: { celebrating: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 0.6vmin 1vmin rgba(60,30,10,0.35))" }}
      animate={celebrating ? { y: [0, -10, 0, -6, 0], scale: [1, 1.06, 1, 1.03, 1] } : undefined}
      transition={celebrating ? { duration: 1.1, repeat: 2 } : undefined}
      aria-hidden="true"
    >
      {/* Ears */}
      <circle cx="24" cy="40" r="13" fill="#8C5A3A" />
      <circle cx="76" cy="40" r="13" fill="#8C5A3A" />
      <circle cx="24" cy="40" r="7" fill="#C99B72" />
      <circle cx="76" cy="40" r="7" fill="#C99B72" />
      {/* Head */}
      <circle cx="50" cy="46" r="30" fill="#8C5A3A" />
      {/* Muzzle */}
      <ellipse cx="50" cy="56" rx="19" ry="15" fill="#E8CBA6" />
      {/* Eyes */}
      <circle cx="41" cy="46" r="4.2" fill="#3A2415" />
      <circle cx="59" cy="46" r="4.2" fill="#3A2415" />
      <circle cx="42.3" cy="44.7" r="1.2" fill="white" />
      <circle cx="60.3" cy="44.7" r="1.2" fill="white" />
      {/* Nose + mouth */}
      <ellipse cx="45" cy="57" rx="2.2" ry="1.6" fill="#6B4226" />
      <ellipse cx="55" cy="57" rx="2.2" ry="1.6" fill="#6B4226" />
      {/* A wider-open happy mouth via scale, not a `d` keyframe morph — see FeedAnimalsPlayingScene.tsx's FoodDeliveryFx doc comment: Motion (v13) cannot reliably animate raw SVG geometry attributes like `d`/`cx` here without throwing invalid-attribute console errors, so every celebrating flourish in this file uses a transform instead. */}
      <motion.g
        style={{ transformOrigin: "50px 63px" }}
        animate={celebrating ? { scaleY: [1, 1.6, 1] } : undefined}
        transition={celebrating ? { duration: 0.6, repeat: 0 } : undefined}
      >
        <path d="M40 63 Q50 71 60 63" stroke="#6B4226" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </motion.g>
      {/* Waving hand */}
      <motion.g
        style={{ transformOrigin: "80px 68px" }}
        animate={celebrating ? { rotate: [0, -25, 15, -20, 0] } : { rotate: [0, -6, 0] }}
        transition={celebrating ? { duration: 1.2, repeat: 2 } : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="80" cy="68" r="8" fill="#8C5A3A" />
      </motion.g>
    </motion.svg>
  );
}

/** Ear wiggle + small hop (task section 9). */
function Rabbit({ celebrating }: { celebrating: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 0.6vmin 1vmin rgba(60,30,10,0.3))" }}
      animate={celebrating ? { y: [0, -14, 0, -8, 0] } : undefined}
      transition={celebrating ? { duration: 1, repeat: 2 } : undefined}
      aria-hidden="true"
    >
      {/* Ears */}
      <motion.g style={{ transformOrigin: "38px 40px" }} animate={{ rotate: celebrating ? [0, -10, 8, -6, 0] : [0, -3, 0] }} transition={{ duration: celebrating ? 0.9 : 2.4, repeat: celebrating ? 2 : Infinity }}>
        <ellipse cx="38" cy="20" rx="8" ry="22" fill="#F3E9DD" />
        <ellipse cx="38" cy="20" rx="4" ry="16" fill="#F2A9B8" />
      </motion.g>
      <motion.g style={{ transformOrigin: "62px 40px" }} animate={{ rotate: celebrating ? [0, 10, -8, 6, 0] : [0, 3, 0] }} transition={{ duration: celebrating ? 0.9 : 2.4, repeat: celebrating ? 2 : Infinity }}>
        <ellipse cx="62" cy="20" rx="8" ry="22" fill="#F3E9DD" />
        <ellipse cx="62" cy="20" rx="4" ry="16" fill="#F2A9B8" />
      </motion.g>
      {/* Head */}
      <circle cx="50" cy="55" r="28" fill="#FBF3E8" />
      {/* Cheeks */}
      <circle cx="33" cy="60" r="6" fill="#F8D3D8" opacity="0.8" />
      <circle cx="67" cy="60" r="6" fill="#F8D3D8" opacity="0.8" />
      {/* Eyes */}
      <circle cx="41" cy="52" r="4" fill="#3A2415" />
      <circle cx="59" cy="52" r="4" fill="#3A2415" />
      <circle cx="42.3" cy="50.7" r="1.1" fill="white" />
      <circle cx="60.3" cy="50.7" r="1.1" fill="white" />
      {/* Nose + mouth */}
      <path d="M46 61 L54 61 L50 65 Z" fill="#E88A9A" />
      <path d="M50 65 Q50 69 44 70 M50 65 Q50 69 56 70" stroke="#6B4226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </motion.svg>
  );
}

/** Gentle clap + happy sway (task section 9). */
function Panda({ celebrating }: { celebrating: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 0.6vmin 1vmin rgba(20,20,20,0.3))" }}
      animate={celebrating ? { rotate: [0, -4, 4, -3, 0] } : undefined}
      transition={celebrating ? { duration: 1.1, repeat: 2 } : undefined}
      aria-hidden="true"
    >
      {/* Ears */}
      <circle cx="26" cy="30" r="11" fill="#2B2B2B" />
      <circle cx="74" cy="30" r="11" fill="#2B2B2B" />
      {/* Head */}
      <circle cx="50" cy="50" r="30" fill="#FAFAFA" stroke="#E4E4E4" strokeWidth="1" />
      {/* Eye patches */}
      <ellipse cx="39" cy="48" rx="9" ry="11" fill="#2B2B2B" transform="rotate(-12 39 48)" />
      <ellipse cx="61" cy="48" rx="9" ry="11" fill="#2B2B2B" transform="rotate(12 61 48)" />
      <circle cx="40" cy="49" r="3.4" fill="white" />
      <circle cx="60" cy="49" r="3.4" fill="white" />
      <circle cx="40" cy="49" r="1.6" fill="#2B2B2B" />
      <circle cx="60" cy="49" r="1.6" fill="#2B2B2B" />
      {/* Nose + mouth */}
      <ellipse cx="50" cy="62" rx="3" ry="2.2" fill="#2B2B2B" />
      <path d="M50 64 Q50 70 42 71 M50 64 Q50 70 58 71" stroke="#8a8a8a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Clapping paws via translateX, not a `cx` keyframe morph — see the `d`-mouth comment above. */}
      <motion.g animate={celebrating ? { x: [0, 12, 0, 12, 0] } : undefined} transition={celebrating ? { duration: 0.7, repeat: 0 } : undefined}>
        <circle cx="30" cy="76" r="8" fill="#2B2B2B" />
      </motion.g>
      <motion.g animate={celebrating ? { x: [0, -12, 0, -12, 0] } : undefined} transition={celebrating ? { duration: 0.7, repeat: 0 } : undefined}>
        <circle cx="70" cy="76" r="8" fill="#2B2B2B" />
      </motion.g>
    </motion.svg>
  );
}

/** Trunk swing + ear flap (task section 9). */
function Elephant({ celebrating }: { celebrating: boolean }) {
  return (
    <motion.svg viewBox="0 0 100 100" className="h-full w-full" style={{ filter: "drop-shadow(0 0.6vmin 1vmin rgba(50,60,70,0.3))" }} aria-hidden="true">
      {/* Ears */}
      <motion.ellipse
        cx="20"
        cy="46"
        rx="16"
        ry="20"
        fill="#B9C2CC"
        animate={{ rotate: celebrating ? [0, -8, 6, 0] : [0, -3, 0] }}
        transition={{ duration: celebrating ? 0.9 : 2.6, repeat: celebrating ? 2 : Infinity }}
        style={{ transformOrigin: "32px 46px" }}
      />
      <motion.ellipse
        cx="80"
        cy="46"
        rx="16"
        ry="20"
        fill="#B9C2CC"
        animate={{ rotate: celebrating ? [0, 8, -6, 0] : [0, 3, 0] }}
        transition={{ duration: celebrating ? 0.9 : 2.6, repeat: celebrating ? 2 : Infinity }}
        style={{ transformOrigin: "68px 46px" }}
      />
      {/* Head */}
      <circle cx="50" cy="48" r="27" fill="#CBD3DB" />
      {/* Eyes */}
      <circle cx="40" cy="43" r="3.6" fill="#3A2415" />
      <circle cx="60" cy="43" r="3.6" fill="#3A2415" />
      <circle cx="41.1" cy="41.8" r="1" fill="white" />
      <circle cx="61.1" cy="41.8" r="1" fill="white" />
      {/* Trunk */}
      {/* Trunk swing via rotate, not a `d` keyframe morph — see the `d`-mouth comment above (Monkey). */}
      <motion.g
        style={{ transformOrigin: "50px 58px" }}
        animate={{ rotate: celebrating ? [0, -10, 8, -6, 0] : [0, -4, 0] }}
        transition={{ duration: celebrating ? 0.7 : 3, repeat: celebrating ? 0 : Infinity, ease: "easeInOut" }}
      >
        <path d="M50 58 Q50 68 44 74 Q40 78 44 82" stroke="#B9C2CC" strokeWidth="10" strokeLinecap="round" fill="none" />
      </motion.g>
    </motion.svg>
  );
}

/** Head tilt + happy nod (task section 9). */
function Giraffe({ celebrating }: { celebrating: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 0.6vmin 1vmin rgba(120,80,20,0.3))", transformOrigin: "50px 90px" }}
      animate={{ rotate: celebrating ? [0, -8, 6, -4, 0] : [0, -2, 0] }}
      transition={{ duration: celebrating ? 1 : 2.8, repeat: celebrating ? 2 : Infinity }}
      aria-hidden="true"
    >
      {/* Neck */}
      <rect x="42" y="55" width="16" height="35" rx="7" fill="#F2C572" />
      <circle cx="47" cy="72" r="3" fill="#C98A3A" opacity="0.7" />
      <circle cx="54" cy="82" r="2.4" fill="#C98A3A" opacity="0.7" />
      {/* Ossicones */}
      <rect x="38" y="14" width="4" height="14" rx="2" fill="#F2C572" />
      <circle cx="40" cy="13" r="4" fill="#C98A3A" />
      <rect x="58" y="14" width="4" height="14" rx="2" fill="#F2C572" />
      <circle cx="60" cy="13" r="4" fill="#C98A3A" />
      {/* Head */}
      <ellipse cx="50" cy="42" rx="21" ry="24" fill="#F2C572" />
      <circle cx="35" cy="46" r="4" fill="#C98A3A" opacity="0.7" />
      <circle cx="65" cy="40" r="3.2" fill="#C98A3A" opacity="0.7" />
      {/* Eyes */}
      <circle cx="40" cy="38" r="3.8" fill="#3A2415" />
      <circle cx="60" cy="38" r="3.8" fill="#3A2415" />
      <circle cx="41.2" cy="36.8" r="1" fill="white" />
      <circle cx="61.2" cy="36.8" r="1" fill="white" />
      {/* Muzzle + mouth */}
      <ellipse cx="50" cy="55" rx="11" ry="8" fill="#FBE3B8" />
      <path d="M43 57 Q50 61 57 57" stroke="#6B4226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </motion.svg>
  );
}
