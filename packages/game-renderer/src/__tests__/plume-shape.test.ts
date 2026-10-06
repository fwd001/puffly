/**
 * The plume is a body of air, not a swarm — SPEC.md §15, §16.
 *
 * The complaint was that the smoke reads as fog and is out of focus (像雾, 没对上焦). The cause
 * was not the particle count, the alpha, or the spread angle: `curl2`'s third argument selects a
 * different noise *lattice*, and the pool was passing each particle's own seed, so two neighbours
 * were pushed in unrelated directions and nothing ever moved as a column. One shared field, and
 * the same numbers become a thread.
 *
 * Both halves of §15/§16 are measured here, because the fix could have broken the second one:
 * a shared field must still never look like the previous puff.
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
  /** The column's own footprint, as a share of the stage's area. */
  coverage: number;
}

const sd = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
};

/** Emit one real burst from a running session, then let it ride the shared field. */
function shapeOf(kind: Burst['kind'], seconds: number): Shape {
  const h = harness();
  lit(h);
  let burst: Burst | null = null;
  h.engine.on((event) => {
    if (!burst && event.kind === 'burst' && event.burst.kind === kind) burst = event.burst;
  });
  if (kind === 'exhale') {
    h.press('cigarette');
    h.engine.advance(1400);
    h.release('cigarette');
    h.engine.advance(600);
  } else {
    h.engine.advance(6000);
  }
  if (!burst) throw new Error(`no ${kind} burst was emitted`);
  const recipe: Burst = burst;

  const pool = new ParticlePool(1200);
  intakeBurst(recipe, pool, { densityScale: 1 });
  const steps = Math.round((seconds * 1000) / STEP);
  for (let i = 0; i < steps; i++) {
    pool.update(STEP, { x: 0, y: 0 }, FIELD_SCALE, (i * STEP) / 1000);
  }

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
  expect(xs.length, `${kind} still had a body at ${String(seconds)}s`).toBeGreaterThan(4);
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
  it('the breath rises as a column, not a ball', () => {
    const shape = shapeOf('exhale', 2);
    // Measured on the shared field: elongation 2.4, sigmaX 0.035, footprint 0.14 of a stage.
    // With a lattice per particle the same session measured 1.10, 0.370 and 3.47 — a round cloud
    // with the area of three and a half screens, which is the fog.
    expect(shape.elongation).toBeGreaterThanOrEqual(1.8);
    expect(shape.sigmaX).toBeLessThanOrEqual(0.08);
    expect(shape.coverage).toBeLessThanOrEqual(0.6);
  });

  it('the lazy column stays a thread for its whole life', () => {
    const shape = shapeOf('drift', 3);
    // Measured 12.4 elongation and 0.009 sigmaX; the old per-particle field gave 2.21 and 0.193.
    expect(shape.elongation).toBeGreaterThanOrEqual(4);
    expect(shape.sigmaX).toBeLessThanOrEqual(0.05);
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
