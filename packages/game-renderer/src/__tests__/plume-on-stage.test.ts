/**
 * The plume has to stay where the player is looking — SPEC.md §15.
 *
 * Shape was measured for a long time without direction: a cloud that leaves the frame upward and
 * a cloud that hangs in it have the same elongation. This is the assertion that catches the
 * difference, and it was written after the fact — every one of the eleven cigarettes had its
 * exhaled cloud entirely outside the stage two seconds after the breath (the default: 1.06 stage
 * heights of travel by then), because the pool's air drag was a single 0.9/s borrowed from ash.
 *
 * The rule is stated in brightness, not in time, because "gone" and "faded" are different
 * failures: a cloud may leave the frame once it is nearly invisible, and may not while it is
 * still more than half lit.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { Burst } from '@puffly/game-core';
import { FIELD_SCALE, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

interface Cloud {
  /** Share of the live particles still inside the stage box. */
  inFrame: number;
  /** How far the cloud's centre has slid sideways, in stage widths. */
  driftX: number;
  /** Mean alpha, against the brightest particle still in the air. */
  meanAlpha: number;
  peakAlpha: number;
}

/** One real breath from one real cigarette, ridden out to `seconds`. */
function breathOf(cigaretteId: string): (seconds: number) => Cloud | null {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId });
  lit(h);
  let burst: Burst | null = null;
  h.engine.on((event) => {
    if (!burst && event.kind === 'burst' && event.burst.kind === 'exhale') burst = event.burst;
  });
  h.press('cigarette');
  h.engine.advance(1400);
  h.release('cigarette');
  h.engine.advance(600);
  if (!burst) throw new Error(`${cigaretteId} never breathed`);

  const pool = new ParticlePool(1400);
  intakeBurst(burst, pool, { densityScale: 1 });
  const origin: Burst['origin'] = (burst as Burst).origin;
  let elapsed = 0;

  return (seconds: number) => {
    const steps = Math.round(((seconds - elapsed) * 1000) / STEP);
    for (let i = 0; i < steps; i++) {
      pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, elapsed);
      elapsed += STEP / 1000;
    }
    let live = 0;
    let inside = 0;
    let sum = 0;
    let peak = 0;
    let sumX = 0;
    pool.forEachActive((particle) => {
      live += 1;
      sumX += particle.x;
      // The stage box is the unit the whole engine works in, so 0..1 is the frame itself.
      if (particle.y >= 0 && particle.y <= 1 && particle.x >= 0 && particle.x <= 1) inside += 1;
      sum += particle.alpha;
      peak = Math.max(peak, particle.alpha);
    });
    if (live === 0) return null;
    return {
      inFrame: inside / live,
      driftX: sumX / live - origin.x,
      meanAlpha: sum / live,
      peakAlpha: peak,
    };
  };
}

const ids = DEFAULT_CONTENT.cigarettes.map((cigarette) => cigarette.id);

describe('the breath stays on the stage while it is lit (§15)', () => {
  it('measures every cigarette the content ships', () => {
    // The denominator of the two rules below, stated where it cannot go stale.
    expect(ids.length).toBe(11);
  });

  it.each(ids)('%s keeps its breath in frame at two seconds', (id) => {
    const cloud = breathOf(id)(2);
    expect(cloud, `${id} had no cloud left at 2 s`).not.toBeNull();
    expect(cloud?.inFrame).toBeGreaterThanOrEqual(0.95);
  });

  it.each(ids)('%s is still in frame at four seconds if it is still bright', (id) => {
    const atFour = breathOf(id)(4);
    if (!atFour) return;
    // Half as bright as its own brightest particle is still bright: the player can see it.
    const stillLit = atFour.meanAlpha > 0.45 * atFour.peakAlpha;
    if (!stillLit) return;
    // Sideways first: 「点击抽烟的那个按钮 那个烟会到左上角」 is the same defect seen horizontally, and
    // at the old damping the cloud slid 0.145 of a stage leftward on its way out of the frame. The
    // two rules fail together there, so the narrower one is asserted first — otherwise the frame
    // check aborts the test and this one never gets to say anything.
    expect(Math.abs(atFour.driftX), `${id} ran sideways off the tip`).toBeLessThanOrEqual(0.05);
    expect(atFour.inFrame, `${id} left the frame while lit`).toBeGreaterThanOrEqual(0.5);
  });
});
