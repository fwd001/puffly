/**
 * The 图鉴's ordering (§ S8b: 分型排序). The three interaction families are the only grouping
 * that means something to a player — the difference between inhaling, savouring and filtering is
 * a different hand, not a different colour — so the shelf is sorted by it rather than by unlock
 * order, which the grid already shows by dimming what is not yet there.
 */

import type { CigaretteContent } from '@puffly/game-core';

export const KIND_ORDER: readonly CigaretteContent['archive']['kind'][] = [
  'inhale',
  'savor',
  'filter',
];

export interface Shelf {
  kind: CigaretteContent['archive']['kind'];
  rods: CigaretteContent[];
}

export function shelvesOf(rods: readonly CigaretteContent[]): Shelf[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    rods: rods.filter((rod) => rod.archive.kind === kind),
  })).filter((shelf) => shelf.rods.length > 0);
}

/**
 * 「累计 42 支 · 下一档解锁 75 支」: the next rung of the rod ladder, counted in the same unit the
 * ladder counts in. `null` at the top, where there is nothing left to work toward — the sheet then
 * shows the total alone rather than a promise that never lands.
 */
export function nextRodGate(
  rods: readonly CigaretteContent[],
  sticks: number,
): { at: number; left: number } | null {
  const ahead = rods
    .map((rod) => (rod.unlock.kind === 'sessions' ? rod.unlock.count : null))
    .filter((count): count is number => count !== null && count > sticks)
    .sort((a, b) => a - b);
  const at = ahead[0];
  return at === undefined ? null : { at, left: at - sticks };
}

/** "3 / 11": how many of the ladder this player has met, in the order they meet them. */
export function shelfCount(rods: readonly CigaretteContent[], unlocked: readonly string[]): string {
  return `${rods.filter((rod) => unlocked.includes(rod.id)).length} / ${String(rods.length)}`;
}
