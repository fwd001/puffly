/**
 * S20 — the reduction page's numbers, all of them the player's own log restated.
 *
 * The fixture's five breaks fall on four days (see `fixture.ts`): 01-05 holds two, 01-06 one,
 * 01-08 two. With `nowMs` at midday on 01-08 and no offset, the seven-day window is 01-02
 * through 01-08 and the span before it is 12-26 through 01-01, which the fixture leaves empty.
 */

import { describe, expect, it } from 'vitest';
import { deriveReduction } from '../reduction';
import { at, deepFreeze, makeSession, sampleSessions } from './fixture';

const TODAY = { nowMs: at(8, 12, 0), utcOffsetMinutes: 0 };

describe('deriveReduction (S20)', () => {
  it('lays the last seven days out oldest first, today last', () => {
    const view = deriveReduction(sampleSessions(), TODAY);
    expect(view.week.map((day) => day.dayKey)).toEqual([
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
    ]);
    expect(view.week.map((day) => day.isToday)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('counts each day its own breaks, and carries no other shape', () => {
    const view = deriveReduction(sampleSessions(), TODAY);
    expect(view.todaySticks).toBe(2);
    expect(view.week.map((day) => day.sticks)).toEqual([0, 0, 0, 2, 1, 0, 2]);
    expect(view.thisWeekSticks).toBe(5);
    expect(Object.keys(view).sort()).toEqual([
      'dailyAverage',
      'deltaSticks',
      'lastWeekSticks',
      'thisWeekSticks',
      'todaySticks',
      'week',
    ]);
  });

  it('gives the seven days their average, on the window it just built (S20 日均)', () => {
    const view = deriveReduction(sampleSessions(), TODAY);
    // 5 breaks over the seven days of 01-02..01-08.
    expect(view.dailyAverage).toBe(0.7);
    // And the relation, so the figure cannot drift from the bars beside it: the denominator is the
    // window that was built, not a 7 typed in twice.
    expect(view.dailyAverage).toBe(Number((view.thisWeekSticks / view.week.length).toFixed(1)));
  });

  it('averages the window, not the history', () => {
    const base = sampleSessions();
    const far = makeSession({ id: 'far', startedAt: at(19, 9, 0), events: [] });
    const near = makeSession({ id: 'near', startedAt: at(6, 9, 0), events: [] });
    // 01-19 is nine days ahead of the window's edge, 01-06 is inside it. The first must not move
    // anything; the second must move the average with the bar.
    expect(deriveReduction([...base, far], TODAY)).toEqual(view(base));
    const moved = deriveReduction([...base, near], TODAY);
    expect(moved.thisWeekSticks).toBe(6);
    expect(moved.dailyAverage, 'a bar moved and the average did not').toBe(0.9);
    expect(deriveReduction(base, TODAY).dailyAverage).not.toBe(moved.dailyAverage);
  });

  it('writes a whole average whole, because 14.0 is not what a page says', () => {
    const twoMore = [
      ...sampleSessions(),
      makeSession({ id: 'x1', startedAt: at(4, 8, 0), events: [] }),
      makeSession({ id: 'x2', startedAt: at(3, 8, 0), events: [] }),
    ];
    const view = deriveReduction(twoMore, TODAY);
    expect(view.thisWeekSticks).toBe(7);
    expect(view.dailyAverage).toBe(1);
    expect(String(view.dailyAverage)).not.toContain('.0');
  });

  it('compares against the same span a week earlier, and says so with a sign', () => {
    const view = deriveReduction(sampleSessions(), TODAY);
    // The fixture has nothing in 12-26..01-01, so the whole of this week is the difference.
    expect(view.lastWeekSticks).toBe(0);
    expect(view.deltaSticks).toBe(5);

    // Four breaks before and one after the same span: the player is down, and the number says down.
    const fewer = [
      ...[0, 1, 2].map((n) =>
        makeSession({ id: `last-${n}`, startedAt: at(1, 9, 0), endedAt: at(1, 9, 5) }),
      ),
      makeSession({ id: 'this-0', startedAt: at(8, 9, 0), endedAt: at(8, 9, 5) }),
    ];
    const quiet = deriveReduction(fewer, TODAY);
    expect(quiet.thisWeekSticks).toBe(1);
    expect(quiet.lastWeekSticks).toBe(3);
    expect(quiet.deltaSticks).toBe(-2);
  });

  it('dates a break by the local offset rather than by UTC', () => {
    const lateEvening = [
      makeSession({ id: 'ses-late', startedAt: at(8, 23, 0), endedAt: at(8, 23, 4) }),
    ];
    // 01-08 23:00 UTC is 01-09 07:00 in UTC+8, so it belongs to a new day there.
    expect(
      deriveReduction(lateEvening, { nowMs: at(9, 1, 0), utcOffsetMinutes: 480 }).todaySticks,
    ).toBe(1);
    expect(
      deriveReduction(lateEvening, { nowMs: at(9, 1, 0), utcOffsetMinutes: 0 }).todaySticks,
    ).toBe(0);
  });

  it('gives seven zero bars to a player who has not taken a single break', () => {
    const empty = deriveReduction([], TODAY);
    expect(empty.todaySticks).toBe(0);
    expect(empty.thisWeekSticks).toBe(0);
    expect(empty.lastWeekSticks).toBe(0);
    expect(empty.deltaSticks).toBe(0);
    expect(empty.week).toHaveLength(7);
    expect(empty.week.every((day) => day.sticks === 0)).toBe(true);
  });

  it('is derived: the next break moves the bars, and the log is never written back to', () => {
    const sessions = deepFreeze(sampleSessions());
    const before = deriveReduction(sessions, TODAY);
    expect(() =>
      deriveReduction(
        [...sessions, makeSession({ id: 'ses-6', startedAt: at(8, 13, 0), endedAt: at(8, 13, 5) })],
        TODAY,
      ),
    ).not.toThrow();
    const after = deriveReduction(
      [...sessions, makeSession({ id: 'ses-6', startedAt: at(8, 13, 0), endedAt: at(8, 13, 5) })],
      TODAY,
    );
    expect(after.todaySticks).toBe(3);
    expect(after.week[6]?.sticks).toBe(3);
    expect(before.todaySticks).toBe(2);
  });
});

function view(sessions: ReturnType<typeof sampleSessions>): ReturnType<typeof deriveReduction> {
  return deriveReduction(sessions, TODAY);
}
