/**
 * §35's today panel — a handful of numbers with icons, zero sentences.
 *
 *   27
 *   ☀️  8h     🌙  3h
 *   🔥  42     🌫️  18
 *
 * Everything is read off the sessions that started today, and the day/night split comes
 * from each session's own `timeOfDay` (§35) rather than from a clock the shell would have
 * to interpret. Like the rest of this package: derived, never stored (§70).
 */

import { dayKey } from '@puffly/shared';
import { SessionEventType, type Session, type TimeOfDayId } from '@puffly/game-core';
import { countByType, cravingPhases, isFiniteNumber, reachedTarget, sessionWindow } from './log';
import type { StatisticsOptions, TodayView } from './types';

/** ☀️ — the parts of §24's day a player would call daylight. Typed against `TimeOfDayId`. */
export const DAYLIGHT_TIME_OF_DAY: readonly string[] = [
  'morning',
  'afternoon',
  'sunset',
] satisfies readonly TimeOfDayId[];

/** 🌙 */
export const NIGHT_TIME_OF_DAY: readonly string[] = [
  'night',
  'late-night',
] satisfies readonly TimeOfDayId[];

/**
 * 🌫️ — everything that put visible vapour in the air. `PUFF` is the main one (§15) and a
 * puff *is* smoke, so it is counted here as well as under 🔥.
 */
export const SMOKE_EVENT_TYPES: readonly string[] = [
  SessionEventType.PUFF,
  SessionEventType.ASH,
  SessionEventType.ASH_FALL,
  SessionEventType.SMOKE_SWIRL,
  SessionEventType.EMBER_FLARE,
  SessionEventType.EXTINGUISH,
];

/** Sessions that *started* on the local day of `nowMs`; a run past midnight stays on its own day. */
export function sessionsOnDay(
  sessions: readonly Session[],
  dayKeyValue: string,
  utcOffsetMinutes: number,
): Session[] {
  return [...sessions].filter((session) => {
    const startedAt = session.startedAt;
    if (!isFiniteNumber(startedAt)) return false;
    return dayKey(startedAt, utcOffsetMinutes) === dayKeyValue;
  });
}

function emptyToday(dayKeyValue: string): TodayView {
  return {
    dayKey: dayKeyValue,
    sessionCount: 0,
    totalDurationMs: 0,
    daylightMs: 0,
    nightMs: 0,
    daylightHours: 0,
    nightHours: 0,
    puffs: 0,
    smokeEvents: 0,
    cravingsHandled: 0,
    eventCounts: {},
    unclassifiedDurationMs: 0,
  };
}

function hours(ms: number): number {
  if (!isFiniteNumber(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function deriveTodayView(
  sessions: readonly Session[],
  options: StatisticsOptions,
): TodayView {
  const utcOffsetMinutes = isFiniteNumber(options.utcOffsetMinutes) ? options.utcOffsetMinutes : 0;
  const nowMs = isFiniteNumber(options.nowMs) ? options.nowMs : 0;
  const today = dayKey(nowMs, utcOffsetMinutes);
  const todays = sessionsOnDay(sessions, today, utcOffsetMinutes);
  if (todays.length === 0) return emptyToday(today);

  let totalDurationMs = 0;
  let daylightMs = 0;
  let nightMs = 0;
  let unclassifiedDurationMs = 0;
  let cravingsHandled = 0;
  let smokeEvents = 0;

  const counts = countByType(todays);
  for (const type of SMOKE_EVENT_TYPES) smokeEvents += counts.get(type) ?? 0;

  for (const session of todays) {
    const { durationMs } = sessionWindow(session);
    totalDurationMs += durationMs;
    const timeOfDay: unknown = session.timeOfDay;
    if (typeof timeOfDay === 'string' && DAYLIGHT_TIME_OF_DAY.includes(timeOfDay))
      daylightMs += durationMs;
    else if (typeof timeOfDay === 'string' && NIGHT_TIME_OF_DAY.includes(timeOfDay))
      nightMs += durationMs;
    // §84: a time-of-day this build does not know is reported, never folded into a bucket.
    else unclassifiedDurationMs += durationMs;

    const phases = cravingPhases(session);
    if (reachedTarget(session) || (phases.before && phases.after)) cravingsHandled += 1;
  }

  return {
    dayKey: today,
    sessionCount: todays.length,
    totalDurationMs,
    daylightMs,
    nightMs,
    daylightHours: hours(daylightMs),
    nightHours: hours(nightMs),
    puffs: counts.get(SessionEventType.PUFF) ?? 0,
    smokeEvents,
    cravingsHandled,
    eventCounts: Object.fromEntries([...counts].sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1))),
    unclassifiedDurationMs,
  };
}
