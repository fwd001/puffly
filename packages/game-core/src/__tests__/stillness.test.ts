import { describe, expect, it } from 'vitest';
import { STEP_MS, type GameEngine } from '@puffly/game-core';
import { harness, lit } from './harness';

/**
 * §59 with §22: the world is allowed to move, but it must arrive at its changes instead of
 * switching on. The event system already envelopes (a gust fades in and out on a sine); this
 * covers the other half — the noise that has no event behind it. Rolled fresh every frame at 60 Hz
 * it is a shiver with no cause, and the player reads the whole background as unsettled.
 *
 * Both directions are asserted, and the two halves are killed by different mutations: dropping the
 * smoothing makes a field jump (measured 0.159 wind / 1.27° bearing / 0.311 turbulence in a single
 * step); pinning a field to a constant makes it stop wandering (measured 0.000 late spread). A gate
 * that only checked "never moves" would be satisfied by a frozen world, which §21 forbids.
 */

const FRAMES = 1800;

interface Reading {
  wind: number;
  bearingDeg: number;
  turbulence: number;
}

const read = (engine: GameEngine): Reading => {
  const state = engine.getState();
  return {
    wind: state.world.wind,
    bearingDeg: state.world.windDirectionDeg,
    turbulence: state.smoke.turbulence,
  };
};

interface Trace {
  /** Largest single-frame change, over runs of adjacent frames with nothing happening. */
  jump: Reading;
  /** max − min across the second half of the run: how far the field wanders once settled. */
  lateSpread: { wind: number; turbulence: number };
  quietFrames: number;
}

/**
 * Frames with an active event are skipped and the run is broken there, so an event's own beginning
 * and end can never be read as a jump. The spread is measured after the halfway mark so it
 * describes the steady state rather than the value the field happened to start at.
 */
function trace(engine: GameEngine): Trace {
  const jump: Reading = { wind: 0, bearingDeg: 0, turbulence: 0 };
  const late: { wind: number[]; turbulence: number[] } = { wind: [], turbulence: [] };
  let quietFrames = 0;
  let previous: Reading | null = null;

  for (let index = 0; index < FRAMES; index++) {
    engine.advance(STEP_MS);
    if (engine.getState().world.activeEvents.length > 0) {
      previous = null;
      continue;
    }
    const current = read(engine);
    quietFrames++;
    if (previous) {
      for (const key of ['wind', 'bearingDeg', 'turbulence'] as const) {
        jump[key] = Math.max(jump[key], Math.abs(current[key] - previous[key]));
      }
    }
    if (index > FRAMES / 2) {
      late.wind.push(current.wind);
      late.turbulence.push(current.turbulence);
    }
    previous = current;
  }

  const spread = (values: number[]): number =>
    values.length ? Math.max(...values) - Math.min(...values) : 0;

  return {
    jump,
    lateSpread: { wind: spread(late.wind), turbulence: spread(late.turbulence) },
    quietFrames,
  };
}

/** Every case walks the same quiet stretch, so the vacuity guard is stated once. */
function quietStretch(): Trace {
  const h = harness();
  lit(h);
  const result = trace(h.engine);
  expect(result.quietFrames).toBeGreaterThan(300);
  return result;
}

describe('a world at rest is at rest (§59)', () => {
  it('never jumps the wind or its bearing between neighbouring frames', () => {
    const { jump } = quietStretch();
    // Smoothed these measure 0.00064 and 0.0051°; re-rolled per frame they measured 0.159 / 1.27°.
    expect(jump.wind).toBeLessThan(0.01);
    expect(jump.bearingDeg).toBeLessThan(0.1);
  });

  it('never jumps the smoke turbulence between neighbouring frames', () => {
    const { jump } = quietStretch();
    // Smoothed this measures 0.0033; re-rolled per frame it measured 0.311.
    expect(jump.turbulence).toBeLessThan(0.05);
  });

  it('still lets the wind wander, so rest has not become frozen (§21)', () => {
    const { lateSpread } = quietStretch();
    expect(lateSpread.wind).toBeGreaterThan(0.002);
  });

  it('still lets the smoke curl, so rest has not become frozen (§21)', () => {
    const { lateSpread } = quietStretch();
    expect(lateSpread.turbulence).toBeGreaterThan(0.005);
  });
});
