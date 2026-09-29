import { describe, expect, it } from 'vitest';
import {
  civilFromDayIndex,
  createRng,
  dayKey,
  daysBetween,
  formatClock,
  hourOfTimestamp,
  MS_PER_DAY,
  normalizeSeed,
} from '@puffly/shared';

describe('seeded randomness (shared, §47, §71)', () => {
  it('is a stream of floats in [0, 1)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('same seed, same stream', () => {
    const a = createRng(777).range(0, 100);
    const b = createRng(777).range(0, 100);
    expect(a).toBe(b);
  });

  it('covers the range without clumping at the ends', () => {
    const rng = createRng(4242);
    let low = 0;
    let high = 0;
    for (let i = 0; i < 20_000; i++) {
      const value = rng.next();
      if (value < 0.1) low++;
      if (value > 0.9) high++;
    }
    expect(low).toBeGreaterThan(1400);
    expect(high).toBeGreaterThan(1400);
  });

  it('weighted picks honour zero weights', () => {
    const rng = createRng(31);
    const picked = rng.weighted([
      { value: 'never', weight: 0 },
      { value: 'always', weight: 5 },
    ]);
    expect(picked).toBe('always');
    for (let i = 0; i < 200; i++) {
      expect(rng.weighted([{ value: 'x', weight: 0 }])).toBeUndefined();
    }
  });

  it('forks are stable and different from the parent', () => {
    const parent = createRng(9);
    const first = parent.fork(1).next();
    const second = parent.fork(1).next();
    expect(first).toBe(second);
    expect(first).not.toBe(parent.next());
  });

  it('never returns undefined for a non-empty pick, and never invents one for an empty pool', () => {
    const rng = createRng(5);
    expect(rng.pick([1])).toBe(1);
    expect(rng.pick<number[]>([])).toBeUndefined();
  });

  it('normalizeSeed refuses 0 and non-finite values', () => {
    expect(normalizeSeed(0)).toBe(1);
    expect(normalizeSeed(Number.NaN)).toBe(1);
    expect(normalizeSeed(-12)).toBeGreaterThan(0);
  });
});

describe('clock and calendar (shared, §24, §31, §52)', () => {
  const stamp = Date.UTC(2026, 0, 15, 9, 0, 0);

  it('formats the §31 countdown with digits only', () => {
    expect(formatClock(180_000)).toBe('03:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61_000)).toBe('01:01');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('reads the local hour through the stored offset, not the machine running the test', () => {
    expect(hourOfTimestamp(stamp, 0)).toBe(9);
    expect(hourOfTimestamp(stamp, 120)).toBe(11);
    expect(hourOfTimestamp(stamp, -600)).toBe(23);
    expect(hourOfTimestamp(stamp, 330)).toBe(14);
  });

  it('keys a day and counts whole days between two moments', () => {
    expect(dayKey(stamp, 0)).toBe('2026-01-15');
    expect(daysBetween(stamp, stamp + 3 * MS_PER_DAY, 0)).toBe(3);
    expect(daysBetween(stamp, stamp + 6 * 3_600_000, 0)).toBe(0);
    expect(daysBetween(stamp, stamp + MS_PER_DAY - 1, 0)).toBe(1);
  });

  it('converts epoch days back to civil dates, including a leap day', () => {
    const index = Math.floor(Date.UTC(2024, 1, 29) / MS_PER_DAY);
    expect(civilFromDayIndex(index)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(dayKey(Date.UTC(2024, 1, 29), 0)).toBe('2024-02-29');
  });
});
