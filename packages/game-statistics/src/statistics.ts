/**
 * §33's statistics, derived — SPEC.md §33, §70.
 *
 * Raw Session[] -> Statistics Aggregator -> Derived Statistics (§70). This module keeps
 * no counters of its own: there is nothing to `totalPuffs++`, no module state, and no
 * write-back to `Progress`. Call it as often as you like — it is a pure function of the
 * log, and it never writes to the log it is handed (`readonly Session[]`).
 */

import { daysBetween } from '@puffly/shared';
import { SessionEventType, type Session } from '@puffly/game-core';
import {
  countByType,
  cravingPhases,
  dayIndexOf,
  dayIndexOfKey,
  isFiniteNumber,
  longestStreak,
  meanOrZero,
  reachedTarget,
  reportedCraving,
  roundToHundredth,
  sessionDayKeys,
  sessionDurationMs,
  sortedUnique,
  trailingStreak,
} from './log';
import type { Statistics, StatisticsOptions } from './types';

/** The answer for an empty log: every number 0, every string list empty. Never NaN (§72). */
function emptyStatistics(nowMs: number, utcOffsetMinutes: number): Statistics {
  return {
    sessionCount: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    longestSessionMs: 0,
    longestSessionId: null,
    totalPuffs: 0,
    totalEvents: 0,
    strongestGust: 0,
    eventCounts: {},
    averageCravingBefore: 0,
    averageCravingAfter: 0,
    averageCravingRelief: 0,
    cravingReportCount: 0,
    cravingsHandled: 0,
    smokeFreeDays: 0,
    smokeFreeAnchorMs: null,
    smokeFreeAnchorIsExplicit: false,
    dayKeys: [],
    activeDayCount: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    daysSinceLastActivity: daysSince(nowMs, utcOffsetMinutes, null),
  };
}

/** The earliest thing the log actually knows about, or null when it says nothing. */
export function earliestStart(sessions: readonly Session[]): number | null {
  let earliest: number | null = null;
  for (const session of sessions) {
    const startedAt = session.startedAt;
    if (!isFiniteNumber(startedAt)) continue;
    if (earliest === null || startedAt < earliest) earliest = startedAt;
  }
  return earliest;
}

function daysSince(nowMs: number, utcOffsetMinutes: number, newestDayKey: string | null): number {
  if (newestDayKey === null) return 0;
  const newest = dayIndexOfKey(newestDayKey);
  if (newest === null) return 0;
  return Math.max(0, dayIndexOf(nowMs, utcOffsetMinutes) - newest);
}

/**
 * §33/§84: smoke-free days count from the player's own anchor.
 *
 * `quitAnchorTimestamp` is the player's own statement. When it is absent the count falls
 * back to the first session in the log — the earliest day Puffly can actually evidence —
 * and is flagged `smokeFreeAnchorIsExplicit: false` so no shell can print it as a quit
 * date. With neither, the answer is 0 with a null anchor: nothing is invented.
 */
function resolveAnchor(
  sessions: readonly Session[],
  options: StatisticsOptions,
): { anchorMs: number | null; explicit: boolean } {
  const explicit = options.quitAnchorTimestamp;
  if (isFiniteNumber(explicit)) return { anchorMs: explicit, explicit: true };
  const first = earliestStart(sessions);
  return first === null
    ? { anchorMs: null, explicit: false }
    : { anchorMs: first, explicit: false };
}

/**
 * The hardest gust in the log, read off the rows the weather wrote.
 *
 * Filtered on the payload rather than on the event type alone: `ASH_FALL` carries two meanings in
 * this log (the column letting go on its own, and a draught in the room), and only the second one
 * rolls a strength. A log with neither is 0.
 */
function hardestGust(log: readonly Session[]): number {
  let strongest = 0;
  for (const session of log) {
    for (const event of session.events) {
      if (event.type !== SessionEventType.ASH_FALL) continue;
      const strength = event.payload?.['strength'];
      if (typeof strength === 'number' && Number.isFinite(strength) && strength > strongest) {
        strongest = strength;
      }
    }
  }
  return strongest;
}

export function deriveStatistics(
  sessions: readonly Session[],
  options: StatisticsOptions,
): Statistics {
  const log = [...sessions];
  const utcOffsetMinutes = isFiniteNumber(options.utcOffsetMinutes) ? options.utcOffsetMinutes : 0;
  const nowMs = isFiniteNumber(options.nowMs) ? options.nowMs : (earliestStart(log) ?? 0);

  if (log.length === 0) return emptyStatistics(nowMs, utcOffsetMinutes);

  const eventCounts = countByType(log);
  const strongestGust = hardestGust(log);
  let totalEvents = 0;
  for (const count of eventCounts.values()) totalEvents += count;

  let totalDurationMs = 0;
  let longestSessionMs = 0;
  let longestSessionId: string | null = null;
  let cravingsHandled = 0;
  let cravingReportCount = 0;
  const beforeValues: number[] = [];
  const afterValues: number[] = [];
  const collectedKeys: string[] = [];

  for (const session of log) {
    const durationMs = sessionDurationMs(session);
    totalDurationMs += durationMs;
    if (longestSessionId === null || durationMs > longestSessionMs) {
      longestSessionMs = durationMs;
      longestSessionId = session.id;
    }

    for (const key of sessionDayKeys(session, utcOffsetMinutes)) collectedKeys.push(key);

    const phases = cravingPhases(session);
    const before = reportedCraving(session.cravingBefore);
    const after = reportedCraving(session.cravingAfter);
    if (before !== null) beforeValues.push(before);
    if (after !== null) afterValues.push(after);
    if (phases.before || phases.after) cravingReportCount += 1;
    // §33: handled means the §31 clock ran out, or the player reported both ends of §32.
    if (reachedTarget(session) || (phases.before && phases.after)) cravingsHandled += 1;
  }

  const dayKeys = sortedUnique(collectedKeys);
  const newestDayKey = dayKeys[dayKeys.length - 1] ?? null;
  const anchor = resolveAnchor(log, options);
  const smokeFreeDays =
    anchor.anchorMs === null
      ? 0
      : Math.max(0, daysBetween(anchor.anchorMs, nowMs, utcOffsetMinutes));
  const averageCravingBefore = roundToHundredth(meanOrZero(beforeValues));
  const averageCravingAfter = roundToHundredth(meanOrZero(afterValues));

  return {
    sessionCount: log.length,
    totalDurationMs,
    averageDurationMs: roundToHundredth(totalDurationMs / log.length),
    longestSessionMs,
    longestSessionId,
    totalPuffs: eventCounts.get(SessionEventType.PUFF) ?? 0,
    totalEvents,
    strongestGust,
    eventCounts: toSortedRecord(eventCounts),
    averageCravingBefore,
    averageCravingAfter,
    averageCravingRelief: roundToHundredth(averageCravingBefore - averageCravingAfter),
    cravingReportCount,
    cravingsHandled,
    smokeFreeDays,
    smokeFreeAnchorMs: anchor.anchorMs,
    smokeFreeAnchorIsExplicit: anchor.explicit,
    dayKeys,
    activeDayCount: dayKeys.length,
    currentStreakDays: trailingStreak(dayKeys),
    longestStreakDays: longestStreak(dayKeys),
    daysSinceLastActivity: daysSince(nowMs, utcOffsetMinutes, newestDayKey),
  };
}

/** Alphabetical key order keeps a derived object stable across calls (§74). */
function toSortedRecord(counts: Map<string, number>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const [type, count] of [...counts].sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1))) {
    record[type] = count;
  }
  return record;
}
