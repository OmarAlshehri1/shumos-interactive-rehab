"use client";

import { motion } from "motion/react";

export interface SpacePilotRocketProps {
  /** 0 (starting rocket) through 8 (fully upgraded, task's TOTAL_STARS) — every star collected reveals/enhances one modular layer. Same rocket transforming throughout, never a swapped drawing (task's "ONE ROCKET, NOT REPLACEMENT"). */
  upgradeLevel: number;
  /** Transient bank while changing lanes — positive tilts nose-down (banking toward BOTTOM), negative tilts nose-up (banking toward TOP), 0 when level/settled. */
  bankDegrees?: number;
  /** A brief happy scale-up boost, played on collecting a star. */
  boosting?: boolean;
}

const flameTone = (level: number) => (level >= 1 ? { outer: "#3B82F6", mid: "#60A5FA", core: "#DBEAFE" } : { outer: "#FB923C", mid: "#FDBA74", core: "#FFF7ED" });

/**
 * Space Pilot's own rocket — custom layered SVG (body / cockpit / wings /
 * boosters / engine / flame / lights / energy accents), facing LEFT (nose
 * at the left edge of its own viewBox — see the task's screen-orientation
 * section). Every upgrade layer below is additive/enhancing, never a swap:
 * the SAME <g> tree renders at every level, with later layers simply
 * un-hidden or re-styled once `upgradeLevel` crosses their threshold
 * (task's "ONE ROCKET, NOT REPLACEMENT... build the rocket in modular SVG
 * layers").
 *
 * BIG, READABLE SILHOUETTE CHANGES (task's "a child/projector viewer should
 * immediately notice the rocket changed" — the original version leaned on
 * a tiny glow/stripe and wasn't obvious enough): every threshold below adds
 * or visibly enlarges a real structural piece — wider wings, physical side
 * boosters, nose armor, a much bigger dual-exhaust block, rear stabilizer
 * fins — not just a color/opacity tweak. Level 8's still-frame silhouette
 * is dramatically larger and busier than level 0's.
 */
