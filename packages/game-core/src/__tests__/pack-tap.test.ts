/**
 * The pack answers a tap — SPEC.md S14's 取烟, and the second half of 「场景物件都是可以互动的」.
 *
 * The deck's first gesture has always been "pick one out", and the game has always had a red box on
 * the table for it. What it did not have was anywhere to press: §37 took the pack's anchor and hit
 * radius away precisely because an object that advertises itself as a control and then does nothing
 * is worse than scenery, and nothing read either number. This file is the third leg — the verb.
 *
 * Two of these claims are about what a tap must *not* do, and they are the ones that would fail
 * quietly. A pack that lit the lighter, drew a puff, or cost a stick would still pass "the pack
 * picks a rod up"; so the states that already have a rod out get measured against everything else on
 * the table, not only against the state name.
 */

import { describe, expect, it } from 'vitest';
import { HIT, hitToleranceFor, resolveTarget } from '@puffly/game-core';
import { harness, lit, type Harness } from './harness';

/** A stub lying in the tray, which is the one state where "give me another" is a request. */
function stubInTray(h: Harness): void {
  lit(h);
  h.tap('ashtray');
  h.until(() => h.state().cigarette.state === 'EXTINGUISHED', 4000);
  h.tap('ashtray');
  h.until(() => h.state().cigarette.state === 'DISCARDED', 500);
}

describe('the pack is where a rod comes from (S14 取烟)', () => {
  it('a tap on it picks one up', () => {
    const h = harness();
    expect(h.state().cigarette.state).toBe('IDLE');
    h.tap('pack');
    expect(h.state().cigarette.state).toBe('PICKED_UP');
  });

  it('and so does holding it, because the player did not choose which', () => {
    const h = harness();
    h.press('pack');
    expect(h.state().cigarette.state).toBe('PICKED_UP');
    h.release('pack');
    expect(h.state().cigarette.state).toBe('PICKED_UP');
  });

  it('with the stub already in the tray, it hands over a fresh rod', () => {
    const h = harness();
    stubInTray(h);
    const stubLeft = h.state().cigarette.rodRemaining;
    h.tap('pack');
    const state = h.state();
    expect(state.cigarette.state).toBe('IDLE');
    expect(state.cigarette.rodRemaining, 'the new rod arrived half used').toBe(1);
    expect(stubLeft, 'the fixture burnt nothing, so this proves nothing').toBeLessThan(1);
  });

  it('it is not a lighter, not a draw and not a stick', () => {
    const h = harness();
    h.tap('pack');
    h.flush();
    const state = h.state();
    expect(state.lighter.engaged, 'the pack threw the wheel').toBe(false);
    expect(state.lighter.flame, 'the pack made a flame').toBe(0);
    expect(state.cigarette.puff.active).toBe(false);
    expect(state.cigarette.puff.count, 'a tap on the box cost a puff').toBe(0);
    expect(state.progress.puffs, 'a tap on the box was a puff in the ledger').toBe(0);
    expect(state.progress.sessionCount, 'a tap on the box was a break').toBe(0);
  });
});

describe('a tap with a rod already out answers without spending anything', () => {
  it('the pack moves and the break does not', () => {
    const h = harness();
    lit(h);
    const before = h.state();
    // Only the counters a gesture could move. The tap itself advances one step, so the burn and the
    // ash have every right to differ by a frame's worth — a claim that included them would be a claim
    // about the clock, not about the pack.
    const snapshot = {
      state: before.cigarette.state,
      puffs: before.cigarette.puff.count,
      puffsPlanned: before.cigarette.readouts.puffsTarget,
      ashDropped: before.progress.ashDropped,
      sessions: before.progress.sessionCount,
      ledgerPuffs: before.progress.puffs,
      lighter: before.lighter.engaged,
      emberLit: before.cigarette.ember.lit,
    };
    expect(before.pack.fidget, 'the pack started off nudged').toBe(0);

    h.tap('pack');
    const after = h.state();
    expect(after.pack.fidget, 'the tap was swallowed').toBeGreaterThan(0.5);
    expect({
      state: after.cigarette.state,
      puffs: after.cigarette.puff.count,
      puffsPlanned: after.cigarette.readouts.puffsTarget,
      ashDropped: after.progress.ashDropped,
      sessions: after.progress.sessionCount,
      ledgerPuffs: after.progress.puffs,
      lighter: after.lighter.engaged,
      emberLit: after.cigarette.ember.lit,
    }).toEqual(snapshot);
  });

  it('and the nudge is a happening, not a mode', () => {
    const h = harness();
    lit(h);
    h.tap('pack');
    expect(h.state().pack.fidget).toBeGreaterThan(0);
    h.run(900);
    expect(h.state().pack.fidget, 'the pack never settled').toBe(0);
    // Settling must not leave a ringing object behind: a second tap starts a second nudge.
    h.tap('pack');
    expect(h.state().pack.fidget).toBeGreaterThan(0.5);
  });
});

describe('the pack and the rod lying next to it (§66)', () => {
  it('each keeps its own middle', () => {
    const h = harness();
    const { anchors } = h.state();
    expect(resolveTarget(anchors.body, anchors, 0)).toBe('cigarette');
    expect(resolveTarget(anchors.pack, anchors, 0)).toBe('pack');
  });

  it('and a thumb gets the same answer as a cursor', () => {
    const h = harness();
    const { anchors } = h.state();
    // The shell's own finger budget, read rather than guessed: the seam between the two objects is
    // where a widened radius could hand the rod's butt end to the box lying beside it.
    const thumb = hitToleranceFor('touch');
    expect(thumb, 'this case is about a widened target').toBeGreaterThan(1);
    expect(resolveTarget(anchors.body, anchors, 0, 1, thumb)).toBe('cigarette');
    expect(resolveTarget(anchors.pack, anchors, 0, 1, thumb)).toBe('pack');
  });

  it('and while a rod is lying there, both of them mean 取烟', () => {
    // The honest reading of the overlap: the box and the rod's butt are 0.02 units apart on the
    // table, so some taps near the seam are ambiguous as *objects*. They are not ambiguous as
    // gestures, which is what the player asked for, so the ambiguity costs nothing here — and this
    // case is what says so out loud rather than leaving it to the radius arithmetic above.
    const box = harness();
    const rod = harness();
    box.tap('pack');
    rod.tap('cigarette');
    expect(box.state()).toEqual(rod.state());
  });

  it('the box is smaller than the tray’s reach and bigger than a dot', () => {
    // The drawn pack is 0.058 × 0.088; the radius has to cover it without leaning on its neighbours.
    expect(HIT.pack).toBeGreaterThanOrEqual(0.05);
    expect(HIT.pack).toBeLessThan(HIT.ashtray);
    expect(HIT.pack).toBeLessThan(HIT.lighter);
  });
});
