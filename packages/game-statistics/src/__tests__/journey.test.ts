/**
 * §34's journey line and §37's milestone ladder, from the same hand-built log (§72).
 *
 * The stops must come from the sessions, not from `Progress`'s counters (§70): a test
 * below hands over a `Progress` whose numbers are deliberately wrong and expects the
 * timeline to be unchanged.
 */

import { describe, expect, it } from 'vitest';
import { MILESTONE_DAYS, type Progress } from '@puffly/game-core';
import {
  JOURNEY_EVENT_TYPES,
  MILESTONE_DAY_VALUES,
  deriveJourney,
  journeyGlyphs,
  journeyMilestones,
  milestoneDayFor,
} from '../journey';
import { at, makeProgress, sampleSessions } from './fixture';

/** Day 1 is 2026-01-05, the day the player's own `Progress.startedAt` falls on. */
const PROGRESS = makeProgress();

describe('deriveJourney: one stop per active day (§34)', () => {
  const stops = deriveJourney(sampleSessions(), PROGRESS, { utcOffsetMinutes: 0 });

  it('has exactly the four active days the log shows', () => {
    expect(stops.map((stop) => stop.dayKey)).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
    ]);
  });

  it("numbers days from the player's own first day and badges the §37 ladder", () => {
    expect(stops.map((stop) => stop.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(stops.map((stop) => stop.milestoneDay)).toEqual([1, null, 3, null]);
    expect(stops.map((stop) => stop.marker)).toEqual(['◆', '●', '◆', '●']);
    expect(journeyGlyphs(stops)).toBe('◆──●──◆──●');
    expect(journeyMilestones(stops).map((stop) => stop.dayNumber)).toEqual([1, 3]);
  });

  it('counts a session on the day it started', () => {
    // ses-1 + ses-2 on 01-05, ses-3 on 01-06, ses-4 + ses-5 on 01-08.
    // 01-07 exists only because ses-3 burned past midnight, so no session started there.
    expect(stops.map((stop) => stop.sessionCount)).toEqual([2, 1, 0, 2]);
  });

  it('counts the §34 tokens on the day each event actually happened', () => {
    expect(stops[0]?.symbols).toEqual([
      { token: 'puff', count: 5 }, // ses-1's 3 + ses-2's 2
      { token: 'extinguish', count: 2 },
    ]);
    expect(stops[1]?.symbols).toEqual([{ token: 'puff', count: 1 }]);
    // ses-3's wind, ash fall and extinguish all land after midnight
    expect(stops[2]?.symbols).toEqual([
      { token: 'extinguish', count: 1 },
      { token: 'wind', count: 1 },
    ]);
    expect(stops[3]?.symbols).toEqual([
      { token: 'puff', count: 4 },
      { token: 'extinguish', count: 1 },
    ]);
  });

  it('exposes the raw event behind every token', () => {
    expect(JOURNEY_EVENT_TYPES).toEqual({ puff: 'PUFF', extinguish: 'EXTINGUISH', wind: 'WIND' });
  });

  it('can trim the tail of a long journey without reordering it', () => {
    const lastTwo = deriveJourney(sampleSessions(), PROGRESS, { utcOffsetMinutes: 0, maxStops: 2 });
    expect(lastTwo.map((stop) => stop.dayKey)).toEqual(['2026-01-07', '2026-01-08']);
    expect(deriveJourney(sampleSessions(), PROGRESS, { maxStops: 0 })).toEqual([]);
  });
});

describe('deriveJourney: §70 derived, never copied from Progress', () => {
  it('reads nothing but the day-1 anchor out of Progress', () => {
    const bogus: Progress = {
      ...makeProgress(),
      sessions: 9_999,
      puffs: 9_999,
      ashDropped: 9_999,
      longestStreakDays: 9_999,
      dayNumber: 9_999,
      lastActiveDayKey: '1999-12-31',
      activeDays: ['1999-12-31'],
    };
    expect(deriveJourney(sampleSessions(), bogus, { utcOffsetMinutes: 0 })).toEqual(
      deriveJourney(sampleSessions(), PROGRESS, { utcOffsetMinutes: 0 }),
    );
  });

  it('falls back to the log itself when there is no Progress yet', () => {
    const withoutProgress = deriveJourney(sampleSessions(), null, { utcOffsetMinutes: 0 });
    // The earliest session is on 2026-01-05 too, so day 1 stays day 1.
    expect(withoutProgress.map((stop) => stop.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(deriveJourney([], null)).toEqual([]);
  });

  it('marks a session that crossed midnight as two active days', () => {
    const stops = deriveJourney(sampleSessions(), PROGRESS, { utcOffsetMinutes: 0 });
    expect(stops.some((stop) => stop.dayKey === '2026-01-07')).toBe(true);
  });
});

describe('milestoneDayFor: §37 ladder', () => {
  it('recognises only the ladder days', () => {
    for (const day of MILESTONE_DAYS) expect(milestoneDayFor(day)).toBe(day);
    expect(MILESTONE_DAY_VALUES).toEqual([1, 3, 7, 14, 21, 30, 45, 60, 90]);
    for (const day of [0, 2, 4, 5, 8, 13, 91, 365]) expect(milestoneDayFor(day)).toBeNull();
  });

  it('badges a day-30 stop as a milestone', () => {
    const sessions = sampleSessions();
    const thirtieth = sessions[0];
    if (thirtieth === undefined) throw new Error('fixture lost ses-1');
    // Re-date ses-1 to day 30 of the same progress anchor.
    thirtieth.startedAt = at(5, 0, 0) + 29 * 86_400_000;
    thirtieth.endedAt = thirtieth.startedAt + 60_000;
    for (const event of thirtieth.events) event.timestamp = thirtieth.startedAt;

    const stops = deriveJourney([thirtieth], PROGRESS, { utcOffsetMinutes: 0 });
    expect(stops).toHaveLength(1);
    expect(stops[0]?.dayNumber).toBe(30);
    expect(stops[0]?.isMilestone).toBe(true);
    expect(stops[0]?.marker).toBe('◆');
  });
});
