/**
 * §34's journey — a visual timeline, not a dashboard.
 *
 * One stop per active day, each carrying only what an icon needs: how loud the day was
 * (puffs, extinguishes, wind) and whether the day sits on the §37 ladder. No sentences,
 * no totals, no `Total / Average / Statistics` header (§34).
 *
 * The stops come from the session log, never from `Progress.sessions` or `Progress.puffs`
 * (§70). `Progress` is used for exactly one thing: the player's own day-1 anchor, because
 * §37 counts days from the day the player started.
 */

import { dayKey } from '@puffly/shared';
import { MILESTONE_DAYS, SessionEventType, type Progress, type Session } from '@puffly/game-core';
import {
  dayIndexOfKey,
  eventsOf,
  isFiniteNumber,
  sessionDayKeys,
  sessionWindow,
  sortedUnique,
} from './log';
import { earliestStart } from './statistics';
import {
  JOURNEY_TOKENS,
  type JourneyOptions,
  type JourneyStop,
  type JourneySymbol,
  type JourneyToken,
} from './types';

/** Which raw event each §34 token is counted from. Add a token here, get an icon free. */
export const JOURNEY_EVENT_TYPES: Record<JourneyToken, string> = {
  puff: SessionEventType.PUFF,
  extinguish: SessionEventType.EXTINGUISH,
  wind: SessionEventType.WIND,
};

/** `MILESTONE_DAYS` is a tuple of literals; widened once so `includes(number)` stays honest. */
export const MILESTONE_DAY_VALUES: readonly number[] = MILESTONE_DAYS;

/** The §37 ladder day for a day number, or null when the day is an ordinary one. */
export function milestoneDayFor(dayNumber: number): number | null {
  for (const milestone of MILESTONE_DAY_VALUES) {
    if (milestone === dayNumber) return milestone;
  }
  return null;
}

interface DayBucket {
  readonly key: string;
  /** Sessions *started* this day; a session that ends here still marks the day active. */
  sessionCount: number;
  readonly counts: Map<string, number>;
}

function addCount(bucket: DayBucket, type: string): void {
  bucket.counts.set(type, (bucket.counts.get(type) ?? 0) + 1);
}

function bucketize(sessions: readonly Session[], utcOffsetMinutes: number): Map<string, DayBucket> {
  const buckets = new Map<string, DayBucket>();
  const bucketFor = (key: string): DayBucket => {
    const existing = buckets.get(key);
    if (existing !== undefined) return existing;
    const created: DayBucket = { key, sessionCount: 0, counts: new Map<string, number>() };
    buckets.set(key, created);
    return created;
  };

  for (const session of sessions) {
    if (!isFiniteNumber(session.startedAt)) continue;
    const { startMs, endMs } = sessionWindow(session);
    bucketFor(dayKey(startMs, utcOffsetMinutes)).sessionCount += 1;
    // A run that finishes after midnight also makes that day count as active (§34).
    for (const key of sessionDayKeys(session, utcOffsetMinutes)) bucketFor(key);

    for (const event of eventsOf(session)) {
      if (typeof event.type !== 'string') continue;
      // An event belongs to the day it happened on; the end day of a midnight run gets
      // its own smoke, and is what makes that day active at all.
      const stamp = isFiniteNumber(event.timestamp) ? event.timestamp : endMs;
      addCount(bucketFor(dayKey(stamp, utcOffsetMinutes)), event.type);
    }
  }
  return buckets;
}

function symbolsFor(bucket: DayBucket): JourneySymbol[] {
  const symbols: JourneySymbol[] = [];
  for (const token of JOURNEY_TOKENS) {
    const count = bucket.counts.get(JOURNEY_EVENT_TYPES[token]) ?? 0;
    if (count > 0) symbols.push({ token, count });
  }
  return symbols;
}

export function deriveJourney(
  sessions: readonly Session[],
  progress: Progress | null,
  options: JourneyOptions = {},
): JourneyStop[] {
  const utcOffsetMinutes = isFiniteNumber(options.utcOffsetMinutes) ? options.utcOffsetMinutes : 0;
  const log = [...sessions];
  const anchorMs =
    progress !== null && isFiniteNumber(progress.startedAt)
      ? progress.startedAt
      : (earliestStart(log) ?? null);

  const buckets = bucketize(log, utcOffsetMinutes);
  const keys = sortedUnique(buckets.keys());
  const anchorIndex = anchorMs === null ? null : dayIndexOfKey(dayKey(anchorMs, utcOffsetMinutes));

  let stops: JourneyStop[] = keys.map((key) => {
    const bucket = buckets.get(key);
    const dayIndex = dayIndexOfKey(key);
    const dayNumber =
      dayIndex === null || anchorIndex === null ? 1 : Math.max(1, dayIndex - anchorIndex + 1);
    const milestoneDay = milestoneDayFor(dayNumber);
    return {
      dayKey: key,
      dayNumber,
      isMilestone: milestoneDay !== null,
      milestoneDay,
      sessionCount: bucket?.sessionCount ?? 0,
      symbols: bucket === undefined ? [] : symbolsFor(bucket),
      marker: milestoneDay === null ? '●' : '◆',
    };
  });

  const maxStops = options.maxStops;
  if (isFiniteNumber(maxStops) && maxStops >= 0) {
    const limit = Math.floor(maxStops);
    stops = stops.slice(Math.max(0, stops.length - limit));
  }
  return stops;
}

/** The §34 line as glyphs only — `●──●──◆`. Shells with real art read `deriveJourney`. */
export function journeyGlyphs(stops: readonly JourneyStop[], separator = '──'): string {
  return stops.map((stop) => stop.marker).join(separator);
}

/** Milestone stops only, so a shell can badge `D1  D7  D30` without walking the list. */
export function journeyMilestones(stops: readonly JourneyStop[]): JourneyStop[] {
  return stops.filter((stop) => stop.isMilestone);
}
