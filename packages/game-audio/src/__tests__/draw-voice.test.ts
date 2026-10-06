/**
 * §26, §27: the held part of a draw is the sound a player actually listens to, and a rod is a
 * *tube*. One bandpass could be the body or the tube but not both, so the draw bed now has a duct
 * stage above its body, and that duct is wobbled by two unsyncopated rates — held air pulled
 * through a narrow gap breaks up rather than hissing evenly.
 *
 * The third case is the one that keeps the design honest: the flutter lives on the duct's
 * frequency, never on the bed's level. An LFO wired into the level param would be *added* to the
 * value the engine drives to zero, so a silent bed would still be breathing.
 */

import { describe, expect, it } from 'vitest';
import type { AudioNodeLike } from '@puffly/game-audio';
import { makeState } from './fixture';
import { createHarness } from './harness';
import type { FakeFilter, FakeGain } from './fake-audio';

type Harness = ReturnType<typeof createHarness>;

const modulators = (h: Harness, node: string, key = 'frequency') => {
  const param = h.ctx.param(node, key);
  if (!param) return [];
  const depths = h.ctx.nodes.filter((candidate) =>
    candidate.connections.includes(param as unknown as AudioNodeLike),
  );
  return depths.map((depth) => {
    const source = h.ctx.oscillators.find((osc) =>
      osc.connections.includes(depth as unknown as AudioNodeLike),
    );
    return {
      hz: source?.frequency.value ?? 0,
      depth: (depth as FakeGain).gain.value,
    };
  });
};

const held = (intensity: number) =>
  ({
    lit: true,
    brightness: 0.7,
    cigaretteState: 'PUFFING',
    puffActive: true,
    intensity,
  }) as const;

describe('the draw is air pulled through a tube (§26)', () => {
  it('has a duct of its own, and the duct tightens as the pull hardens', () => {
    const h = createHarness();
    h.frame(makeState(held(0.2)));
    const soft = h.ctx.param('bed.draw.draw:duct', 'frequency')?.lastTarget() ?? 0;
    h.run(240, makeState(held(0.95)));
    const hard = h.ctx.param('bed.draw.draw:duct', 'frequency')?.lastTarget() ?? 0;

    expect(soft).toBeGreaterThan(600);
    expect(hard).toBeGreaterThan(soft);
    // A rod, not a whistle. The ceiling used to be 2400, which sat just above the 2379 this
    // shipped at — a line drawn around the thing it was meant to stop, so it guarded nothing and
    // the draw stayed bright until someone listened. 1500 is below the 2.4 kHz band that reads as
    // hiss: rendered offline, pulling the duct down took the 2.4 kHz energy against the 900 Hz
    // body from 3.82x to 2.97x at rest and 2.48x mid-pull, with the flutter unchanged.
    expect(hard).toBeLessThan(1500);
  });

  it('wobbles that duct with two rates that never line up', () => {
    const h = createHarness();
    h.frame(makeState(held(0.6)));
    const waves = modulators(h, 'bed.draw.draw:duct');
    expect(waves).toHaveLength(2);
    // Depth is relative or it goes shrill as the base comes down: ±260 Hz around 1900 is a 14%
    // wobble, and the same 260 around 1200 would be a 22% one.
    const base = h.ctx.param('bed.draw.draw:duct', 'frequency')?.value ?? 0;
    expect(base).toBeGreaterThan(0);
    for (const wave of waves) {
      expect(wave.depth / base).toBeLessThanOrEqual(0.15);
      // Turbulence band: fast enough to read as flutter, far enough from a tone to stay air.
      expect(wave.hz).toBeGreaterThan(4);
      expect(wave.hz).toBeLessThan(30);
      expect(wave.depth).toBeGreaterThan(0);
    }
    const rates = waves.map((wave) => wave.hz).sort((x, y) => x - y);
    const ratio = (rates[1] ?? 0) / (rates[0] ?? 1);
    // Not a multiple of each other, and not the same number: the sum never becomes a period (§81 8).
    expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.05);
  });

  it('gives the draw a body that runs beside the air, not through it', () => {
    const h = createHarness();
    h.frame(makeState(held(0.6)));
    const rumble = h.ctx.nodes.find((node) => node.name === 'bed.draw.draw:rumble') as
      FakeFilter | undefined;
    const duct = h.ctx.nodes.find((node) => node.name === 'bed.draw.draw:duct');
    const levelNode = h.ctx.nodes.find((node) => node.name === 'bed.draw.draw:level');
    expect(rumble).toBeTruthy();
    expect(duct).toBeTruthy();
    expect(levelNode).toBeTruthy();

    // A body, not a second hiss: the band has to sit low.
    expect(rumble?.frequency.value).toBeLessThan(500);
    // Parallel: the rumble must not land on the duct, and something on its way to the level
    // carries it — that is the whole difference between "under the air" and "in front of it".
    expect(rumble?.connections.includes(duct as unknown as AudioNodeLike)).toBe(false);
    const carried = h.ctx.nodes.some(
      (node) =>
        rumble?.connections.includes(node as unknown as AudioNodeLike) &&
        node.connections.includes(levelNode as unknown as AudioNodeLike),
    );
    expect(carried).toBe(true);
    // And it is a real second source, not an idle filter.
    const feedsRumble = () =>
      h.ctx.sources.filter(
        (source) => source.loop && source.connections.includes(rumble as unknown as AudioNodeLike),
      );
    expect(feedsRumble()).toHaveLength(1);

    // Twenty seconds of audible frames is past the longest re-seed horizon: the body has to be
    // swapped for a fresh print too, or the draw loops under a bed that never repeats.
    h.run(20_000, makeState(held(0.6)));
    expect(feedsRumble().length).toBeGreaterThan(1);
  });

  it('leaves the bed level alone, so a silent draw is silent rather than breathing', () => {
    const h = createHarness();
    h.frame(makeState(held(0.6)));
    // Positive control first: the scan can see a modulation, it just must not find one here.
    expect(modulators(h, 'bed.draw.draw:duct').length).toBeGreaterThan(0);
    expect(modulators(h, 'bed.draw.draw:level', 'gain')).toHaveLength(0);

    const level = h.ctx.param('bed.draw.draw:level', 'gain');
    expect(level?.lastTarget()).toBeGreaterThan(0);
    h.run(1200, makeState({ ...held(0.2), puffActive: false, sinceReleaseMs: 2000 }));
    expect(h.ctx.param('bed.draw.draw:level', 'gain')?.lastTarget()).toBe(0);
  });
});
