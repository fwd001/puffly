import type { Rng } from './rng';

/** `undefined` on empty input keeps callers honest under `noUncheckedIndexedAccess`. */
export function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

export function groupBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const bucket = out.get(key(item));
    if (bucket) bucket.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

/** Deduplicate by a derived key, keeping the first occurrence. */
export function uniqueBy<T, K>(items: readonly T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * Deterministic sampling without replacement. `rng.shuffle` already exists; this
 * variant stops early, which matters when the pool is long and the sample is short.
 */
export function sample<T>(items: readonly T[], count: number, rng: Rng): T[] {
  const pool = items.slice();
  const out: T[] = [];
  const wanted = Math.min(count, pool.length);
  for (let i = 0; i < wanted; i++) {
    const index = rng.int(0, pool.length - 1);
    const value = pool[index];
    const last = pool.pop();
    if (value === undefined || last === undefined) continue;
    pool[index] = last;
    out.push(value);
  }
  return out;
}
