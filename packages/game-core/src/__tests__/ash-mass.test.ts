/**
 * Ash has a mass, and the mass is what the stick made — 2026-10-08 拍板 ②: 「按照那个真实的物理世界，
 * 就是每一种烟的灰的克数，然后生成的抖下来的长度，然后可以模拟」.
 *
 * So the contented gram figure per stick is the physical basis (the deck's parameter table says
 * 0.20–0.38 g for a cigarette, and that is what the eleven rods now carry), and three numbers are
 * derived from it rather than authored beside it: what a fallen column weighs, what the tray is
 * holding, and what the whole save has dropped. The column's *length* keeps its own authored ceiling
 * — how long a rod's ash can stand is a property of the ash, not of how much of it there is.
 *
 * What these cases hold is conservation, read at the instants that make it true: `readouts.ashGrams`
 * is taken *before* the tap it is compared with, because the burn goes on while the ash falls.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { ContentBundle } from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit, type Harness } from './harness';
import type { AshtrayContent } from '../types/content';

/** The fixture plus one more tray, so a swap is reachable at all. */
const FIRST_TRAY = FIXTURE.ashtrays[0];
if (FIRST_TRAY === undefined) throw new Error('the fixture ships no ashtray');
const TWO_TRAYS: ContentBundle = {
  ...FIXTURE,
  ashtrays: [
    ...FIXTURE.ashtrays,
    { ...FIRST_TRAY, id: 'test-tray-b', name: 'Second Test Tray' } satisfies AshtrayContent,
  ],
};

/**
 * The masses the session recorded, in the order they fell.
 *
 * Filtered on `cause` rather than on the event type: `ASH_FALL` carries two meanings in this log
 * already — the column letting go on its own (`dropAsh`'s row, with a cause) and the `ash_fall`
 * weather moment (`world.ts`, with a strength and a duration). Selecting on the type alone picked up
 * the weather rows, and `Math.max` of a handful of `-1`s passed the "one column is small" case
 * without looking at a single real number.
 */
function recordedGrams(h: Harness): number[] {
  return h.sessionEvents
    .filter((event) => typeof event.payload?.cause === 'string')
    .map((event) => Number(event.payload?.grams ?? -1));
}

/** Grow a column and let go of it, taking the stick's own figure at the moment of the tap. */
function flick(h: Harness): { madeAtTap: number; fallen: number } {
  h.until(() => h.state().cigarette.ash.ready, 4000);
  const madeAtTap = h.state().cigarette.readouts.ashGrams;
  h.tap('ash');
  return { madeAtTap, fallen: h.state().cigarette.ash.droppedGrams };
}

/** Take the rod in the hand and hold it over a point on the table. */
function carry(h: Harness, x: number, y: number): void {
  const body = h.state().anchors.body;
  h.pointerDown(body.x, body.y);
  h.dragTo(x, y);
  h.run(400);
}

