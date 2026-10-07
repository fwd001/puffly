/**
 * What the number in `LightingSpec.warmth` actually buys — the scale every place is authored on.
 *
 * The field's doc comment said 「0 (warm/tungsten) .. 1 (cool/daylight)」. The one line that consumes
 * it mixes `[210,224,240]` (blue) into `[255,232,200]` (amber) *by* `warmth`, so 0 is the blue end
 * and 1 is the amber end — the opposite sentence. Both readings were live in the repository at the
 * same time: the shipped rooms are authored as if the code were right (a cold concrete stairwell at
 * 0.12, a neon street at 0.12), and the comment told the next author to invert all of them. Adding
 * fourteen more places on top of a contested scale would have multiplied that, so the scale is
 * measured off the painted frame here rather than argued about in prose.
 */

import { describe, expect, it } from 'vitest';
import { createDefaultSettings, createEngine, type GameStateView } from '@puffly/game-core';
import { drawBackground } from '../background';
import { createViewport } from '../viewport';
import { createFakeCanvas } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

function state(): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 909,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  for (let frame = 0; frame < 60; frame++) engine.advance(1000 / 60);
  return JSON.parse(JSON.stringify(engine.getState())) as GameStateView;
}

/** The sky's own first stop, as the background pass asked for it. */
function skyAt(warmth: number): { r: number; g: number; b: number } {
  const view = state();
  (view.world.light as { warmth: number }).warmth = warmth;
  const canvas = createFakeCanvas();
  drawBackground(canvas.ctx, view, createViewport({ width: 390, height: 844, dpr: 1 }));
  const colour = String(canvas.gradients[0]!.stops[0]!.color);
  const [r, g, b] = (colour.match(/\d+/g) ?? []).slice(0, 3).map(Number) as [
    number,
    number,
    number,
  ];
  return { r, b: b, g };
}

describe('the warmth scale is the one the pixels use (§23)', () => {
  it('ends blue at 0 and amber at 1', () => {
    const cold = skyAt(0);
    const hot = skyAt(1);
    console.log(
      `WARMTH 0 -> rgb(${cold.r},${cold.g},${cold.b}) | 1 -> rgb(${hot.r},${hot.g},${hot.b})`,
    );
    // The direction, stated as the two endpoints disagree about. Content that reads 0.12 as "cold
    // concrete" is only correct if these two hold.
    expect(cold.b).toBeGreaterThan(cold.r);
    expect(hot.r).toBeGreaterThan(hot.b);
  });

  it('turns the same way all the way across, so a value between the ends means what it says', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(skyAt);
    const swings = steps.map((s) => s.r - s.b);
    console.log(`WARMTH ramp ${swings.map((v) => String(v.toFixed(0))).join(' -> ')}`);
    for (let i = 1; i < swings.length; i++) {
      expect(swings[i]!, `warmth ${String(i / 4)}`).toBeGreaterThan(swings[i - 1]!);
    }
  });

  it('is the field the room carries, not a second opinion in the renderer', () => {
    // `drawBackground` reads `world.light.warmth`, which the core folds from the room's own
    // `lighting.warmth` and its time-of-day variant. If that ever stops happening the room table is
    // decoration and the two cases above are measuring a number nobody writes.
    const view = state();
    const authored = view.environment.lighting.warmth;
    expect(view.world.light.warmth).toBeCloseTo(authored, 6);
  });
});
