/**
 * The achievement ladder is arithmetic, so it is judged as arithmetic — 2026-10-08 拍板 ⑤ 的
 * 「大概两个月可以走完」 is a claim about numbers, and it is checkable before anyone plays.
 */

import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  DECK_PACING,
  achievementsFor,
  reachedCount,
  twoMonthTotal,
  type AchievementLedger,
} from '../achievements';

const EMPTY: AchievementLedger = { sticks: 0, puffs: 0, ashGrams: 0, minutes: 0 };
/** Two months of the deck's own day: 25 分钟 × 60 天, 2.5 支/天, 12 口/支, 0.30 g/支. */
const TWO_MONTHS: AchievementLedger = {
  sticks: twoMonthTotal('sticks'),
  puffs: twoMonthTotal('puffs'),
  ashGrams: twoMonthTotal('ash'),
  minutes: twoMonthTotal('time'),
};
const axes = ['sticks', 'puffs', 'ash', 'time'] as const;

describe('the ladder is cut against the deck’s pacing (§ S22, 拍板 ⑤)', () => {
  it('ends each axis at two months of the deck’s own day', () => {
    console.log(
      `PACING two months = ${String(twoMonthTotal('sticks'))} 支 · ${String(
        twoMonthTotal('puffs'),
      )} 口 · ${String(twoMonthTotal('ash'))} g · ${String(twoMonthTotal('time'))} 分钟 (deck: ${String(
        DECK_PACING.sticksPerDay,
      )} 支/天 × ${String(DECK_PACING.daysForTwoMonths)} 天, ${String(
        DECK_PACING.puffsPerStick,
      )} 口/支, ${String(DECK_PACING.gramsPerStick)} g/支)`,
    );
    expect(twoMonthTotal('sticks')).toBe(150);
    expect(twoMonthTotal('puffs')).toBe(1800);
    expect(twoMonthTotal('ash')).toBe(45);
    expect(twoMonthTotal('time')).toBe(1500);
    for (const axis of axes) {
      const rungs = ACHIEVEMENTS.filter((a) => a.axis === axis);
      expect(rungs.at(-1)?.goal, `${axis} 的顶格`).toBe(twoMonthTotal(axis));
    }
  });

  it('ascends, and never leaves a gap that costs more than half the ladder', () => {
    for (const axis of axes) {
      const goals = ACHIEVEMENTS.filter((a) => a.axis === axis).map((a) => a.goal);
      expect(goals.length, `${axis} 有几格`).toBe(5);
      for (let index = 1; index < goals.length; index += 1) {
        const previous = goals[index - 1] ?? 0;
        const next = goals[index] ?? 0;
        expect(next, `${axis} 第 ${String(index + 1)} 格退步了`).toBeGreaterThan(previous);
        // A single rung that needs more than 2.5× the previous one is a month of waiting in the
        // middle of a "two months" set — the shape of the ladder is what the promise is made of.
        expect(
          next / previous,
          `${axis} 第 ${String(index + 1)} 格跳太远 (${next}/${previous})`,
        ).toBeLessThanOrEqual(2.5);
      }
    }
  });

  it('starts inside one of the deck’s days', () => {
    const first = axes.map((axis) => ACHIEVEMENTS.find((a) => a.axis === axis)?.goal ?? -1);
    console.log(
      `PACING first rungs = ${first.join(' ')}, a day is ${String(DECK_PACING.sticksPerDay)} 支`,
    );
    // The very first rung of every axis is reachable in under a week of the deck's own 25 分钟/天.
    for (const axis of axes) {
      const goal = ACHIEVEMENTS.find((a) => a.axis === axis)?.goal ?? -1;
      expect(goal, `${axis} 的第一格太远`).toBeLessThanOrEqual(Math.round(twoMonthTotal(axis) / 8));
    }
  });

  // The claim that the ladder adds no random draw of its own lives in
  // `tests/architecture.test.ts`: reading a file from a test inside the pure layer is
  // forbidden by §47, and that repo-level guard is where source-shape rules live.
  it('leaves room to extend: the axes are data, and the count is a denominator', () => {
    // 20 accumulating rungs + 3 rare moments. A new axis or a new rung has to be added here on
    // purpose, which is the whole reason the number is written down.
    expect(ACHIEVEMENTS).toHaveLength(4 * 5 + 3);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(
      ACHIEVEMENTS.filter((a) => a.axis === 'moment').every((a) => a.minGust !== undefined),
    ).toBe(true);
  });
});

