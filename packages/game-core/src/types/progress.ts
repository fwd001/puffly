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

/**
 * S23's three 替代动作 — the whole of the 减量 page's "do this instead of a rod" row, and the only
 * thing about that row which is a mechanic rather than a picture: how many times each was taken.
 */
export const SubstituteId = {
  BREATHE: 'breathe',
  WATER: 'water',
  WALK: 'walk',
} as const;

export type SubstituteIdValue = (typeof SubstituteId)[keyof typeof SubstituteId];

export const SUBSTITUTE_IDS: readonly SubstituteIdValue[] = Object.values(SubstituteId);

/** One action, one day, how many times it was taken that day. */
export interface SubstituteTally {
  id: SubstituteIdValue;
  /** The journey's own day key, because the page that reads this is a daily page. */
  dayKey: string;
  count: number;
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
   * The cigarette boxes in the collection (§ S19). Optional because a save written before the
   * cabinet existed has none: an empty collection is a fact, not a missing field, and the last
   * skin is gated on it.
   */
  collectedPacks?: string[];
  /**
   * Consecutive-day count. `cravings handled` is deliberately absent: it is derived
   * from stored sessions by `@puffly/game-statistics` rather than double-booked here
   * (SPEC.md §70).
   */
  longestStreakDays: number;
  unlocked: Record<CollectionCategoryValue, string[]>;
  /** Items whose fade-in the shell has already played (§39). */
  acknowledgedUnlocks: string[];
  /**
   * The 替代动作 ledger (§ S23's 计次). Optional for the same reason the cabinet is: a save written
   * before that row existed has no opinions in it, and an empty ledger is a fact, not a missing
   * field. Nothing is streaked or rewarded here — 减量 must not turn into a lesson (§10).
   */
  substitutes?: SubstituteTally[];
  lastActiveDayKey: string;
  /** Day keys, for the §34 journey line. */
  activeDays: string[];
}
