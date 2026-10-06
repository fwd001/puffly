/**
 * The two families of draw the brief separates (Smoke Ritual `categoryTypes`): 吸入 draws go to
 * the lungs, 品鉴 draws stay in the mouth. Same state machine, same `PUFFING`, two curves — and
 * the difference is authored in content, because §77 forbids the core from knowing what a cigar is.
 */

import { describe, expect, it } from 'vitest';
import { type Burst, type BurstKind, type ContentBundle } from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit, type Harness } from './harness';

const MOUTHFUL_MS = 2000;

/** The same rod, smoked from the mouth: two seconds to fill, and nothing left behind. */
const MOUTH: ContentBundle = {
  ...FIXTURE,
  cigarettes: FIXTURE.cigarettes.map((rod) =>
    rod.id === 'test-rod'
      ? {
          ...rod,
          puffProfile: {
            ...rod.puffProfile,
            savourMs: MOUTHFUL_MS,
            loadPerPuff: 0,
            exhaleMs: 2500,
          },
          archive: { ...rod.archive, kind: 'savor' as const },
        }
      : rod,
  ),
};

const burstsOf = (h: Harness, kind: BurstKind): Burst[] =>
  h.bursts
    .flatMap((event) => (event.kind === 'burst' ? [event.burst] : []))
    .filter((burst) => burst.kind === kind);

/** Light it, hold the draw for `ms`, then let go. */
function hold(h: Harness, ms: number): { progress: number; intensity: number; load: number } {
  lit(h);
  h.press('cigarette');
  h.run(ms);
  const puff = h.state().cigarette.puff;
  const reading = { progress: puff.progress, intensity: puff.intensity, load: puff.load };
  h.release('cigarette');
  return reading;
}

/** Three draws in a row, and the residue the last one leaves. */
function threeDraws(h: Harness): number {
  lit(h);
  for (let draw = 0; draw < 3; draw += 1) {
    h.press('cigarette');
    h.run(700);
    h.release('cigarette');
    h.run(120);
  }
  return h.state().cigarette.puff.load;
}

describe('the mouth and the lungs (§14, 品鉴型)', () => {
  it('a mouthed draw fills on its own rhythm rather than a jittered draw length', () => {
    const at = (ms: number) => hold(harness({ content: MOUTH }), ms).progress;
    expect(at(500)).toBeCloseTo(0.25, 1);
    expect(at(1000)).toBeCloseTo(0.5, 1);
    expect(at(MOUTHFUL_MS)).toBeCloseTo(1, 1);
    // Held twice as long as it needed, it is no fuller: 含住两秒, and then it is simply held.
    expect(at(MOUTHFUL_MS * 2)).toBeCloseTo(1, 1);
  });

  it('an inhaled draw keeps arriving the whole time it is held, front-loaded', () => {
    const early = hold(harness(), 400);
    const late = hold(harness(), 800);
    expect(early.progress).toBeLessThan(late.progress);
    // Sub-linear means the first half of the hold is worth more than half of the second.
    expect(early.progress / late.progress).toBeGreaterThan(0.5);
    expect(early.progress / late.progress).toBeLessThan(1);
  });

  it('the cloud that comes out is the mouthful that went in', () => {
    // §16 puts a wide jitter on every burst's count, so one sip can out-puff one full draw on luck
    // alone — and comparing a single roll of each, as this used to, was measuring that jitter rather
    // than the thing the claim is about. One rod per draw (a second draw on a rod that has just
    // been held for two seconds has no rod left to draw on), seven seeds, and the middle of them.
    const medianCountAfter = (holdMs: number): number => {
      // Twenty-one, not seven: §16's own spread is ±55% on the count, and the authored difference
      // between these two breaths is 1.49x, which seven rolls can comfortably hide.
      const counts = Array.from({ length: 21 }, (_, index) => index * 7 + 3)
        .map((seed) => {
          const h = harness({ content: MOUTH, seed });
          lit(h);
          h.press('cigarette');
          h.run(holdMs);
          h.release('cigarette');
          const breath = burstsOf(h, 'exhale').at(-1);
          expect(breath, `${String(seed)} never breathed at ${String(holdMs)} ms`).toBeDefined();
          return breath?.count ?? 0;
        })
        .sort((a, b) => a - b);
      return counts[Math.floor(counts.length / 2)] ?? 0;
    };
    expect(medianCountAfter(2200)).toBeGreaterThan(medianCountAfter(400) * 1.2);
  });

  it('a draw that never reaches the lungs leaves no resistance for the next one', () => {
    expect(threeDraws(harness({ content: MOUTH }))).toBe(0);
    // The residue is what the burn and the cherry read (BURN.loadRateMultiplier, the ember's
    // brightness), so a mouthed rod keeps its tempo and an inhaled one does not.
    expect(threeDraws(harness())).toBeGreaterThan(0.2);
  });

  it('a mouthed draw is breathed out slowly where an inhaled one is pushed out (§14 缓缓吐出)', () => {
    // Both are drawn past their own fill point, so the two clouds leave at the same intensity and
    // the only thing that can differ is how they go.
    const released = (content: ContentBundle, ms: number): Burst => {
      const h = harness({ content });
      lit(h);
      h.press('cigarette');
      h.run(ms);
      h.release('cigarette');
      const burst = burstsOf(h, 'exhale').at(-1);
      if (burst === undefined) throw new Error('no exhale burst was emitted');
      return burst;
    };
    const lung = released(FIXTURE, 1300);
    const mouth = released(MOUTH, 2600);
    expect(mouth.lifeMs.max).toBeGreaterThan(lung.lifeMs.max * 1.2);
    expect(mouth.speed.max).toBeLessThan(lung.speed.max * 0.95);
  });

  it('the breathed cloud stays see-through, because smoke is not a light (§15)', () => {
    const h = harness({ content: MOUTH });
    lit(h);
    h.press('cigarette');
    h.run(2600);
    h.release('cigarette');
    const cloud = burstsOf(h, 'exhale').at(-1);
    if (cloud === undefined) throw new Error('no exhale burst was emitted');

    // Rendered and measured, the authored numbers made the breath a uniform bright sheet: 22999
    // samples above luminance 90 across the plume band with a neighbour-to-neighbour difference of
    // 5.17. After this change the same moment measures 9806 samples and a difference of 8.44 — a
    // cloud with light and dark in it rather than haze laid over the picture. What is asserted here
    // is the shape that produced it: a lobe may not buy its presence with opacity, so the mass has
    // to come from how many lobes there are and how far they grow.
    expect(cloud.alphaPeak).toBeLessThan(0.25);
    // The emitted radius is the authored one times the rod's plume scale and its jitter, so this is
    // a ceiling on what leaves, not on what is written: authored 0.055 arrives here at ~0.086, where
    // the old 0.105 arrived at ~0.164.
    expect(cloud.radius.max).toBeLessThan(0.12);
    // And "thinner" may not simply mean "a smaller cloud": the mass has to stay in the frame.
    // This used to assert a billow (`scaleGrowth >= 2`), which was the wrong conclusion — the
    // brief's breath is a rising column, and whether it reads as one is now measured as a shape
    // rather than inferred from a growth number (`plume-shape.test.ts`: elongation >= 1.8,
    // footprint <= 0.6 of a stage at two seconds).
    expect(cloud.count).toBeGreaterThan(40);
  });
});
