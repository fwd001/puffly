/**
 * 稿子 S7 的「先从灰柱断裂」has to be something an eye can see, and a dot is not a break.
 *
 * Measured before this file: the piece that came off the column was drawn as `size × size*0.55` —
 * the same ellipse a grain gets, only fatter — so the break and the dust were one mark on screen and
 * the beat the deck names could not be read even after Game Core started modelling it.
 */

import { describe, expect, it } from 'vitest';
import type { GameStateView } from '@puffly/game-core';
import { createViewport } from '../viewport';
import { drawCigarette } from '../props';
import { createFakeCanvas, type FakeCall } from './fakeCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

interface Mark {
  rx: number;
  ry: number;
  x: number;
  y: number;
}

/**
 * `drawFallingAsh` is the only place inside `drawCigarette` that emits an ellipse, and it runs last,
 * so the ellipses pair one-to-one with `ash.falling` in order. The centre is read off the translate
 * that opens each fragment's own transform.
 */
function ashMarks(state: GameStateView): Mark[] {
  const canvas = createFakeCanvas();
  const viewport = createViewport({ width: 390, height: 844, dpr: 2 });
  drawCigarette(canvas.ctx, state, viewport);

  const marks: Mark[] = [];
  let at: Mark = { rx: 0, ry: 0, x: 0, y: 0 };
  for (const call of canvas.calls as FakeCall[]) {
    if (call.name === 'translate') {
      at = { ...at, x: Number(call.args[0]), y: Number(call.args[1]) };
    }
    if (call.name === 'ellipse') {
      marks.push({ ...at, rx: Number(call.args[2]), ry: Number(call.args[3]) });
    }
  }
  return marks;
}

function flicked(): { state: GameStateView; harness: ReturnType<typeof harness> } {
  const h = harness();
  lit(h);
  h.until(() => h.state().cigarette.ash.ready, 3000);
  h.tap('ash');
  return { state: h.state(), harness: h };
}

describe('the broken column is drawn as a piece (§ S7)', () => {
  it('is longer than it is thick, unlike a grain', () => {
    const { state } = flicked();
    const marks = ashMarks(state);
    expect(marks).toHaveLength(state.cigarette.ash.falling.length);
    const flake = marks[0];
    const ratio = flake === undefined ? Number.NaN : flake.rx / flake.ry;
    console.log(
      `FLAKE rx=${(flake?.rx ?? 0).toFixed(1)} ry=${(flake?.ry ?? 0).toFixed(1)} ratio=${ratio.toFixed(2)}`,
    );
    expect(ratio, `the flick drew ${String(marks.length)} marks`).toBeGreaterThanOrEqual(3);
  });

  it('scatters into marks that stay round', () => {
    const h = harness();
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 3000);
    h.tap('ash');
    h.until(() => h.state().cigarette.ash.falling.length > 1, 340);

    const state = h.state();
    const marks = ashMarks(state);
    expect(marks.length).toBeGreaterThan(1);
    for (const [index, mark] of marks.entries()) {
      expect(mark.rx / mark.ry, `mark ${String(index)}`).toBeLessThan(2);
    }
  });

  it('sits at the point the core put it, not one the renderer chose', () => {
    const { state } = flicked();
    const viewport = createViewport({ width: 390, height: 844, dpr: 2 });
    const marks = ashMarks(state);
    for (const [index, fragment] of state.cigarette.ash.falling.entries()) {
      const centre = viewport.px(fragment.origin);
      const mark = marks[index];
      expect(mark, `fragment ${String(index)} drew nothing`).toBeDefined();
      expect(Math.abs((mark?.x ?? 0) - centre.x), 'x drifted off the state').toBeLessThan(1);
      expect(Math.abs((mark?.y ?? 0) - centre.y), 'y drifted off the state').toBeLessThan(1);
    }
  });
});
