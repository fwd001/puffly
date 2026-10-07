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
 * A box to add to the collection, or `null` when there is nothing left to find.
 *
 * Two exclusions, both from the deck's own sentence 「12 格内保证能开出来 9 个，剩下 3 个留给集齐
 * 朱砂皮肤的压轴」: a slot nobody named is not a box, and the reserved boxes are not in the pool
 * *while something else is still missing*. They are the finale, which means they arrive last — a
 * box that can never be drawn is not a finale, it is a collection that cannot be finished, and the
 * skin gated on completing it was unreachable (seven findable boxes, a gate of twelve).
 */
export function rollPack(
  rng: Rng,
  packs: readonly PackContent[],
  owned: readonly string[],
  cumulativeSticks: number,
): PackContent | null {
  const named = packs.filter((pack) => pack.brand !== '');
  const open = named.filter((pack) => !pack.reserved && !owned.includes(pack.id));
  const pool = open.length > 0 ? open : named.filter((pack) => owned.includes(pack.id) === false);
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
