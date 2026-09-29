/** §37-39: growth and the collection cabinet. */

import type { UnlockRule } from './content';

export const CollectionCategory = {
  CIGARETTES: 'cigarettes',
  LIGHTERS: 'lighters',
  ENVIRONMENTS: 'environments',
  ASHTRAYS: 'ashtrays',
  SMOKE: 'smoke',
  SOUNDS: 'sounds',
} as const;

export type CollectionCategoryValue = (typeof CollectionCategory)[keyof typeof CollectionCategory];

export const COLLECTION_CATEGORIES: readonly CollectionCategoryValue[] =
  Object.values(CollectionCategory);

/** §38: one row in the cabinet, described by visuals rather than paragraphs. */
export interface CollectionItem {
  category: CollectionCategoryValue;
  id: string;
  name: string;
  unlock: UnlockRule;
  /** Short glyph list the shell draws; never a sentence (§29). */
  glyph: string;
  /** 0..1 preview hints for the card, so locked items still look like *something*. */
  swatch: readonly [number, number, number];
}

/** §37: the ladder is day-based, and that is as complex as it gets. */
export const MILESTONE_DAYS = [1, 3, 7, 14, 21, 30, 45, 60, 90] as const;

export interface Progress {
  version: 1;
  /** Timestamp of the player's very first session; day 1 is that day. */
  startedAt: number;
  dayNumber: number;
  sessions: number;
  puffs: number;
  ashDropped: number;
  /**
   * Consecutive-day count. `cravings handled` is deliberately absent: it is derived
   * from stored sessions by `@puffly/game-statistics` rather than double-booked here
   * (SPEC.md §70).
   */
  longestStreakDays: number;
  unlocked: Record<CollectionCategoryValue, string[]>;
  /** Items whose fade-in the shell has already played (§39). */
  acknowledgedUnlocks: string[];
  lastActiveDayKey: string;
  /** Day keys, for the §34 journey line. */
  activeDays: string[];
}
