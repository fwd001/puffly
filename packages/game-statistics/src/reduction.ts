/**
 * S20 — the reduction page, and the whole of its stance in one file.
 *
 * Every number here is the player's own log restated: how many sticks today, the last seven
 * days as bars, and the difference against the same span a week ago. Nothing is compared to a
 * health target, nothing is projected, nothing is streaked, and nothing is withheld when the
 * limit is passed — the brief's redline is that this page must not read as a lecture (§10).
 */

import { dayKey } from '@puffly/shared';
import type { Session } from '@puffly/game-core';
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
  /** Seven days, oldest first, ending at today. */
  week: ReductionDay[];
  thisWeekSticks: number;
  lastWeekSticks: number;
  /** This week minus the same span a week earlier. Negative means fewer. */
  deltaSticks: number;
}

/** One session is one stick: the log's own unit, not a换算. */
function sticksByDay(sessions: readonly Session[], utcOffsetMinutes: number): Map<string, number> {
  const tally = new Map<string, number>();
  for (const session of sessions) {
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
    week,
    thisWeekSticks,
    lastWeekSticks,
    deltaSticks: thisWeekSticks - lastWeekSticks,
  };
}
