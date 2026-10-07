/**
 * The places are hung on a ladder the player can see — §6.1.
 *
 * They used to be hung on the calendar. `{ kind: 'day', day: 30 }` means a room opens because a
 * month went by, which is not something anyone did; and with seven rooms spread over 45 days the
 * order a player meets them in is an accident of how often the app happens to be open. A level is
 * the same progress with a floor under it, and the ladder is now the axis the places are ordered
 * on.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { LEVEL_THRESHOLDS, levelFor, ruleSatisfied, sessionsToNextLevel } from '@puffly/game-core';
import type { Progress } from '@puffly/game-core';

const ledger = (over: Partial<Progress>): Progress =>
  ({
    version: 1,
    startedAt: 0,
    dayNumber: 1,
    sessions: 0,
    puffs: 0,
    ashDropped: 0,
    longestStreakDays: 1,
    unlocked: {},
    acknowledgedUnlocks: [],
    ...over,
  }) as Progress;

describe('the level ladder (§6.1)', () => {
  it('only ever goes up, and every rung is standing on the one below it', () => {
    let previous = 0;
    for (let sessions = 0; sessions <= 400; sessions++) {
      const level = levelFor(sessions);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
    expect(levelFor(0)).toBe(1);
    expect(levelFor(400)).toBe(LEVEL_THRESHOLDS.length);
    // A ladder with two rungs at the same number of breaks is not a ladder.
    expect(new Set(LEVEL_THRESHOLDS).size).toBe(LEVEL_THRESHOLDS.length);
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });

  it('says how far there is left to go, and stops saying it at the top', () => {
    expect(sessionsToNextLevel(0)).toBe(2);
    expect(sessionsToNextLevel(1)).toBe(1);
    expect(sessionsToNextLevel(2)).toBe(2);
    expect(sessionsToNextLevel(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] ?? 0)).toBe(0);
  });

  it('opens a place for breaks kept, not for a month going by', () => {
    const third = { kind: 'level' as const, level: 3 };
    // Read from the ladder rather than typed in: what this case claims is the *semantics* — the
    // threshold opens it, one break short does not, and a year of not smoking opens nothing. The
    // numbers themselves are the authored array, and the case above is what holds those.
    const needs = LEVEL_THRESHOLDS[2] ?? 0;
    expect(ruleSatisfied(third, ledger({ sessions: needs - 1 }))).toBe(false);
    expect(ruleSatisfied(third, ledger({ sessions: needs }))).toBe(true);
    expect(ruleSatisfied(third, ledger({ sessions: 0, dayNumber: 400 }))).toBe(false);
  });
});

describe('the rooms sit in order on it (§6.1)', () => {
  const places = DEFAULT_CONTENT.environments;

  it('hangs every place on a rung that exists, starting from the first', () => {
    const levels = places.map((place) => {
      expect(place.unlock.kind, `${place.id} is not on the ladder any more`).toBe('level');
      return place.unlock.kind === 'level' ? place.unlock.level : 0;
    });
    expect(levels).toContain(1);
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(LEVEL_THRESHOLDS.length);
    }
    console.log(`LADDER ${places.map((p, i) => `${p.id}=${String(levels[i])}`).join(' ')}`);
  });

  it('has a ladder with exactly as many rungs as there are places', () => {
    // The two halves of §6.1 have to move together: the deck's twelve venues arrived as rows in one
    // table, and a set of places with fewer rungs than doors means the last few are unreachable by
    // definition — the ladder just stops. Asserted as a count, not as a comment about one.
    expect(LEVEL_THRESHOLDS.length).toBe(places.length);
  });

  it('has no two places sharing a rung, so the order a player meets them in is authored', () => {
    const levels = places.map((p) => (p.unlock.kind === 'level' ? p.unlock.level : -1));
    expect(new Set(levels).size, `shared rungs: ${levels.join(',')}`).toBe(levels.length);
  });

  it('reaches its last room inside the ladder it declares', () => {
    const top = Math.max(...places.map((p) => (p.unlock.kind === 'level' ? p.unlock.level : 0)));
    expect(top).toBe(LEVEL_THRESHOLDS.length);
    // And the breaks that take you there are a number a person would call a habit, not a year.
    expect(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] ?? 0).toBeLessThanOrEqual(60);
  });
});
