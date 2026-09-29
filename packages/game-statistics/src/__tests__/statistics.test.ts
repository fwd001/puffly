/**
 * §33 + §70 + §72: every number below is computed by hand from the log in `fixture.ts`,
 * not read back off the implementation. An empty log must answer with zeros rather than
 * `NaN`, and a single extra event must move a derived number — which is the difference
 * between statistics that are derived and counters that are faked.
 *
 * Vitest `environment: 'node'` is enough: this package touches no platform (§47).
 */

import { describe, expect, it } from 'vitest';
import { SessionEventType } from '@puffly/game-core';
import { deriveStatistics } from '../statistics';
import type { StatisticsOptions } from '../types';
import { at, deepFreeze, makeSession, openEndedSessions, sampleSessions } from './fixture';

/** 2026-01-10T12:00Z, the player's own UTC. */
const PLAIN: StatisticsOptions = { nowMs: at(10, 12, 0), utcOffsetMinutes: 0 };
/** The player said they quit on 2026-01-03T20:00Z (§84: their anchor, not ours). */
const ANCHORED: StatisticsOptions = { ...PLAIN, quitAnchorTimestamp: at(3, 20, 0) };

describe('deriveStatistics: §33 from the hand-built log', () => {
  const sessions = sampleSessions();
  const statistics = deriveStatistics(sessions, PLAIN);

  it('counts sessions and durations', () => {
    // 300_000 + 360_000 + 360_000 + 1_800_000 + 7_200_000 = 10_020_000
    expect(statistics.sessionCount).toBe(5);
    expect(statistics.totalDurationMs).toBe(10_020_000);
    // 10_020_000 / 5 = 2_004_000
    expect(statistics.averageDurationMs).toBe(2_004_000);
    expect(statistics.longestSessionMs).toBe(7_200_000);
    expect(statistics.longestSessionId).toBe('ses-5');
  });

  it('counts events per type out of §69, and puffs out of PUFF events', () => {
    // ses-1 10 + ses-2 9 + ses-3 7 + ses-4 12 + ses-5 3 = 41
    expect(statistics.totalEvents).toBe(41);
    expect(statistics.totalPuffs).toBe(10); // 3 + 2 + 1 + 4 + 0
    expect(statistics.eventCounts).toEqual({
      SESSION_START: 5,
      SESSION_END: 5,
      SESSION_TARGET: 1,
      PICK_UP: 2,
      LIGHT: 3,
      PUFF: 10,
      ASH: 1,
      ASH_FALL: 1,
      WIND: 1,
      EXTINGUISH: 4,
      CRAVING: 6,
      TRIGGER: 2,
    });
  });

  it('averages the §32 self-reports over the sessions that made them', () => {
    // before: (7 + 5 + 9 + 4) / 4 = 6.25     after: (3 + 2) / 2 = 2.5
    expect(statistics.averageCravingBefore).toBe(6.25);
    expect(statistics.averageCravingAfter).toBe(2.5);
    expect(statistics.averageCravingRelief).toBe(3.75);
    expect(statistics.cravingReportCount).toBe(4);
  });

  it('treats a session as a handled craving only on §31/§32 evidence', () => {
    // ses-1 SESSION_TARGET + both reports, ses-4 both reports.
    // ses-2 and ses-5 report a "before" only, ses-3 reports nothing.
    expect(statistics.cravingsHandled).toBe(2);
  });

  it('lists active days, including the day ses-3 crossed midnight into', () => {
    expect(statistics.dayKeys).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']);
    expect(statistics.activeDayCount).toBe(4);
    // 05, 06, 07, 08 are unbroken
    expect(statistics.currentStreakDays).toBe(4);
    expect(statistics.longestStreakDays).toBe(4);
    // nowMs is 01-10, the newest active day is 01-08
    expect(statistics.daysSinceLastActivity).toBe(2);
  });

  it("counts smoke-free days from the player's own anchor, and says which anchor it used", () => {
    const anchored = deriveStatistics(sessions, ANCHORED);
    // 2026-01-03 -> 2026-01-10 = 7 whole local days, on the player's stated anchor
    expect(anchored.smokeFreeDays).toBe(7);
    expect(anchored.smokeFreeAnchorMs).toBe(at(3, 20, 0));
    expect(anchored.smokeFreeAnchorIsExplicit).toBe(true);

    // With no stated anchor, only the log's own first session backs the count (§84).
    // 2026-01-05 -> 2026-01-10 = 5
    expect(statistics.smokeFreeDays).toBe(5);
    expect(statistics.smokeFreeAnchorMs).toBe(at(5, 9, 0));
    expect(statistics.smokeFreeAnchorIsExplicit).toBe(false);
  });

  it('is stable: the same log always derives the same numbers', () => {
    expect(deriveStatistics(sampleSessions(), PLAIN)).toEqual(statistics);
  });
});

