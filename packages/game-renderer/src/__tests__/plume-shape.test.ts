/**
 * The plume is a body of air, not a swarm — SPEC.md §15, §16.
 *
 * The complaint was that the smoke reads as fog and is out of focus (像雾, 没对上焦). The cause
 * was not the particle count, the alpha, or the spread angle: `curl2`'s third argument selects a
 * different noise *lattice*, and the pool was passing each particle's own seed, so two neighbours
 * were pushed in unrelated directions and nothing ever moved as a column. One shared field, and
 * the same numbers become a thread.
 *
 * What this file measures changed once, and for a reason worth keeping: it used to measure one
 * burst's own elongation after a few seconds. That number was really measuring how far the cloud
 * had *travelled* — a fast cloud is a tall cloud however it looks. When the smoke was given the
 * drag air actually exerts on it (see `SMOKE_DRAG` in intake.ts), the travelling stopped and the
 * same assertion reddened at 0.51 while the rendered frame showed the narrowest plume the engine
 * had ever drawn. So the shape is now measured where the player sees it: on the whole plume,
 * every burst the scene has aired at once.
 */

import { describe, expect, it } from 'vitest';
import type { Burst } from '@puffly/game-core';
import { FIELD_SCALE, intakeBurst } from '../intake';
import { ParticlePool } from '../particles';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

interface Shape {
  sigmaX: number;
  sigmaY: number;
  elongation: number;
  /** The plume's own footprint, as a share of the stage's area. */
  coverage: number;
}

const sd = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
};

/** Every burst a real session hands over in `seconds`, riding the shared field together. */
function airTheScene(seconds: number): ParticlePool {
  const h = harness();
  // 900 ms of settle after the cherry takes: the rod is out at the flame when it catches and walks
  // home from there, and a column whose origin is sliding across the table is not the resting plume
  // this file measures (§15).
  lit(h, 900);
  const pending: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') pending.push(event.burst);
  });
  const pool = new ParticlePool(1400);
  const steps = Math.round((seconds * 1000) / STEP);
  const drawEnds = Math.round(1400 / STEP);
  let clockMs = 0;
  h.press('cigarette');
  for (let i = 0; i < steps; i++) {
    if (i === drawEnds) h.release('cigarette');
    h.engine.advance(STEP);
    clockMs += STEP;
    for (const burst of pending.splice(0, pending.length)) {
      intakeBurst(burst, pool, { densityScale: 1 });
    }
    pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, clockMs / 1000);
  }
  return pool;
}

function shapeOf(pool: ParticlePool): Shape {
  const xs: number[] = [];
  const ys: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pool.forEachActive((particle) => {
    const r = particle.radius * particle.scale * particle.size;
    xs.push(particle.x);
    ys.push(particle.y);
    minX = Math.min(minX, particle.x - r);
    maxX = Math.max(maxX, particle.x + r);
    minY = Math.min(minY, particle.y - r);
    maxY = Math.max(maxY, particle.y + r);
  });
  expect(xs.length, 'the scene had a plume to measure').toBeGreaterThan(20);
  const sigmaX = sd(xs);
  const sigmaY = sd(ys);
  return {
    sigmaX,
    sigmaY,
    elongation: sigmaY / Math.max(sigmaX, 1e-6),
    coverage: (maxX - minX) * (maxY - minY),
  };
}

describe('the smoke moves as one body (§15)', () => {
  it('the plume the player sees is taller than it is wide, and narrow', () => {
    const shape = shapeOf(airTheScene(2.5));
    // Re-measured 2026-10-07 with the lighting travel in the scene: the rod now goes out to the
    // flame and walks home, so the column's first second is born along that path. sigmaX 0.0947 of
    // a stage, stretched 2.34x taller than wide, body footprint 0.499. The failure this guards
    // against — a per-particle noise lattice — measured 0.370 and a footprint of 3.47 stages, so
    // both bounds still sit an order of magnitude away from the fog they are here to catch.
    expect(shape.elongation).toBeGreaterThanOrEqual(1.5);
    expect(shape.sigmaX).toBeLessThanOrEqual(0.11);
    expect(shape.coverage).toBeLessThanOrEqual(0.62);
  });

  it('two puffs still do not trace the same path (§16)', () => {
    // The reason this is asserted: sharing one field is exactly what could have made every puff
    // identical. They do not, because each one samples the air at its own place and moment.
    const h = harness();
    lit(h);
    const paths: string[] = [];
    h.engine.on((event) => {
      if (event.kind === 'burst' && event.burst.kind === 'drift') {
        const pool = new ParticlePool(400);
        intakeBurst(event.burst, pool, { densityScale: 1 });
        for (let i = 0; i < 120; i++) {
          pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, (i * STEP) / 1000);
        }
        const xs: number[] = [];
        pool.forEachActive((particle) => xs.push(Number(particle.x.toFixed(4))));
        paths.push(xs.sort().join(','));
      }
    });
    h.engine.advance(14000);
    expect(paths.length, 'the cherry drifted more than once').toBeGreaterThan(1);
    expect(new Set(paths).size, 'every drift traced the same line').toBe(paths.length);
  });
});
