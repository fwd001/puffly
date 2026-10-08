/**
 * S23's three 替代动作, as a mechanic — 「按照计次」.
 *
 * The deck's 减量 page offers three things to do instead of lighting something, and the decision on
 * them was "make them count, keep it a game". Counting is the whole of the mechanic: a tap writes one
 * line for one day, and nothing else in the simulation moves. That is a deliberate limit — the page
 * that counts substitutes must not become the page that grades the player (§10's redline: 不劝诫, no
 * health claim, no penalty), so the ledger has no consumers beyond the day's own three numbers.
 *
 * The second thing pinned here is that there are exactly three. A fourth row would be advice wearing
 * the row's shape, and the only guard against that is the id list.
 */

import { describe, expect, it } from 'vitest';
import { SUBSTITUTE_IDS } from '@puffly/game-core';
import { harness } from './harness';

describe('the 替代动作 ledger (§ S23: 按照计次)', () => {
  it('keeps the deck’s three, and only those three', () => {
    expect([...SUBSTITUTE_IDS].sort()).toEqual(['breathe', 'walk', 'water']);
  });

  it('counts two taps of one action as one row, taken twice', () => {
    const h = harness();
    expect(h.engine.takeSubstitute('breathe')?.count).toBe(1);
    expect(h.engine.takeSubstitute('breathe')?.count).toBe(2);
    const progress = h.engine.progressSnapshot();
    const rows = progress.substitutes ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('breathe');
    // The day key is the journey's own today, because the page that reads this is a daily page.
    expect(rows[0]?.dayKey).toBe(progress.lastActiveDayKey);
  });

  it('refuses a fourth alternative and changes no number', () => {
    const h = harness();
    expect(h.engine.takeSubstitute('see a doctor')).toBeNull();
    expect(h.engine.progressSnapshot().substitutes ?? []).toEqual([]);
    // An action the deck does not offer must not be able to buy its way in through a real one.
    expect(h.engine.takeSubstitute('water')?.count).toBe(1);
    expect((h.engine.progressSnapshot().substitutes ?? []).map((row) => row.id)).toEqual(['water']);
  });

  it('touches nothing but the ledger', () => {
    const h = harness();
    const before = h.engine.getState();
    h.engine.takeSubstitute('walk');
    const after = h.engine.getState();
    // The rod, the room and the clock are all unchanged: a counted breath of fresh air is not a puff.
    expect(after.cigarette).toEqual(before.cigarette);
    expect(after.world).toEqual(before.world);
    expect(after.nowMs).toBe(before.nowMs);
  });
});
