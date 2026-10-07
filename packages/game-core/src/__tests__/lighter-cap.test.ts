/**
 * The flip-top's cap is simulation state, not a drawing trick — SPEC.md §15.
 *
 * `state.lighter.lid` exists because the picture, the click it should make and the idle flourishes
 * all have to agree on when the thing is open. A field nothing proves is moving is a field that can
 * silently stop moving, so these three claims are what makes it real: shut on the table, ahead of
 * the flame while it is struck, and back down afterwards.
 *
 * The middle one is the load-bearing direction. If the cap followed `flame` instead of `engaged` it
 * would always be *behind* the fire, and the flame would visibly burn up through a closed cap —
 * which is the exact artefact the two rates exist to avoid.
 */

import { describe, expect, it } from 'vitest';
import { STEP_MS } from '@puffly/game-core';
import { harness } from './harness';

/** Advance until `predicate` holds, returning the elapsed ms, or null if `limitMs` runs out first. */
function msUntil(
  h: ReturnType<typeof harness>,
  predicate: () => boolean,
  limitMs: number,
): number | null {
  for (let elapsed = 0; elapsed <= limitMs; elapsed += STEP_MS) {
    if (predicate()) return elapsed;
    h.run(STEP_MS);
  }
  return null;
}

describe('the cap opens before the fire does (§15)', () => {
  it('sits shut on the table', () => {
    const h = harness();
    expect(h.state().lighter.lid).toBe(0);
    h.run(4000);
    expect(h.state().lighter.lid, 'nothing is holding it, so nothing is open').toBeLessThan(0.02);
  });

  it('throws back ahead of the flame while the lighter is held', () => {
    const h = harness();
    h.press('lighter');
    // One pass, both crossings. Measuring them one after the other is a broken ruler: by the time
    // the second loop starts, the value it is watching has already been rising through the first.
    let openedAt: number | null = null;
    let litAt: number | null = null;
    for (let elapsed = 0; elapsed <= 1500; elapsed += STEP_MS) {
      const lighter = h.state().lighter;
      if (openedAt === null && lighter.lid >= 0.9) openedAt = elapsed;
      if (litAt === null && lighter.flame >= 0.9) litAt = elapsed;
      if (openedAt !== null && litAt !== null) break;
      h.run(STEP_MS);
    }
    expect(openedAt, 'the cap never reaches open').not.toBeNull();
    expect(litAt, 'the flame never reaches full').not.toBeNull();
    expect(openedAt!).toBeLessThan(litAt!);
    h.release('lighter');
  });

  it('falls shut again and stays shut', () => {
    const h = harness();
    h.press('lighter');
    h.run(700);
    h.release('lighter');
    const closedAt = msUntil(h, () => h.state().lighter.lid < 0.05, 2000);
    expect(closedAt, 'the cap never came down').not.toBeNull();
    h.run(3000);
    expect(h.state().lighter.lid).toBeLessThan(0.05);
  });
});
