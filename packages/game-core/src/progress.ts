/**
 * Growth and unlocks — SPEC.md §37-39.
 *
 * Unlocks are *state*, never dialogs: when something becomes available it is added to
 * `collection.fresh` and the shell fades that card in. §39 asks for "物品自己出现", and
 * §62 forbids the congratulation modal that would otherwise follow.
 */

import { dayKey, daysBetween } from '@puffly/shared';
import { emit, record } from './emit';
import { levelFor } from './levels';
import { SessionEventType } from './types/events';
import {
  CollectionCategory,
  SUBSTITUTE_IDS,
  type CollectionCategoryValue,
  type Progress,
  type SubstituteIdValue,
  type SubstituteTally,
} from './types/progress';
import type { ContentBundle, UnlockRule } from './types/content';
import type { CollectionSnapshot } from './types/state';
import type { EngineRuntime } from './runtime';

export interface Unlockable {
  category: CollectionCategoryValue;
  id: string;
  unlock: UnlockRule;
}

/** Stable reference for the collection cabinet and the unlock events. */
export function itemKey(category: CollectionCategoryValue, id: string): string {
  return `${category}:${id}`;
}

export function unlockablesFrom(bundle: ContentBundle): Unlockable[] {
  return [
    ...bundle.cigarettes.map((item) => ({
      category: CollectionCategory.CIGARETTES,
      id: item.id,
      unlock: item.unlock,
    })),
    ...bundle.lighters.map((item) => ({
      category: CollectionCategory.LIGHTERS,
      id: item.id,
      unlock: item.unlock,
    })),
    ...bundle.environments.map((item) => ({
      category: CollectionCategory.ENVIRONMENTS,
      id: item.id,
      unlock: item.unlock,
    })),
    ...bundle.ashtrays.map((item) => ({
      category: CollectionCategory.ASHTRAYS,
      id: item.id,
      unlock: item.unlock,
    })),
    ...bundle.smokeStyles.map((item) => ({
      category: CollectionCategory.SMOKE,
      id: item.id,
      unlock: item.unlock,
    })),
    ...bundle.soundProfiles.map((item) => ({
      category: CollectionCategory.SOUNDS,
      id: item.id,
      unlock: item.unlock,
    })),
  ];
}

export function ruleSatisfied(rule: UnlockRule, progress: Progress): boolean {
  switch (rule.kind) {
    case 'default':
      return true;
    case 'day':
      return progress.dayNumber >= rule.day;
    case 'sessions':
      return progress.sessions >= rule.count;
    case 'level':
      return levelFor(progress.sessions) >= rule.level;
    case 'puffs':
      return progress.puffs >= rule.count;
    case 'packs':
      return (progress.collectedPacks ?? []).length >= rule.count;
    default:
      return false;
  }
}

/** Items the player starts with, so the cabinet is never an empty grid on day one. */
export function initialUnlocks(bundle: ContentBundle): Record<CollectionCategoryValue, string[]> {
  const unlocked: Record<CollectionCategoryValue, string[]> = {
    [CollectionCategory.CIGARETTES]: [],
    [CollectionCategory.LIGHTERS]: [],
    [CollectionCategory.ENVIRONMENTS]: [],
    [CollectionCategory.ASHTRAYS]: [],
    [CollectionCategory.SMOKE]: [],
    [CollectionCategory.SOUNDS]: [],
  };
  for (const item of unlockablesFrom(bundle)) {
    if (item.unlock.kind === 'default') unlocked[item.category].push(item.id);
  }
  return unlocked;
}

export function collectionSnapshot(
  progress: Progress,
  bundle: ContentBundle,
  known: string[],
): CollectionSnapshot {
  const visible: Record<string, string[]> = {};
  for (const item of unlockablesFrom(bundle)) {
    if (progress.unlocked[item.category]?.includes(item.id)) {
      (visible[item.category] ??= []).push(item.id);
    }
  }
  return {
    unlocked: visible,
    fresh: known,
    unlockedSkins: bundle.skins
      .filter((skin) => ruleSatisfied(skin.unlock, progress))
      .map((skin) => skin.id),
  };
}

/**
 * §33's smoke-free days. This is a count of days on the player's own anchor, nothing
 * more — it is never phrased as a health claim (SPEC.md §84).
 */
export function smokeFreeDays(
  progress: Progress,
  quitAnchor: number | undefined,
  wallClockMs: number,
  utcOffsetMinutes: number,
): number {
  const anchor = quitAnchor ?? progress.startedAt;
  return Math.max(0, daysBetween(anchor, wallClockMs, utcOffsetMinutes));
}

/** Day rollover, the journey's active-day list, and the streak. */
export function updateDay(rt: EngineRuntime): void {
  const progress = rt.progress;
  const today = dayKey(rt.state.wallClockMs, rt.settings.utcOffsetMinutes);
  if (today === progress.lastActiveDayKey) return;

  progress.dayNumber = Math.max(
    1,
    daysBetween(progress.startedAt, rt.state.wallClockMs, rt.settings.utcOffsetMinutes) + 1,
  );
  if (!progress.activeDays.includes(today)) progress.activeDays.push(today);

  const gap = daysBetween(
    Date.parse(`${progress.lastActiveDayKey}T00:00:00Z`),
    Date.parse(`${today}T00:00:00Z`),
    0,
  );
  progress.longestStreakDays =
    gap === 1
      ? Math.max(progress.longestStreakDays, progress.activeDays.length)
      : progress.longestStreakDays;
  progress.lastActiveDayKey = today;
}

/**
 * The player did one of the deck's three 替代动作 instead of lighting something (S23).
 *
 * Counted, per day, on the same day key the journey line keeps — and counted only: no streak, no
 * reward, no punishment for skipping it, which is the line §10 draws under this page. An id the
 * three do not include returns null rather than inventing a fourth row; that is the only guard the
 * mechanic needs, because a fourth "alternative" is the deck's 减量 page turning into advice.
 */
export function takeSubstitute(rt: EngineRuntime, id: string): SubstituteTally | null {
  if (!(SUBSTITUTE_IDS as readonly string[]).includes(id)) return null;
  const today = dayKey(rt.state.wallClockMs, rt.settings.utcOffsetMinutes);
  const ledger = (rt.progress.substitutes ??= []);
  const entry = ledger.find((tally) => tally.id === id && tally.dayKey === today);
  if (entry === undefined) {
    const added: SubstituteTally = { id: id as SubstituteIdValue, dayKey: today, count: 1 };
    ledger.push(added);
    return added;
  }
  entry.count += 1;
  return entry;
}

/**
 * Called after any counter that can satisfy a rule changed. Returns the keys that
 * unlocked now, and queues them for the fade-in.
 */
export function evaluateUnlocks(rt: EngineRuntime): string[] {
  const fresh: string[] = [];
  for (const item of unlockablesFrom(rt.content.bundle)) {
    const list = rt.progress.unlocked[item.category] ?? (rt.progress.unlocked[item.category] = []);
    if (list.includes(item.id)) continue;
    if (!ruleSatisfied(item.unlock, rt.progress)) continue;
    list.push(item.id);
    const key = itemKey(item.category, item.id);
    fresh.push(key);
    rt.state.collection.fresh.push(key);
    emit(rt, { kind: 'unlock', atMs: rt.state.nowMs, category: item.category, id: item.id });
    record(rt, SessionEventType.UNLOCK, { category: item.category, id: item.id });
  }
  return fresh;
}

export function acknowledgeUnlocks(rt: EngineRuntime): void {
  rt.state.collection.fresh = [];
}
