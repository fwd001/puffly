/**
 * Deterministic pseudo-random utilities.
 *
 * Everything that looks random in Puffly comes through here so a session can be
 * replayed from its seed alone (SPEC.md §71, and §47 allows a random system in the
 * pure layer). No `Math.random()` anywhere downstream of this module.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  bool(p: number): boolean;
  /** Approximately normal, centred on `mean`. */
  gaussian(mean: number, deviation: number): number;
  /** First item of `items`, or `undefined` when empty. */
  pick<T>(items: readonly T[]): T | undefined;
  /** Weighted choice; ignores non-positive weights. */
  weighted<T>(items: readonly Weighted<T>[]): T | undefined;
  /** Reorder without mutating the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** Independent stream derived from this one, for per-burst variation. */
  fork(salt: number): Rng;
  /** Current internal state, for save/restore. */
  state(): RngState;
}

export type RngState = readonly [number, number, number, number];

export interface Weighted<T> {
  value: T;
  weight: number;
}

/** 32-bit mixer used to expand a single seed into four well-spread words. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * sfc32: small, fast, passes practisinger-style smoke tests, and integer-only so
 * results are bit-identical across platforms (required by §71 replay).
 */
export function createRng(seed: number, initialState?: RngState): Rng {
  const mix = splitmix32(seed);
  let a = initialState?.[0] ?? mix();
  let b = initialState?.[1] ?? mix();
  let c = initialState?.[2] ?? mix();
  let d = initialState?.[3] ?? mix();

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const sum = (a + b) | 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 1)) | 0;
    c = (c << 21) | (c >>> 11) | 0;
    d = (d + 1) | 0;
    const t = (sum + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    bool: (p) => next() < p,
    gaussian: (mean, deviation) => {
      // Box-Muller without the log(0) hazard.
      const u = Math.max(next(), Number.MIN_VALUE);
      const v = next();
      return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (items) => (items.length === 0 ? undefined : items[Math.floor(next() * items.length)]),
    weighted: (items) => {
      let total = 0;
      for (const item of items) if (item.weight > 0) total += item.weight;
      if (total <= 0) return undefined;
      let roll = next() * total;
      for (const item of items) {
        if (item.weight <= 0) continue;
        roll -= item.weight;
        if (roll < 0) return item.value;
      }
      return items.find((item) => item.weight > 0)?.value;
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const swap = out[i];
        const other = out[j];
        if (swap !== undefined && other !== undefined) {
          out[i] = other;
          out[j] = swap;
        }
      }
      return out;
    },
    fork: (salt) => createRng(Math.imul(a ^ salt, 2654435761) >>> 0),
    state: () => [a, b, c, d] as const,
  };

  return rng;
}

/** Seed in the range accepted by `createRng`, derived from any integer. */
export function normalizeSeed(value: number): number {
  const int = Math.trunc(value);
  return Number.isFinite(int) ? int >>> 0 || 1 : 1;
}
