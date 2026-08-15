import { motion } from "motion/react";

const STAR_PATH = "M8 0 L9.6 6 L16 8 L9.6 10 L8 16 L6.4 10 L0 8 L6.4 6 Z";

interface SparklesProps {
  colors: string[];
  count?: number;
  /** Burst radius in vmin, so it scales with the balloon/viewport consistently. */
  radius?: number;
}

/**
 * A short-lived star burst, reused for both a single balloon pop and the
 * larger stage/session celebrations (with a bigger count/radius). Each
 * sparkle is a self-contained motion.svg with its own fixed lifetime — none
 * of this persists in React state, it just plays once and the parent
 * unmounts it.
 */
export function Sparkles({ colors, count = 6, radius = 7 }: SparklesProps) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.15);
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const color = colors[i % colors.length];
        return (
          <motion.svg
            key={i}
            viewBox="0 0 16 16"
            className="absolute left-1/2 top-1/2 h-[2.4vmin] w-[2.4vmin] -ml-[1.2vmin] -mt-[1.2vmin]"
            initial={{ x: "0vmin", y: "0vmin", opacity: 1, scale: 0 }}
            animate={{ x: `${dx}vmin`, y: `${dy}vmin`, opacity: [1, 1, 0], scale: [0, 1, 0.7] }}
            transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.02 }}
          >
            <path d={STAR_PATH} fill={color} />
          </motion.svg>
        );
      })}
    </div>
  );
}
