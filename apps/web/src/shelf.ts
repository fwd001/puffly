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

/** "3 / 11": how many of the ladder this player has met, in the order they meet them. */
export function shelfCount(rods: readonly CigaretteContent[], unlocked: readonly string[]): string {
  return `${rods.filter((rod) => unlocked.includes(rod.id)).length} / ${String(rods.length)}`;
}
