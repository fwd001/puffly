/**
 * §26, §27: the cherry burns for the whole break, so its bed is the sound a player lives inside
 * — and it was the one bed wired backwards.
 *
 * `bedTargets` drives each bed's shape filter from the state: for the ember bed, upward with
 * cherry brightness. That is the right sentence for a lowpass ("hotter, more open") and the wrong
 * one for a highpass, which gets *thinner* as it opens. The crackle bed's shape was a highpass at
 * 1100, so the climb ran the burn straight out of its own body — and a lit rod sits at brightness
 * 0.918 for roughly 90% of the break, which put the corner at 1402 Hz and left the resting sound
 * with no energy below 500 Hz at all. Rendered offline through the production engine, the whole
 * break measured centroid 1756 Hz, top-against-body 2.41x, crest 31.9 dB. That hole is what
 * 「太刺耳」 names; the level was never the problem.
 *
 * Two ways out were measured and one was rejected. A brown-noise `rumble` leg — the stage the
 * draw bed uses for the same complaint — put 42–63% of this bed under 250 Hz at every gain from
 * 0.3 down to 0.035, because a sparse grain band cannot compete with broadband brown noise in the
 * bass; that is a different complaint, not this one. Moving the band is what worked: the bed is
 * now a wide band in the body, and the resting break measures centroid 596 Hz, top/body 0.07,
 * peak 39% lower, crest 27.2 dB — same loudness, no edge.
 *
 * The floor on the band is not decoration. Below ~500 Hz this bed stops being a burn and becomes
 * a hum, so the case that pins the climb pins both ends of it.
 */

import { describe, expect, it } from 'vitest';
import type { FakeFilter, FakeNode } from './fake-audio';
import { makeState } from './fixture';
import { createHarness } from './harness';

const SHAPE = 'bed.ember.crackle:shape';
const burn = (brightness: number) =>
  makeState({
    lit: true,
    brightness,
    cigaretteState: 'BURNING',
    puffActive: false,
    intensity: 0,
    flame: 0,
    ambientGain: 0,
  });

function shape(h: ReturnType<typeof createHarness>): FakeFilter {
  const node: FakeNode | undefined = h.ctx.nodeNamed(SHAPE);
  expect(node, `${SHAPE} was never built — the burn bed has no crackle layer`).toBeDefined();
  return node as FakeFilter;
}

function driven(h: ReturnType<typeof createHarness>): number {
  return h.ctx.param(SHAPE, 'frequency')?.lastTarget() ?? -1;
}

describe('the burn bed keeps its body (§26)', () => {
  it('is not a highpass, because its only knob only ever opens', () => {
    const h = createHarness();
    h.frame(burn(0.918));
    // A `highpass` here is the whole bug in one word: the ember target raises this frequency with
    // heat, and a highpass raised is a burn with less of itself.
    expect(['lowpass', 'bandpass']).toContain(shape(h).type);
    h.engine.dispose();
  });

  it('sits in the body at the brightness a lit rod actually holds', () => {
    const h = createHarness();
    h.run(600, burn(0.918));
    const hz = driven(h);
    // Measured from the engine: a lit classic rests at brightness 0.918, so this is the number the
    // player hears for almost the whole break. 1402 was the old value, and above ~1200 the grain
    // stops reading as a cherry; below ~600 it stops reading as anything with edges.
    expect(hz).toBeGreaterThanOrEqual(600);
    expect(hz).toBeLessThanOrEqual(1200);
    h.engine.dispose();
  });

  it('still opens as the cherry gets hotter, and stays inside the body doing it', () => {
    const h = createHarness();
    h.run(600, burn(0.4));
    const cool = driven(h);
    h.run(600, burn(0.918));
    const hot = driven(h);
    // The authored intent survives the retune: heat opens the band. It just no longer escapes it.
    expect(cool).toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(cool);
    expect(hot).toBeLessThanOrEqual(1200);
    h.engine.dispose();
  });
});
