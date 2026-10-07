/**
 * 「炭化线沿纸面逐段推进，边界有颗粒状毛边」 — S12's realistic half, SPEC.md §17.
 *
 * Before this the char front was one linear ramp ending in a rounded cap. The colour was right and
 * the boundary was wrong: a burn line that smooth is a paint stroke, not fire eating paper.
 *
 * What is checkable without a browser is the grain's *geometry*: that a band of small dark rects sits
 * at the char front, spread along the direction of travel as well as across the rod, that the spread
 * does not change with the clock (a fuzz that twinkles is noise, not a burn line), and that the band
 * travels as the rod goes up. Pixels are asserted in the browser layer; the numbers below are read
 * off the same recorder.
 */

import { describe, expect, it } from 'vitest';
import { createEngine, type GameStateView } from '@puffly/game-core';
import { createViewport } from '../viewport';
import { drawCigarette } from '../props';
import { createFakeCanvas, type FakeCall } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

const W = 390;
const H = 844;

function viewAfter(seconds: number, lit = true): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 5,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30),
  });
  engine.send({ type: 'tap', x: 0, y: 0, timestamp: 0, target: 'cigarette', source: 'keyboard' });
  if (lit) {
    engine.send({ type: 'tap', x: 0, y: 0, timestamp: 0, target: 'lighter', source: 'keyboard' });
  }
  const frames = Math.round((seconds * 1000) / (1000 / 60));
  for (let frame = 0; frame < frames; frame++) engine.advance(1000 / 60);
  return engine.getState();
}

/**
 * The grain band, in the rod's own frame.
 *
 * The grains are one `fillStyle` painted by a loop, and nothing else on the rod is: so the run of
 * `fillRect`s between two `set:fillStyle` changes, when it is longer than a handful, *is* the burn
 * front. Keying on the run rather than on a size threshold keeps this from quietly collecting the
 * rod body, the brand band and the cherry's specks, and from naming a colour the day someone retunes it.
 */
function grainsOf(
  view: GameStateView,
  box: { width: number; height: number } = { width: W, height: H },
): { xs: number[]; ys: number[]; sides: number[] } {
  const viewport = createViewport({ width: box.width, height: box.height, dpr: 1 });
  const fake = createFakeCanvas();
  drawCigarette(fake.ctx, view, viewport);

  const runs: FakeCall[][] = [[]];
  for (const call of fake.calls) {
    if (call.name === 'set:fillStyle') {
      if (runs[runs.length - 1]?.length) runs.push([]);
      continue;
    }
    if (call.name === 'fillRect') runs[runs.length - 1]?.push(call);
  }
  const longest = runs.reduce((best, run) => (run.length > best.length ? run : best), []);
  // One rect is not a fuzz. Whatever the longest run happens to be on an unlit rod, it is not this.
  const band = longest.length >= 3 ? longest : [];
  return {
    xs: band.map((call) => Number(call.args[0])),
    ys: band.map((call) => Number(call.args[1])),
    sides: band.map((call) => Number(call.args[2])),
  };
}

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);

describe('the char line is a burn front, not a ramp (S12)', () => {
  const view = viewAfter(1.4);
  const grains = grainsOf(view);
  console.log(
    `MEASURE grains=${String(grains.xs.length)} xSpread=${spread(grains.xs).toFixed(2)} ` +
      `ySpread=${spread(grains.ys).toFixed(2)} side=${Math.max(...grains.sides).toFixed(2)} ` +
      `xs=${grains.xs
        .slice(0, 6)
        .map((x) => x.toFixed(1))
        .join(',')}`,
  );

  it('puts a band of grain at the front of the char', () => {
    expect(grains.xs.length, 'no grain was drawn at all').toBeGreaterThanOrEqual(9);
    // The fuzz has to be ragged *along the burn* and not only across the rod: a fifth of its own
    // spread across the rod is what reads as a toothed line rather than as a straight edge. Measured
    // 4.6 px against 10.4 px across (390 × 844), so the bound sits well under the first and well
    // above the zero a smooth boundary gives.
    expect(
      spread(grains.xs),
      'the grains all sit on one line: the boundary is still smooth',
    ).toBeGreaterThanOrEqual(spread(grains.ys) * 0.2);
    expect(spread(grains.ys), 'the grains do not cover the rod').toBeGreaterThan(
      Math.max(...grains.sides) * 3,
    );
  });

  it('chars the same millimetre the same way, whatever the clock says', () => {
    // The whole geometry, not just one axis: a grain field keyed to the clock was caught moving up
    // and down the rod while its x column stayed put, which an x-only comparison happily passed.
    const later = { ...view, nowMs: view.nowMs + 4000 } as GameStateView;
    const again = grainsOf(later);
    expect(again.xs, 'the fuzz twinkles in x: it is keyed to the clock').toEqual(grains.xs);
    expect(again.ys, 'the fuzz twinkles across the rod').toEqual(grains.ys);
    expect(again.sides, 'the grains change size with the clock').toEqual(grains.sides);
  });

  it('carries the line forward as the rod burns down', () => {
    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
    const early = mean(grains.xs);
    const late = mean(grainsOf(viewAfter(3)).xs);
    expect(late, 'the burn line did not travel: the char front is pinned to the rod').toBeLessThan(
      early,
    );
  });

  it('is a fuzz at the size of the rod, not at the size of the window', () => {
    // 1.7 px on a 390-wide stage is 5 device pixels on the phone that renders it at dpr 3, and it
    // has to be that same share of the rod on a desktop too — otherwise the burn line either
    // disappears on a big screen or turns into soot on a small one.
    const phone = Math.max(...grains.sides);
    const desk = Math.max(...grainsOf(view, { width: 1440, height: 900 }).sides);
    expect(phone, 'no grain had a size').toBeGreaterThan(0.5);
    expect(
      desk / phone,
      `the grain does not scale with the rod (${phone.toFixed(2)} → ${desk.toFixed(2)})`,
    ).toBeGreaterThan(1.4);
  });

  it('draws no char while nothing is alight', () => {
    // The positive control the other three need: a band that was painted on an unlit rod would pass
    // them all and be a smudge, not a burn.
    const cold = grainsOf(viewAfter(2, false));
    expect(
      cold.xs.length,
      `an unlit rod was painted with a ${String(cold.xs.length)}-rect char band`,
    ).toBe(0);
  });
});