export function SpacePilotRocket({ upgradeLevel, bankDegrees = 0, boosting = false }: SpacePilotRocketProps) {
  const level = Math.max(0, Math.min(8, upgradeLevel));
  const flame = flameTone(level);
  const hasWideWings = level >= 2;
  const hasBoosters = level >= 3;
  const hasNoseArmor = level >= 4;
  const hasDualExhaust = level >= 5;
  const hasPremiumCockpit = level >= 6;
  const hasRearFins = level >= 7;
  const isFinal = level >= 8;

  return (
    <motion.div
      className="sp-rocket-idle relative"
      style={{ transformOrigin: "50% 50%" }}
      animate={{ rotate: bankDegrees, scale: boosting ? 1.12 : 1 }}
      transition={{ rotate: { type: "spring", stiffness: 140, damping: 16 }, scale: { type: "spring", stiffness: 260, damping: 12 } }}
    >
      <svg viewBox="0 0 200 110" className="h-full w-full overflow-visible" style={{ filter: isFinal ? "drop-shadow(0 0 18px rgba(96,165,250,0.85))" : "none" }}>
        <defs>
          <radialGradient id="sp-cockpit-glass" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#EAF6FF" />
            <stop offset="55%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </radialGradient>
          <linearGradient id="sp-body-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="55%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#B9C3D6" />
          </linearGradient>
          <linearGradient id="sp-flame-outer" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor={flame.core} />
            <stop offset="45%" stopColor={flame.mid} />
            <stop offset="100%" stopColor={flame.outer} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sp-booster-flame" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor={flame.core} />
            <stop offset="50%" stopColor={flame.mid} />
            <stop offset="100%" stopColor={flame.outer} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sp-armor-fill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
        </defs>

        {/* AURA — task's "star-energy aura/trail," collected after star 7. FINAL FORM gets a second, wider ring layered on top — task's "beautiful trail/aura" payoff. */}
        {hasRearFins && (
          <motion.ellipse
            cx="95"
            cy="55"
            rx="92"
            ry="46"
            fill="none"
            stroke="#93C5FD"
            strokeOpacity="0.4"
            strokeWidth="2.5"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: [0.3, 0.6, 0.3], scale: 1 }}
            transition={{ opacity: { duration: 2.6, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 0.5 } }}
          />
        )}
        {isFinal && (
          <motion.ellipse
            cx="98"
            cy="55"
            rx="108"
            ry="56"
            fill="none"
            stroke="#60A5FA"
            strokeOpacity="0.25"
            strokeWidth="3"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: [0.15, 0.4, 0.15], scale: 1 }}
            transition={{ opacity: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }, scale: { duration: 0.5 } }}
          />
        )}

        {/* Sparkle trail — trailing behind the tail (toward the right, since the nose points left). */}
        {hasRearFins && (
          <g opacity="0.85">
            {[
              { cx: 178, cy: 40, r: 1.6, delay: 0 },
              { cx: 186, cy: 60, r: 1.3, delay: 0.4 },
              { cx: 180, cy: 74, r: 1.5, delay: 0.8 },
              ...(isFinal ? [{ cx: 192, cy: 50, r: 1.4, delay: 0.6 }] : []),
            ].map((s, i) => (
              <motion.circle
                key={i}
                cx={s.cx}
                cy={s.cy}
                r={s.r}
                fill="#FDE68A"
                initial={{ opacity: 0, cx: s.cx }}
                animate={{ opacity: [0, 1, 0], cx: [s.cx, s.cx + 16] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: s.delay, ease: "easeOut" }}
              />
            ))}
          </g>
        )}

        {/* REAR STABILIZER FINS — star 7, large fixed fins fanning out behind the wings, near the tail. */}
        {hasRearFins && (
          <motion.g initial={{ opacity: 0, scale: 0.5, x: 10 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ type: "spring", stiffness: 190, damping: 14 }}>
            <path d="M138 18 L172 2 L158 32 Z" fill="#4338CA" stroke="#312E81" strokeWidth="1" />
            <path d="M138 92 L172 108 L158 78 Z" fill="#4338CA" stroke="#312E81" strokeWidth="1" />
          </motion.g>
        )}

        {/* WINGS (behind body) — small stub fins at start, MUCH larger swept wings from star 2 onward, further enlarged at FINAL FORM. */}
        <motion.g animate={{ scale: isFinal ? 1.14 : 1 }} style={{ transformOrigin: "150px 55px" }}>
          {hasWideWings ? (
            <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}>
              <path d="M112 40 L172 2 L150 46 Z" fill="#6366F1" stroke="#4338CA" strokeWidth="1" />
              <path d="M112 70 L172 108 L150 64 Z" fill="#818CF8" stroke="#4338CA" strokeWidth="1" />
            </motion.g>
          ) : (
            <g>
              <path d="M128 42 L150 28 L143 46 Z" fill="#94A3B8" />
              <path d="M128 68 L150 82 L143 64 Z" fill="#A8B4C8" />
            </g>
          )}

          {/* Wingtip lights — star 6, alongside the premium cockpit. */}
          {hasPremiumCockpit && (
            <>
              <motion.circle
                cx="168"
                cy="6"
                r="3.4"
                fill="#FDE68A"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.circle
                cx="168"
                cy="104"
                r="3.4"
                fill="#FDE68A"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              />
            </>
          )}
        </motion.g>

        {/* ENGINE + FLAME — base nozzle, always present; recolors blue at star 1. */}
        <rect x="150" y="42" width="26" height="26" rx="6" fill="#94A3B8" />
        <g className="sp-flame">
          <path d="M176 46 Q205 55 176 64 Z" fill="url(#sp-flame-outer)" />
          <path d="M176 50 Q195 55 176 60 Z" fill={flame.core} opacity="0.9" />
        </g>

        {/* DUAL EXHAUST — star 5, a much larger secondary engine block above/below the main nozzle. */}
        {hasDualExhaust && (
          <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 14 }}>
            <rect x="146" y="12" width="24" height="22" rx="7" fill="#A8B4C8" stroke="#64748B" strokeWidth="1" />
            <g className="sp-flame" style={{ animationDelay: "0.15s" }}>
              <path d="M170 14 Q194 23 170 32 Z" fill="url(#sp-flame-outer)" opacity="0.95" />
            </g>
            <rect x="146" y="76" width="24" height="22" rx="7" fill="#A8B4C8" stroke="#64748B" strokeWidth="1" />
            <g className="sp-flame" style={{ animationDelay: "0.3s" }}>
              <path d="M170 78 Q194 87 170 96 Z" fill="url(#sp-flame-outer)" opacity="0.95" />
            </g>
          </motion.g>
        )}

        {/* BODY — nose points LEFT (x=0), tail/engine at the right. Silhouette is symmetric about y=55 (the viewBox's true vertical midpoint) — keep it that way; see the cockpit's own doc comment below for why that matters. */}
        <path d="M8 55 C 30 20, 70 8, 120 12 L 155 22 L 155 88 L 120 98 C 70 102, 30 90, 8 55 Z" fill="url(#sp-body-fill)" stroke="#94A3B8" strokeWidth="1.5" />
        {/* Shadow-side accent for dimensionality. */}
        <path d="M40 78 C 65 92, 95 96, 120 92 L 118 84 C 92 88, 65 84, 45 72 Z" fill="#C7D0E0" opacity="0.7" />

        {/* SIDE BOOSTERS — star 3, two physical booster pods that deploy outward from the flanks (drawn AFTER the body so they sit visibly on top of it rather than being hidden underneath — their footprint overlaps the body's own silhouette), each with its own small flame. */}
        {hasBoosters && (
          <motion.g initial={{ opacity: 0, x: -14, scale: 0.6 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 210, damping: 14 }}>
            <rect x="58" y="10" width="50" height="16" rx="7" fill="#94A3B8" stroke="#64748B" strokeWidth="1.2" />
            <g className="sp-flame" style={{ animationDelay: "0.1s" }}>
              <path d="M108 11 Q125 18 108 26 Z" fill="url(#sp-booster-flame)" opacity="0.9" />
            </g>
            <rect x="58" y="84" width="50" height="16" rx="7" fill="#94A3B8" stroke="#64748B" strokeWidth="1.2" />
            <g className="sp-flame" style={{ animationDelay: "0.25s" }}>
              <path d="M108 85 Q125 92 108 100 Z" fill="url(#sp-booster-flame)" opacity="0.9" />
            </g>
          </motion.g>
        )}

        {/* NOSE ARMOR + energy stripe — star 4, a visibly reinforced angular plate over the nose plus a bright stripe down the spine. */}
        {hasNoseArmor && (
          <motion.g initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 210, damping: 15 }} style={{ transformOrigin: "20px 55px" }}>
            <path d="M8 55 C 16 36, 34 22, 58 16 L 66 26 C 46 32, 30 44, 22 55 C 30 66, 46 78, 66 84 L 58 94 C 34 88, 16 74, 8 55 Z" fill="url(#sp-armor-fill)" stroke="#1E293B" strokeWidth="1.2" />
          </motion.g>
        )}
        {hasNoseArmor && (
          <motion.path
            d="M22 50 C 55 40, 95 38, 140 44"
            fill="none"
            stroke="#22D3EE"
            strokeWidth="3.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.95 }}
            transition={{ duration: 0.6 }}
            style={{ filter: "drop-shadow(0 0 5px #22D3EE)" }}
          />
        )}

        {/* Cockpit glow — PREMIUM at star 6 (brighter, plus a gold trim ring). */}
        {hasPremiumCockpit && <circle cx="72" cy="55" r="28" fill="#7DD3FC" opacity="0.4" style={{ filter: "blur(7px)" }} />}
        {hasPremiumCockpit && <circle cx="72" cy="55" r="19.5" fill="none" stroke="#FBBF24" strokeWidth="1.5" opacity="0.85" />}

        {/*
          Cockpit window — centered on cy=55, the viewBox's true vertical
          midpoint (the body/wings/engine silhouette above is symmetric
          about y=55). A previous version sat this at cy=45, i.e. 10 units
          ABOVE that midpoint — large and bright enough to visibly drag the
          rocket's perceived center upward relative to the canonical lane
          line it's rendered on. Keep this centered on 55 so the rocket's
          true visual center matches its container's lane-Y center.
        */}
        <circle cx="72" cy="55" r="17" fill="url(#sp-cockpit-glass)" stroke="#0369A1" strokeWidth="2" />
        <path d="M63 46 Q70 42 78 46" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity={hasPremiumCockpit ? 0.95 : 0.55} fill="none" />

        {/* Nose tip highlight. */}
        <path d="M8 55 C 14 44, 24 33, 38 26" stroke="white" strokeWidth="2" opacity="0.5" fill="none" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}
