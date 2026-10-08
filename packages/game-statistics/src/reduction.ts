/**
 * S20 — the reduction page, and the whole of its stance in one file.
 *
 * Every number here is the player's own log restated: how many sticks today, the last seven
 * days as bars, and the difference against the same span a week ago. Nothing is compared to a
 * health target, nothing is projected, nothing is streaked, and nothing is withheld when the
 * limit is passed — the brief's redline is that this page must not read as a lecture (§10).
 */

import { dayKey } from '@puffly/shared';
import {
  SUBSTITUTE_IDS,
  sessionWasLit,
  type Session,
  type SubstituteIdValue,
} from '@puffly/game-core';
import type { StatisticsOptions } from './types';

const DAY_MS = 86_400_000;

export interface ReductionDay {
  dayKey: string;
  sticks: number;
  /** The one bar the page highlights, because it is still being written. */
  isToday: boolean;
}

export interface ReductionView {
  todaySticks: number;
  /**
   * S23's three 替代动作, today, in the order the page draws them. A count and nothing else: no
   * streak, no reward, no advice attached — the deck's 减量 page offers an alternative, it does not
   * keep score of whether the player took it (§10).
   */
  substitutes: readonly { id: SubstituteIdValue; count: number }[];
  /** Seven days, oldest first, ending at today. */
  week: ReductionDay[];
  /**
   * S20's 「近 7 天 日均 N 支」: the same seven sticks divided by the same seven days, rounded to the
   * tenth it can be shown at. It is the player's own log restated, not a population figure, so it
   * carries no ≈ — the archive's estimates do, and `archive.test.ts` holds that line.
   */
  dailyAverage: number;
  thisWeekSticks: number;
  lastWeekSticks: number;
  /** This week minus the same span a week earlier. Negative means fewer. */
  deltaSticks: number;
}

/**
 * One **lit** session is one stick — and the predicate is the core's, not a copy of it, because the
 * same number is what the cabinet's gates and the level ladder read (§ S23's 「点了不抽也行」). A break
 * recorded without ever catching a rod is a break spent doing something else, and it is not this
 * tally's business.
 */
function sticksByDay(sessions: readonly Session[], utcOffsetMinutes: number): Map<string, number> {
  const tally = new Map<string, number>();
  for (const session of sessions) {
    if (!sessionWasLit(session)) continue;
    const key = dayKey(session.startedAt, utcOffsetMinutes);
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return tally;
}

export function deriveReduction(
  sessions: readonly Session[],
  options: StatisticsOptions,
): ReductionView {
  const tally = sticksByDay(sessions, options.utcOffsetMinutes);
  const today = dayKey(options.nowMs, options.utcOffsetMinutes);

  const week: ReductionDay[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const key = dayKey(options.nowMs - back * DAY_MS, options.utcOffsetMinutes);
    week.push({ dayKey: key, sticks: tally.get(key) ?? 0, isToday: key === today });
  }

  const thisWeekSticks = week.reduce((sum, day) => sum + day.sticks, 0);
  let lastWeekSticks = 0;
  for (let back = 13; back >= 7; back -= 1) {
    lastWeekSticks +=
      tally.get(dayKey(options.nowMs - back * DAY_MS, options.utcOffsetMinutes)) ?? 0;
  }

  return {
    todaySticks: tally.get(today) ?? 0,
    substitutes: SUBSTITUTE_IDS.map((id) => ({
      id,
      count:
        (options.substitutes ?? []).find((row) => row.id === id && row.dayKey === today)?.count ??
        0,
    })),
    week,
    // `week.length`, not a literal 7: the denominator has to be the window that was just built, or
    // the two halves of this sentence stop talking about the same days.
    dailyAverage: Number((thisWeekSticks / week.length).toFixed(1)),
    thisWeekSticks,
    lastWeekSticks,
    deltaSticks: thisWeekSticks - lastWeekSticks,
  };
}