describe('deriveStatistics: §70 really derived', () => {
  it('moves when the event log moves', () => {
    const sessions = sampleSessions();
    const before = deriveStatistics(sessions, PLAIN);
    const first = sessions.find((session) => session.id === 'ses-1');
    if (first === undefined) throw new Error('fixture lost ses-1');

    // One more puff event, recorded like the engine would record it (§69).
    first.events.push({ id: 'evt-11', type: SessionEventType.PUFF, timestamp: at(5, 9, 3) + 500 });
    const after = deriveStatistics(sessions, PLAIN);

    expect(after.totalPuffs).toBe(before.totalPuffs + 1);
    expect(after.totalEvents).toBe(before.totalEvents + 1);
    expect(after.eventCounts[SessionEventType.PUFF]).toBe(11);
    // A puff is not a handled craving: unrelated numbers stay put.
    expect(after.cravingsHandled).toBe(before.cravingsHandled);
  });

  it('moves when the §31 target event moves', () => {
    const sessions = sampleSessions();
    const fourth = sessions.find((session) => session.id === 'ses-4');
    if (fourth === undefined) throw new Error('fixture lost ses-4');
    fourth.events = fourth.events.filter((event) => event.type !== SessionEventType.CRAVING);
    fourth.cravingAfter = undefined;

    // ses-4 now has neither a target event nor a full before/after pair.
    expect(deriveStatistics(sessions, PLAIN).cravingsHandled).toBe(1);
  });

  it('never writes back to the log it is handed (§70)', () => {
    const frozen = deepFreeze(sampleSessions());
    expect(() => deriveStatistics(frozen, PLAIN)).not.toThrow();
    expect(deriveStatistics(frozen, PLAIN).totalPuffs).toBe(10);
  });

  it('has no way to read the counters stored on Progress (§70)', () => {
    // `deriveStatistics` takes the log and a clock, and nothing else: `Progress.sessions`
    // and `Progress.puffs` are not even in scope, so they cannot drift into the answer.
    const derive = deriveStatistics;
    expect(derive.length).toBe(2);
    const derived = derive(sampleSessions(), PLAIN);
    // The values equal what the log says, not what a counter could say.
    expect(derived.sessionCount).toBe(sampleSessions().length);
    expect(derived.totalPuffs).toBe(
      sampleSessions().reduce(
        (total, session) =>
          total + session.events.filter((event) => event.type === SessionEventType.PUFF).length,
        0,
      ),
    );
  });
});

