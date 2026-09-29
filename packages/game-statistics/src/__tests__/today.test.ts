/**
 * §35's today panel: numbers only. The expectations below are the arithmetic of
 * `fixture.ts` read by hand — 2026-01-08 holds ses-4 (morning, 07:00 -> 07:30, 4 puffs)
 * and ses-5 (night, 21:00 -> 23:00, no puffs).
 */

import { describe, expect, it } from 'vitest';
import { SessionEventType } from '@puffly/game-core';
import {
  DAYLIGHT_TIME_OF_DAY,
  NIGHT_TIME_OF_DAY,
  SMOKE_EVENT_TYPES,
  deriveTodayView,
  sessionsOnDay,
} from '../today';
import { at, makeSession, sampleSessions } from './fixture';

const TODAY = { nowMs: at(8, 12, 0), utcOffsetMinutes: 0 };

describe('deriveTodayView (§35)', () => {
  const today = deriveTodayView(sampleSessions(), TODAY);

  it('counts the breaks taken today', () => {
    expect(today.dayKey).toBe('2026-01-08');
    expect(today.sessionCount).toBe(2);
    // 1_800_000 + 7_200_000
    expect(today.totalDurationMs).toBe(9_000_000);
  });

  it("splits hours by each session's own time of day", () => {
    expect(today.daylightMs).toBe(1_800_000); // ses-4, morning
    expect(today.nightMs).toBe(7_200_000); // ses-5, night
    // 1_800_000 / 3_600_000 = 0.5     7_200_000 / 3_600_000 = 2
    expect(today.daylightHours).toBe(0.5);
    expect(today.nightHours).toBe(2);
    expect(today.unclassifiedDurationMs).toBe(0);
  });

  it('counts puffs and visible smoke separately', () => {
    expect(today.puffs).toBe(4);
    // ses-4: 4 puffs + 1 ash + 1 extinguish; ses-5: none of these
    expect(today.smokeEvents).toBe(6);
    expect(today.eventCounts).toEqual({
      SESSION_START: 2,
      SESSION_END: 2,
      LIGHT: 1,
      PUFF: 4,
      ASH: 1,
      EXTINGUISH: 1,
      CRAVING: 3,
      TRIGGER: 1,
    });
  });

  it('counts a handled craving only on §31/§32 evidence', () => {
    // ses-4 reported 9 -> 2; ses-5 reported a "before" only.
    expect(today.cravingsHandled).toBe(1);
  });

  it('reads the day before for another day, and the midnight crossing stays on its own day', () => {
    const previous = deriveTodayView(sampleSessions(), {
      nowMs: at(6, 12, 0),
      utcOffsetMinutes: 0,
    });
    expect(previous.dayKey).toBe('2026-01-06');
    expect(previous.sessionCount).toBe(1); // ses-3, started 23:58
    expect(previous.puffs).toBe(1);
    // puff + ash_fall + extinguish = 3 of SMOKE_EVENT_TYPES inside ses-3
    expect(previous.smokeEvents).toBe(3);
    expect(previous.nightMs).toBe(360_000);
    expect(previous.daylightMs).toBe(0);

    const dayAfter = deriveTodayView(sampleSessions(), {
      nowMs: at(7, 12, 0),
      utcOffsetMinutes: 0,
    });
    // ses-3 *ended* on 01-07 but belongs to 01-06, so 01-07 has no breaks of its own.
    expect(dayAfter.sessionCount).toBe(0);
    expect(dayAfter.totalDurationMs).toBe(0);
  });

  it('gives zeros, not NaN, for a day with no sessions', () => {
    const empty = deriveTodayView(sampleSessions(), { nowMs: at(20, 12, 0), utcOffsetMinutes: 0 });
    expect(empty).toEqual({
      dayKey: '2026-01-20',
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
    });
    expect(deriveTodayView([], TODAY).daylightHours).toBe(0);
  });

  it('reports a time-of-day it does not know instead of guessing a bucket (§84)', () => {
    const odd = makeSession({
      id: 'ses-odd',
      startedAt: at(8, 3, 0),
      endedAt: at(8, 3, 0, 10),
      timeOfDay: 'night',
      events: [{ type: SessionEventType.SESSION_START, at: at(8, 3, 0) }],
    });
    // A content build newer than this package may name a part of day we have not seen.
    Object.assign(odd, { timeOfDay: 'dusk' });

    const view = deriveTodayView([odd], TODAY);
    expect(view.daylightMs).toBe(0);
    expect(view.nightMs).toBe(0);
    expect(view.unclassifiedDurationMs).toBe(10_000);
    expect(view.totalDurationMs).toBe(10_000);
  });

  it('keeps the §35 vocabulary in one place', () => {
    expect(DAYLIGHT_TIME_OF_DAY).toEqual(['morning', 'afternoon', 'sunset']);
    expect(NIGHT_TIME_OF_DAY).toEqual(['night', 'late-night']);
    expect(SMOKE_EVENT_TYPES).toContain(SessionEventType.PUFF);
    expect(sessionsOnDay(sampleSessions(), '2026-01-05', 0).map((session) => session.id)).toEqual([
      'ses-1',
      'ses-2',
    ]);
  });

  it('is derived: a puff event added today moves the number', () => {
    const sessions = sampleSessions();
    const fourth = sessions.find((session) => session.id === 'ses-4');
    if (fourth === undefined) throw new Error('fixture lost ses-4');
    fourth.events.push({ id: 'evt-puff-5', type: SessionEventType.PUFF, timestamp: at(8, 7, 28) });
    const view = deriveTodayView(sessions, TODAY);
    expect(view.puffs).toBe(5);
    expect(view.smokeEvents).toBe(7);
  });
});
