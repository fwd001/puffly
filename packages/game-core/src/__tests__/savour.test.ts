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
          puffProfile: { ...rod.puffProfile, savourMs: MOUTHFUL_MS, loadPerPuff: 0 },
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
    const sip = harness({ content: MOUTH });
    lit(sip);
    sip.press('cigarette');
    sip.run(400);
    sip.release('cigarette');

    const full = harness({ content: MOUTH });
    lit(full);
    full.press('cigarette');
    full.run(2200);
    full.release('cigarette');

    const short = burstsOf(sip, 'exhale').at(-1);
    const long = burstsOf(full, 'exhale').at(-1);
    expect(short?.count).toBeTypeOf('number');
    expect(long?.count ?? 0).toBeGreaterThan((short?.count ?? 0) * 1.2);
  });

  it('a draw that never reaches the lungs leaves no resistance for the next one', () => {
    expect(threeDraws(harness({ content: MOUTH }))).toBe(0);
    // The residue is what the burn and the cherry read (BURN.loadRateMultiplier, the ember's
    // brightness), so a mouthed rod keeps its tempo and an inhaled one does not.
    expect(threeDraws(harness())).toBeGreaterThan(0.2);
  });
});