describe('a fallen column carries the stick’s own mass (§ S5, 拍板 ②)', () => {
  it('the first flick takes everything the burn had made', () => {
    const h = harness();
    lit(h);
    const drawn = flick(h);
    console.log(
      `MASS first flick fallen=${String(drawn.fallen)}g made at the tap=${String(drawn.madeAtTap)}g`,
    );
    expect(drawn.fallen).toBeGreaterThan(0);
    // Nothing else has left the rod, so the difference the core takes is the whole figure here. The
    // readout is rounded to 1/100 g (§79: to what a person could notice), so that is the slack.
    expect(drawn.fallen).toBeLessThanOrEqual(drawn.madeAtTap + 0.005);
    expect(drawn.fallen).toBeGreaterThan(drawn.madeAtTap * 0.9);
  });

  it('and a second one takes only what the burn added since', () => {
    const h = harness();
    lit(h);
    const first = flick(h);
    h.run(600);
    const second = flick(h);
    console.log(
      `MASS second flick cumulative=${String(second.fallen)}g after ${String(first.fallen)}g, ` +
        `made at the second tap=${String(second.madeAtTap)}g`,
    );
    expect(second.fallen).toBeGreaterThan(first.fallen);
    expect(second.fallen).toBeLessThanOrEqual(second.madeAtTap + 0.005);
    // A drop can never take more than the stick had made by the time it fell.
    expect(second.fallen - first.fallen).toBeLessThan(second.madeAtTap + 0.005);
  });

  it('a real stick gives its contented figure and never more', () => {
    // Weighed in a room whose event pool has no `ash_fall` (`CALM` in the content): in a smoky venue
    // the weather took every column before it could stand long enough to be `ready`, and the case
    // would have been measuring gusts rather than grams.
    const h = harness({
      content: DEFAULT_CONTENT,
      cigaretteId: 'classic',
      environmentId: 'restroom-cubicle',
    });
    lit(h);
    const classic = DEFAULT_CONTENT.cigarettes.find((cigarette) => cigarette.id === 'classic');
    const perStick = classic?.physical.ashGrams ?? 0;
    expect(perStick, 'classic carries no ash figure').toBe(0.3);
    // A ten-minute stick, weighed a minute at a time. Each round reads the mass the rod let go
    // *between two of its own readings*, so a gust taking the column cannot be mistaken for the
    // player's flick — those rows carry no `cause`, and the first version of this case judged their
    // absence as a success.
    const myFalls: number[] = [];
    const firstReadyAt: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      // Wait *for the column*, not for a clock. Two minutes is the budget on purpose: it is the
      // reachability claim itself — on a ten-minute rod the player must be offered 磕灰 inside two
      // minutes of lighting, and before the yield and the gust were fixed this threw every time.
      const before = h.state().nowMs;
      h.until(() => h.state().cigarette.ash.ready, 120_000);
      firstReadyAt.push(Math.round(h.state().nowMs - before));
      const droppedBefore = h.state().cigarette.ash.droppedGrams;
      h.tap('ash');
      const delta = h.state().cigarette.ash.droppedGrams - droppedBefore;
      expect(delta, `round ${String(round)} flicked nothing`).toBeGreaterThan(0);
      myFalls.push(delta);
      h.run(1200);
    }
    h.run(20_000);
    const rod = h.state().cigarette;
    console.log(
      `MASS classic dropped=${String(rod.ash.droppedGrams)}g made=${String(rod.readouts.ashGrams)}g ` +
        `per stick=${String(perStick)}g each flick=${myFalls.join(',')} ready after=` +
        `${firstReadyAt.join('ms,')}ms rod left=` +
        String(rod.rodRemaining.toFixed(3)),
    );
    expect(rod.readouts.ashGrams).toBeGreaterThan(0);
    expect(rod.readouts.ashGrams).toBeLessThanOrEqual(perStick);
    expect(rod.ash.droppedGrams).toBeLessThanOrEqual(perStick + 1e-9);
    expect(myFalls.length, 'not one column was flickable off a 10-minute rod').toBeGreaterThan(1);
    // One column of a real stick is hundredths of a gram, not tenths — which is why the screen reads
    // two decimals: 稿子 S5 的 2.1 g is a *tray*, not a stick.
    expect(Math.max(...myFalls)).toBeLessThan(perStick / 2);
  });

  it('the column is exactly the rod that is gone, while it stands', () => {
    // 拍板 ② in one line: the length that shakes down is derived from the burnt rod, not authored
    // beside it. `BURN.ashYield` used to be 0.6 ("the rest is dust"), and the dust was invisible —
    // the column simply stood shorter than what had burnt, which is how it stopped ever being worth
    // flicking on the deck's own durations.
    const h = harness();
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);
    const rod = h.state().cigarette;
    console.log(
      `MASS identity ash=${String(rod.readouts.ashMm)}mm + rod=${String(rod.readouts.rodMm)}mm ` +
        `against a full 84mm stick, ceiling=${String(rod.ash.maxLength)}`,
    );
    expect(rod.ash.length).toBeLessThan(rod.ash.maxLength);
    // Both readings round to a tenth (§79), so the sum can be off by a fifth of a millimetre.
    expect(rod.readouts.ashMm + rod.readouts.rodMm).toBeCloseTo(84, 1);
  });

  it('the session records the mass of the piece it just dropped', () => {
    const h = harness();
    lit(h);
    const drawn = flick(h);
    const grams = recordedGrams(h);
    expect(grams).toHaveLength(1);
    expect(grams[0]).toBeCloseTo(drawn.fallen, 2);
  });
});

