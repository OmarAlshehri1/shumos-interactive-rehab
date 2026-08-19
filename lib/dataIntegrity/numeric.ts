/**
 * Numeric guards used at persistence, revival, analytics, and presentation
 * boundaries. Firebase/legacy values are untrusted even when TypeScript says
 * otherwise: old JSON can omit fields and JavaScript can carry NaN/Infinity.
 */
export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function nonNegativeFiniteNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export function requireNonNegativeFiniteNumber(value: unknown, label: string): number {
  const number = nonNegativeFiniteNumber(value);
  if (number === null) throw new Error(`Invalid non-finite or negative ${label}`);
  return number;
}

export function requireFiniteCount(value: unknown, label: string): number {
  const count = finiteCount(value);
  if (count === null) throw new Error(`Invalid count ${label}`);
  return count;
}

export function finiteCount(value: unknown): number | null {
  const number = nonNegativeFiniteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

export function finiteRatio(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

/** Returns null if any operand is invalid; a partial sum would be misleading. */
export function sumFinite(values: readonly unknown[]): number | null {
  let sum = 0;
  for (const value of values) {
    const number = finiteNumber(value);
    if (number === null) return null;
    sum += number;
    if (!Number.isFinite(sum)) return null;
  }
  return sum;
}

/** Invalid/missing samples are not observations and never enter the mean. */
export function averageFinite(values: readonly unknown[]): number | null {
  const valid = values.map(finiteNumber).filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  const sum = sumFinite(valid);
  return sum === null ? null : sum / valid.length;
}

export function weightedAverageFinite(samples: readonly { value: unknown; weight: unknown }[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const sample of samples) {
    const value = nonNegativeFiniteNumber(sample.value);
    const weight = finiteCount(sample.weight);
    if (value === null || weight === null) return null;
    if (weight === 0) continue;
    weightedSum += value * weight;
    totalWeight += weight;
    if (!Number.isFinite(weightedSum) || !Number.isFinite(totalWeight)) return null;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

export function safeRatio(numerator: unknown, denominator: unknown): number | null {
  const safeNumerator = nonNegativeFiniteNumber(numerator);
  const safeDenominator = nonNegativeFiniteNumber(denominator);
  if (safeNumerator === null || safeDenominator === null || safeDenominator === 0) return null;
  const ratio = safeNumerator / safeDenominator;
  return Number.isFinite(ratio) ? ratio : null;
}

export function safeElapsedMs(end: unknown, start: unknown, pausedMs: unknown = 0): number | null {
  const safeEnd = nonNegativeFiniteNumber(end);
  const safeStart = nonNegativeFiniteNumber(start);
  const safePaused = nonNegativeFiniteNumber(pausedMs);
  if (safeEnd === null || safeStart === null || safePaused === null || safeEnd < safeStart) return null;
  const elapsed = safeEnd - safeStart - safePaused;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

export function formatCountOrUnavailable(value: unknown): string {
  const count = finiteCount(value);
  return count === null ? "—" : String(count);
}

/**
 * Refuses a Firebase payload containing values RTDB cannot represent safely.
 * It deliberately throws instead of deleting fields or coercing bad metrics.
 */
export function assertFirebaseSafeValue(value: unknown, path = "$", seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid non-finite Firebase number at ${path}`);
    return;
  }
  if (typeof value === "undefined") throw new Error(`Invalid undefined Firebase value at ${path}`);
  if (typeof value !== "object") throw new Error(`Unsupported Firebase value at ${path}`);
  if (seen.has(value)) throw new Error(`Circular Firebase value at ${path}`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFirebaseSafeValue(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertFirebaseSafeValue(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}
