/**
 * The numbers the head-up display reads (§9.2 of the Smoke Ritual brief: 6 / 12, 9mm, 2.1g).
 *
 * They are measurements of this simulation, so they live in core next to the geometry that
 * produces them — a phone, a desktop window and a replayed session must agree on how tall the
 * ash column is, and the shell is only allowed to format what it is handed.
 */

import { describe, expect, it } from 'vitest';
import { CIGARETTE_LENGTH } from '../types/geometry';
import { harness, type Harness } from './harness';

/** The route a player actually takes: pick it up, then ask the lighter for a flame. */
function lit(h: Harness): void {
  h.tap('cigarette');
  h.run(16);
  h.tap('lighter');
  h.run(900);
  expect(h.state().cigarette.ember.lit).toBe(true);
}

describe('readouts (§9.2: the ring, the millimetres, the grams)', () => {
  it('a fresh rod is all paper and no ash', () => {
    expect(harness().state().cigarette.readouts).toEqual({
      puffsTarget: 3,
      ashMm: 0,
      rodMm: 84,
      ashGrams: 0,
    });
  });

  it('the figures belong to the rod in the hand, not to the engine', () => {
    const long = harness({ cigaretteId: 'test-long' });
    expect(long.state().cigarette.readouts.rodMm).toBe(100);
    expect(long.state().cigarette.readouts.puffsTarget).toBe(5);
    expect(harness().state().cigarette.readouts.rodMm).toBe(84);
  });

  it('the rod only shortens and the ash mass only grows, while it burns', () => {
    const h = harness();
    lit(h);
    let rod = h.state().cigarette.readouts.rodMm;
    let grams = h.state().cigarette.readouts.ashGrams;
    for (let step = 0; step < 24; step += 1) {
      h.run(100);
      const next = h.state().cigarette.readouts;
      expect(next.rodMm, `step ${String(step)} grew the rod`).toBeLessThanOrEqual(rod);
      expect(next.ashGrams, `step ${String(step)} lost ash`).toBeGreaterThanOrEqual(grams);
      rod = next.rodMm;
      grams = next.ashGrams;
    }
    expect(rod).toBeLessThan(84);
    expect(grams).toBeGreaterThan(0);
  });

  it('the ash column in millimetres is the same column the renderer draws', () => {
    const h = harness();
    lit(h);
    h.run(1200);
    const cigarette = h.state().cigarette;
    const expected = (cigarette.ash.length / CIGARETTE_LENGTH) * 84;
    expect(cigarette.ash.length).toBeGreaterThan(0);
    expect(cigarette.readouts.ashMm).toBeCloseTo(expected, 1);
  });

  it('a finished stick reports its whole ash figure and no rod at all', () => {
    const h = harness();
    lit(h);
    h.run(5_000);
    const readouts = h.state().cigarette.readouts;
    expect(h.state().cigarette.rodRemaining).toBeCloseTo(0, 2);
    expect(readouts.rodMm).toBe(0);
    expect(readouts.ashGrams).toBeCloseTo(2.1, 1);
  });
});
