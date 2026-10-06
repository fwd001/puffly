/**
 * The picture must not shiver — SPEC.md §59, measured where the shiver is visible.
 *
 * `stillness.test.ts` guards the simulation's fields (wind, bearing, turbulence), which is how the
 * first pass at this was verified. That leaves the other half of the sentence unguarded: the player
 * never sees `world.wind`, they see the neon strips and the bokeh, and those have their own
 * time-driven numbers inside the draw calls. Nothing would have reddened if `flicker` had been
 * re-rolled from scratch each frame, because it never touches the state the core test reads.
 *
 * So this renders the background at the clock's own pace against a recording context and compares
 * one frame with the next, index by index. Two directions, killed by different mutations: a value
 * re-rolled per frame blows the per-frame delta; a value pinned to a constant fails the spread
 * check, and a frozen background is the other way the design says this is wrong (§21).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { STEP_MS, type GameStateView } from '@puffly/game-core';
import { drawBackground } from '../background';
import { createViewport } from '../viewport';
import { createFakeCanvas } from './fakeCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const FRAMES = 900;

/**
 * Every number the background put in front of the canvas for one frame — colours, their alphas,
 * and the stops of the gradients it built. Read as one flat list because the draw order is fixed:
 * the comparison that matters is slot by slot, frame by frame.
 */
function numbersFor(view: GameStateView): number[] {
  const fake = createFakeCanvas();
  const viewport = createViewport({ width: 390, height: 844, dpr: 1 });
  drawBackground(fake.ctx, view, viewport);
  const values: number[] = [];
  const grab = (text: string): void => {
    for (const found of text.matchAll(/\d+(?:\.\d+)?/g)) values.push(Number(found[0]));
  };
  for (const call of fake.calls) {
    if (call.name === 'set:fillStyle' || call.name === 'set:strokeStyle')
      grab(String(call.args[0]));
  }
  for (const gradient of fake.gradients) {
    for (const stop of gradient.stops) {
      values.push(stop.offset);
      grab(stop.color);
    }
  }
  return values;
}

function frames(): number[][] {
  // A room with signs in it. The fixture's quiet room has no time-driven part of the background at
  // all, which is how this file first reported a jump of 0.0000 over a background that never moves.
  const h = harness({ content: DEFAULT_CONTENT, environmentId: 'neon-street' });
  lit(h);
  const base = h.state();
  const rows: number[][] = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    rows.push(numbersFor({ ...base, nowMs: base.nowMs + frame * STEP_MS }));
  }
  return rows;
}

describe('the drawn background arrives at its changes (§59)', () => {
  const rows = frames();
  const widths = new Set(rows.map((row) => row.length));

  it('asks for the same number of fills every frame', () => {
    // The comparison below is positional; a background that gains or drops an element between
    // neighbouring frames is exactly the shiver this file is about, not a broken ruler.
    expect(widths.size).toBe(1);
    expect(rows[0]?.length).toBeGreaterThan(10);
  });

  it('changes no alpha by more than a flicker between neighbouring frames', () => {
    let jump = 0;
    for (let frame = 1; frame < rows.length; frame++) {
      const previous = rows[frame - 1];
      const current = rows[frame];
      if (!previous || !current) continue;
      for (let slot = 0; slot < current.length; slot++) {
        jump = Math.max(jump, Math.abs((current[slot] ?? 0) - (previous[slot] ?? 0)));
      }
    }
    console.log(`BACKGROUND jump=${jump.toFixed(4)} slots=${String(rows[0]?.length ?? 0)}`);
    // Measured on the shipped field: 0.0090 across 440 slots over 900 frames. Re-rolling the neon
    // per frame — the bug this catches — measures 0.3130, which is 35x the bound and is the shiver
    // the report described as 背景的那个东西一直在晃.
    expect(jump).toBeLessThan(0.05);
  });

  it('still moves, so rest has not become a still image (§21)', () => {
    const first = rows[0] ?? [];
    const spread = first.map((_, slot) => {
      const column = rows.map((row) => row[slot] ?? 0);
      return Math.max(...column) - Math.min(...column);
    });
    const widest = Math.max(...spread);
    console.log(`BACKGROUND spread=${widest.toFixed(4)}`);
    // Pinning the neon to a constant measures 0.0000 here: at rest nothing else in this room's
    // background moves either, so this is the whole picture's liveness, not one layer's.
    expect(widest).toBeGreaterThan(0.01);
  });
});