describe('reading the ledger (§ S13’s local numbers)', () => {
  it('an empty log has earned nothing, and two months has earned the accumulating half', () => {
    const none = achievementsFor(EMPTY);
    expect(reachedCount(none)).toBe(0);
    const all = achievementsFor(TWO_MONTHS);
    expect(reachedCount(all)).toBe(4 * 5);
    expect(all.filter((r) => r.achievement.axis === 'moment')).toHaveLength(3);
    for (const rung of all.filter((r) => r.achievement.axis !== 'moment')) {
      expect(rung.reached, rung.achievement.id).toBe(true);
      expect(rung.ratio).toBe(1);
    }
  });

  it('each axis reads its own number and nobody else’s', () => {
    // A stick count must not buy a 口数 rung: the four figures are four different units, and the
    // deck's own save schema names them apart.
    const onlySticks = achievementsFor({ ...EMPTY, sticks: 150 });
    const reached = onlySticks.filter((rung) => rung.reached).map((rung) => rung.achievement.axis);
    expect(new Set(reached)).toEqual(new Set(['sticks']));
    const onlyAsh = achievementsFor({ ...EMPTY, ashGrams: 45 });
    expect(new Set(onlyAsh.filter((r) => r.reached).map((r) => r.achievement.axis))).toEqual(
      new Set(['ash']),
    );
  });

  it('reports how far a rung still is, because the row is digits not prose', () => {
    const half = achievementsFor({ ...EMPTY, puffs: 900 });
    const rung = half.find((r) => r.achievement.id === 'puffs.3');
    expect(rung?.ratio).toBeCloseTo(1, 5);
    // The 口数 rungs are 150 / 300 / 600 / 1200 / 1800, so a player at 150 is a quarter of the way
    // to the third rung and an eighth of the way to the fourth — read off the table, not from a
    // guess I wrote down next to it (the first version of this line said 0.25 for the fourth rung).
    const some = achievementsFor({ ...EMPTY, puffs: 150 });
    expect(some.find((r) => r.achievement.id === 'puffs.1')?.ratio).toBe(1);
    expect(some.find((r) => r.achievement.id === 'puffs.2')?.ratio).toBeCloseTo(0.5, 5);
    expect(some.find((r) => r.achievement.id === 'puffs.3')?.ratio).toBeCloseTo(0.25, 5);
    expect(some.find((r) => r.achievement.id === 'puffs.4')?.ratio).toBeCloseTo(0.125, 5);
    expect(some.find((r) => r.achievement.id === 'puffs.5')?.reached).toBe(false);
  });
});

describe('the rare moments cost what they say they cost (拍板 ⑥)', () => {
  // `ash_fall` rolls strength uniformly over the window its content rule names (0.4–1.0), so the
  // chance of a line at g is (1 - g) / 0.6. The moments are read off the log, so no draw is added.
  it('arrives one at a time as the gust gets harder', () => {
    const odds = (line: number) => (1 - line) / 0.6;
    console.log(
      `MOMENTS ${ACHIEVEMENTS.filter((a) => a.axis === 'moment')
        .map((a) => `${a.id}@${String(a.minGust)}=${(odds(a.minGust ?? 1) * 100).toFixed(2)}%`)
        .join(' ')}`,
    );
    expect(reachedCount(achievementsFor(TWO_MONTHS, 0))).toBe(20);
    expect(reachedCount(achievementsFor(TWO_MONTHS, 0.98))).toBe(21);
    expect(reachedCount(achievementsFor(TWO_MONTHS, 0.99))).toBe(22);
    expect(reachedCount(achievementsFor(TWO_MONTHS, 0.996))).toBe(23);
    // None of them is common: the loosest line is still a few per cent of those events.
    for (const achievement of ACHIEVEMENTS.filter((a) => a.axis === 'moment')) {
      expect(odds(achievement.minGust ?? 1), achievement.id).toBeLessThan(0.05);
    }
  });
});
