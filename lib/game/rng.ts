/**
 * Deterministic seeded random number generation.
 *
 * Stage generation must be reproducible from (seed, difficulty, stageNumber,
 * config) alone, so nothing in this module may read the clock, crypto RNG,
 * or Math.random(). xmur3 turns an arbitrary string into a 32-bit integer
 * seed; mulberry32 is a small, fast PRNG driven by that integer. Both are
 * well-known public-domain algorithms, chosen over a dependency because the
 * quality bar here is "looks organic and is reproducible," not cryptographic.
 */

export type Rng = () => number;

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a deterministic RNG: the same seed string always produces the same sequence. */
export function createRng(seed: string): Rng {
  const seedInt = xmur3(seed)();
  return mulberry32(seedInt);
}

/** Random float in [min, max). */
export function nextFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Random integer in [min, max], inclusive on both ends. */
export function nextInt(rng: Rng, min: number, max: number): number {
  return Math.floor(nextFloat(rng, min, max + 1));
}

/** Picks a uniformly random element from a non-empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher-Yates shuffle, driven by the given RNG. Does not mutate the input. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
