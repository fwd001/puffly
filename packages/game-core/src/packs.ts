/**
 * Which box a finished stick leaves behind — § packs.dropRule, as one pure function.
 *
 * Two rules, both stated by the brief and neither invented here: the low tier never comes up
 * empty, and the middle and high tiers become likelier the more sticks have been smoked. The roll
 * goes through the session's own generator, so a replay of the same inputs lands the same boxes
 * (§71) — a collection that changed when you reloaded would not be a collection.
 */

import type { Rng } from '@puffly/shared';
import type { PackContent } from './types/content';

/** The three tiers and how far each has to climb before it is likely at all. */
const TIER_WEIGHTS = {
  low: (sticks: number): number => (sticks >= 0 ? 1 : 0),
  mid: (sticks: number): number => Math.min(1, sticks / 40),
  high: (sticks: number): number => Math.min(1, sticks / 120),
} as const;

/**
 * A box to add to the collection, or `null` when there is nothing left to find. Reserved boxes —
 * the three the last skin is held behind — are never in the pool, and neither are the slots
 * nobody has named.
 */
export function rollPack(
  rng: Rng,
  packs: readonly PackContent[],
  owned: readonly string[],
  cumulativeSticks: number,
): PackContent | null {
  const pool = packs.filter(
    (pack) => !pack.reserved && pack.brand !== '' && !owned.includes(pack.id),
  );
  const weights = pool.map((pack) => TIER_WEIGHTS[pack.tier](cumulativeSticks));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (pool.length === 0 || total <= 0) return null;

  let ticket = rng.next() * total;
  for (const [index, pack] of pool.entries()) {
    ticket -= weights[index] ?? 0;
    if (ticket < 0) return pack;
  }
  return pool[pool.length - 1] ?? null;
}
