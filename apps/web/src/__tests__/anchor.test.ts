/**
 * One line of policy, and the three cases that make it a policy rather than an accident: the
 * first light sets the anchor, a second light never moves it, and a date the player picked is
 * never overwritten by the app.
 */

import { describe, expect, it } from 'vitest';
import { anchorAtLight } from '../anchor';

const FIRST = Date.UTC(2026, 9, 6, 9, 0, 0);

describe('where the count starts (§10)', () => {
  it('the first light becomes the anchor when nobody has set one', () => {
    expect(anchorAtLight(FIRST, undefined)).toBe(FIRST);
  });

  it('no later light touches it', () => {
    expect(anchorAtLight(FIRST + 86_400_000, FIRST)).toBeUndefined();
  });

  it('a date the player chose counts as chosen, even if it is in the past', () => {
    expect(anchorAtLight(FIRST, Date.UTC(2024, 0, 1))).toBeUndefined();
  });
});