describe('deriveStatistics: robustness (§72)', () => {
  it('answers with zeros, never NaN, for an empty log', () => {
    const statistics = deriveStatistics([], PLAIN);
    expect(statistics.sessionCount).toBe(0);
    expect(statistics.totalDurationMs).toBe(0);
    expect(statistics.averageDurationMs).toBe(0);
    expect(statistics.longestSessionMs).toBe(0);
    expect(statistics.longestSessionId).toBeNull();
    expect(statistics.totalPuffs).toBe(0);
    expect(statistics.totalEvents).toBe(0);
    expect(statistics.eventCounts).toEqual({});
    expect(statistics.averageCravingBefore).toBe(0);
    expect(statistics.averageCravingAfter).toBe(0);
    expect(statistics.averageCravingRelief).toBe(0);
    expect(statistics.cravingsHandled).toBe(0);
    expect(statistics.smokeFreeDays).toBe(0);
    expect(statistics.smokeFreeAnchorMs).toBeNull();
    expect(statistics.dayKeys).toEqual([]);
    expect(statistics.activeDayCount).toBe(0);
    expect(statistics.currentStreakDays).toBe(0);
    expect(statistics.longestStreakDays).toBe(0);
    const numbers = Object.values(statistics).filter(
      (value): value is number => typeof value === 'number',
    );
    expect(numbers.length).toBeGreaterThan(10);
    for (const value of numbers) expect(Number.isNaN(value)).toBe(false);
  });

  it('uses the last event of a session that never recorded endedAt', () => {
    const statistics = deriveStatistics(openEndedSessions(), PLAIN);
    // 06:00:00Z -> 06:02:00Z, the last event's own timestamp; `targetMs` is never used
    // as a stand-in for a duration the log does not record.
    expect(statistics.sessionCount).toBe(1);
    expect(statistics.totalDurationMs).toBe(120_000);
    expect(statistics.totalPuffs).toBe(2);
    expect(statistics.dayKeys).toEqual(['2026-01-09']);
  });

  it('survives a corrupt timestamp without producing NaN', () => {
    const [broken] = openEndedSessions();
    if (broken === undefined) throw new Error('fixture lost ses-open');
    broken.startedAt = Number.NaN;
    const statistics = deriveStatistics([broken], PLAIN);
    expect(Number.isNaN(statistics.totalDurationMs)).toBe(false);
    expect(Number.isNaN(statistics.averageDurationMs)).toBe(false);
    expect(Number.isNaN(statistics.smokeFreeDays)).toBe(false);
    expect(statistics.smokeFreeAnchorMs).toBeNull();
    // Nothing usable on the calendar, so no day is claimed (§84: not even 1970-01-01).
    expect(statistics.dayKeys).toEqual([]);
    expect(statistics.activeDayCount).toBe(0);
  });

  it('breaks a streak on a missed day but keeps the longest run', () => {
    const log = [5, 6, 7, 10].map((day) =>
      makeSession({ id: `ses-${day}`, startedAt: at(day, 6, 0), endedAt: at(day, 6, 5) }),
    );
    const statistics = deriveStatistics(log, { nowMs: at(10, 12, 0), utcOffsetMinutes: 0 });
    expect(statistics.dayKeys).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-10']);
    expect(statistics.activeDayCount).toBe(4);
    expect(statistics.currentStreakDays).toBe(1); // 01-10 stands alone
    expect(statistics.longestStreakDays).toBe(3); // 05, 06, 07 ran unbroken
    expect(statistics.daysSinceLastActivity).toBe(0);
  });

  it('counts every day a long run touched, not just its endpoints', () => {
    const long = makeSession({
      id: 'ses-long',
      startedAt: at(5, 20, 0),
      endedAt: at(9, 4, 0),
    });
    const statistics = deriveStatistics([long], PLAIN);
    expect(statistics.dayKeys).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ]);
    expect(statistics.currentStreakDays).toBe(5);
  });

  it('honours a non-zero UTC offset when naming days', () => {
    // At UTC+8 the log lands differently on the calendar: ses-2's 21:30Z is already the
    // morning of 01-06, ses-3 stops being a midnight crossing, and ses-5 rolls into 01-09.
    const east = deriveStatistics(sampleSessions(), { ...PLAIN, utcOffsetMinutes: 8 * 60 });
    expect(east.dayKeys).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ]);
    expect(east.activeDayCount).toBe(5);
    expect(east.currentStreakDays).toBe(5);
    // 2026-01-05T09:00Z (the log's own anchor) to 2026-01-10T12:00Z is still 5 local days
    expect(east.smokeFreeDays).toBe(5);
  });
});
