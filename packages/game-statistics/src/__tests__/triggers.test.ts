/**
 * §36's trigger tracking, derived from the log (§70) and sorted so the shell can put the
 * most-reached-for icon first without any prose.
 */

import { describe, expect, it } from 'vitest';
import { deriveTriggerBreakdown, dominantTrigger, triggerCounts } from '../triggers';
import { at, makeSession, sampleSessions } from './fixture';
import { SessionEventType } from '@puffly/game-core';

describe('deriveTriggerBreakdown (§36)', () => {
  it('counts the sessions each tag appears in, most first then alphabetical', () => {
    // coffee: ses-1 + ses-4. Everything else once: drink, drive, meal, night, work.
    expect(deriveTriggerBreakdown(sampleSessions())).toEqual([
      { tag: 'coffee', count: 2 },
      { tag: 'drink', count: 1 },
      { tag: 'drive', count: 1 },
      { tag: 'meal', count: 1 },
      { tag: 'night', count: 1 },
      { tag: 'work', count: 1 },
    ]);
  });

  it('counts a tag once per session even when both sources say it', () => {
    // ses-4 stores `meal` in `triggers` *and* records a TRIGGER event for it.
    const breakdown = deriveTriggerBreakdown(sampleSessions());
    expect(breakdown.find((entry) => entry.tag === 'meal')?.count).toBe(1);
  });

  it('reads a tag that only exists as an event', () => {
    const sessions = [
      makeSession({
        id: 'ses-event-only',
        startedAt: at(9, 8, 0),
        endedAt: at(9, 8, 5),
        // no `triggers` array at all
        events: [
          { type: SessionEventType.SESSION_START, at: at(9, 8, 0) },
          { type: SessionEventType.TRIGGER, at: at(9, 8, 1), payload: { tag: 'people' } },
          { type: SessionEventType.TRIGGER, at: at(9, 8, 2), payload: { tag: 'people' } },
        ],
      }),
    ];
    expect(deriveTriggerBreakdown(sessions)).toEqual([{ tag: 'people', count: 1 }]);
  });

  it('answers with an empty list, never a crash, for an empty log', () => {
    expect(deriveTriggerBreakdown([])).toEqual([]);
    expect(dominantTrigger([])).toBeNull();
    expect(triggerCounts([])).toEqual({});
  });

  it('exposes the same numbers as a lookup and as the loudest tag', () => {
    expect(triggerCounts(sampleSessions())).toEqual({
      coffee: 2,
      drink: 1,
      drive: 1,
      meal: 1,
      night: 1,
      work: 1,
    });
    expect(dominantTrigger(sampleSessions())).toEqual({ tag: 'coffee', count: 2 });
  });

  it('is derived: adding a TRIGGER event changes the breakdown', () => {
    const sessions = sampleSessions();
    const second = sessions.find((session) => session.id === 'ses-2');
    if (second === undefined) throw new Error('fixture lost ses-2');
    second.events.push({
      id: 'evt-coffee',
      type: SessionEventType.TRIGGER,
      timestamp: at(5, 21, 33),
      payload: { tag: 'coffee' },
    });
    expect(deriveTriggerBreakdown(sessions)).toEqual([
      { tag: 'coffee', count: 3 },
      { tag: 'drink', count: 1 },
      { tag: 'drive', count: 1 },
      { tag: 'meal', count: 1 },
      { tag: 'night', count: 1 },
      { tag: 'work', count: 1 },
    ]);
  });
});
