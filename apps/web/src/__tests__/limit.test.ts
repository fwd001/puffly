/**
 * The ceiling's truth table. Two rows matter most: a player who never picked a line can never be
 * over it, and reaching one only ever changes how a ring is drawn — the break itself is not part
 * of this judgement, which is what the architecture guard next door keeps true.
 */

import { describe, expect, it } from 'vitest';
import { isOverLimit } from '../limit';

describe('the daily ceiling the player set (§10 limitRule)', () => {
  it('a player who never picked a ceiling is never over it', () => {
    expect(isOverLimit(0, undefined)).toBe(false);
    expect(isOverLimit(40, undefined)).toBe(false);
    // A save that arrived with a zero is the same answer: nobody asked for a line at zero.
    expect(isOverLimit(1, 0)).toBe(false);
  });

  it('the line is the number itself, and one below it is not over', () => {
    expect(isOverLimit(4, 5)).toBe(false);
    expect(isOverLimit(5, 5)).toBe(true);
    expect(isOverLimit(6, 5)).toBe(true);
  });

  it('counting up from nothing crosses the line exactly once', () => {
    const crossed = Array.from({ length: 9 }, (_, sticks) => isOverLimit(sticks, 4));
    expect(crossed).toEqual([false, false, false, false, true, true, true, true, true]);
  });
});