describe('the tray holds what landed in it, the ledger counts every fall', () => {
  it('a column shaken over the tray joins the pile in it', () => {
    const h = harness();
    lit(h);
    const tray = h.state().anchors.ashtray;
    carry(h, tray.x, tray.y - 0.14);
    const drawn = flick(h);
    h.run(2600);
    const state = h.state();
    console.log(
      `MASS over the tray tray=${String(state.ashtray.grams)}g ` +
        `fallen=${String(state.progress.ashGrams)}g of the tap=${String(drawn.fallen)}g`,
    );
    // Held over the tray, every fall is caught, so the two numbers coincide — and the tray's is not
    // a copy of the stick's readout (which is what this cell used to show).
    expect(state.ashtray.grams).toBeGreaterThan(0);
    expect(state.ashtray.grams).toBeCloseTo(state.progress.ashGrams, 10);
    expect(state.ashtray.grams).toBeGreaterThan(drawn.fallen);
    h.pointerUp(tray.x, tray.y - 0.14);
  });

  it('one shaken short of the tray is ash on the table, not in the number', () => {
    const h = harness();
    lit(h);
    const tray = h.state().anchors.ashtray;
    carry(h, 0.16, tray.y - 0.14);
    flick(h);
    h.run(2600);
    const state = h.state();
    console.log(
      `MASS short of the tray tray=${String(state.ashtray.grams)}g ` +
        `fallen=${String(state.progress.ashGrams)}g`,
    );
    expect(state.progress.ashGrams).toBeGreaterThan(0);
    expect(state.ashtray.grams).toBe(0);
    h.pointerUp(0.16, tray.y - 0.14);
  });

  it('swapping the tray is the only thing that empties it', () => {
    const h = harness({ content: TWO_TRAYS });
    lit(h);
    const tray = h.state().anchors.ashtray;
    carry(h, tray.x, tray.y - 0.14);
    flick(h);
    h.run(2600);
    const before = h.state().ashtray.grams;
    expect(before).toBeGreaterThan(0);
    // The fixture ships one tray, so the second one is the same row under another id: the point is
    // the swap, not the ceramic.
    h.engine.selectAshtray('test-tray-b');
    const state = h.state();
    expect(state.ashtray.grams).toBe(0);
    // A new tray is empty; the ash did not go anywhere, which is what the ledger is for.
    expect(state.progress.ashGrams).toBeGreaterThanOrEqual(before);
  });

  it('the lifetime figure outlives the rod it came from', () => {
    const h = harness();
    lit(h);
    const drawn = flick(h);
    h.run(2600);
    const fallen = h.state().progress.ashGrams;
    expect(fallen).toBeGreaterThan(0);
    // Put this one out and let the shell hand over another: the fresh rod has dropped nothing, and
    // the save still remembers everything.
    h.tap('ashtray');
    h.run(12_000);
    const state = h.state();
    console.log(
      `MASS across rods fallen=${String(fallen)}g now=${String(state.progress.ashGrams)}g ` +
        `this rod=${String(state.cigarette.ash.droppedGrams)}g of the tap=${String(drawn.fallen)}g`,
    );
    expect(state.progress.ashGrams).toBeGreaterThanOrEqual(fallen);
  });
});
