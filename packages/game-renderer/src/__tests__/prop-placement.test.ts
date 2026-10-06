/**
 * The table's props are placed once, and what you tap is where the picture is — SPEC.md §49, §55.
 *
 * This exists because of a specific bug. The lighter used to carry its own position on the state,
 * written once at engine construction from the *default* layout and never updated again. The hit
 * anchor came from the live layout instead, so on a phone the lighter was drawn where a desktop
 * window would put it — 63px below the point a finger had to press, and on top of the cigarette
 * pack. Nothing in the suite noticed, because no test read the field.
 *
 * So the central case here does not ask the layout where the lighter is. It calls the real
 * `drawLighter` and reads back the coordinates it emitted.
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  createEngine,
  layoutFor,
  type GameStateView,
} from '@puffly/game-core';
import { createViewport } from '../viewport';
import { drawLighter, lighterBox, packBox } from '../props';
import { createFakeCanvas, type FakeCanvas } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

/** Phone to ultrawide, portrait to landscape, including the shapes the design names. */
const SHAPES: readonly [number, number][] = [
  [320, 568],
  [360, 740],
  [390, 844],
  [414, 896],
  [600, 900],
  [768, 1024],
  [844, 390],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
];

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The shapes a finger actually arrives in: phone portrait, laptop, phone landscape. */
const TAP_SHAPES: readonly [number, number][] = [
  [390, 844],
  [1024, 768],
  [844, 390],
];

const engineFor = (aspect: number) => {
  const engine = createEngine({
    content: FIXTURE,
    seed: 7,
    wallClockMs: Date.UTC(2026, 9, 6, 22, 0, 0),
    settings: createDefaultSettings(),
  });
  engine.setStageAspect(aspect);
  engine.advance(100);
  return engine;
};

const gapBetween = (a: Box, b: Box): number =>
  Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);

/** The union of every path coordinate a draw call emitted: where the object actually is. */
const drawnBox = (canvas: FakeCanvas): Box => {
  const points = canvas.calls
    .filter((call) => ['moveTo', 'lineTo', 'ellipse', 'arc'].includes(call.name))
    .map((call) => call.args as number[]);
  expect(points.length, 'the draw emitted a path').toBeGreaterThan(0);
  const xs = points.map((p) => p[0] ?? 0);
  const ys = points.map((p) => p[1] ?? 0);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
};

const lighterAsDrawn = (state: GameStateView, width: number, height: number) => {
  const viewport = createViewport({ width, height, dpr: 2 });
  const canvas = createFakeCanvas();
  drawLighter(canvas.ctx, state, viewport);
  return { drawn: drawnBox(canvas), anchor: viewport.px(state.anchors.lighter) };
};

describe('the table keeps its things apart (§55)', () => {
  it('leaves a clear space between the lighter and the pack at every device shape', () => {
    for (const [width, height] of SHAPES) {
      const viewport = createViewport({ width, height, dpr: 2 });
      const layout = layoutFor(width / height);
      const lighter = lighterBox(viewport.px(layout.lighter), (units) => viewport.len(units));
      const pack = packBox(viewport.px(layout.pack), (units) => viewport.len(units));
      // Half a tap target, so two props never read as one object. The bug this guards against left
      // 9.8px of gap on a 390x844 phone.
      expect(gapBetween(lighter, pack), `${width}x${height} (${layout.id})`).toBeGreaterThanOrEqual(
        24,
      );
    }
  });
});

describe('what is drawn is what is tapped (§49)', () => {
  it('gives the lighter no position of its own to fall out of step', () => {
    expect('at' in engineFor(390 / 844).getState().lighter).toBe(false);
  });

  it('draws the lighter around the point the anchor says to tap', () => {
    for (const [width, height] of TAP_SHAPES) {
      const { drawn, anchor } = lighterAsDrawn(engineFor(width / height).getState(), width, height);
      expect(drawn.x0, `${width}x${height}: drawn left of the tap point`).toBeLessThanOrEqual(
        anchor.x,
      );
      expect(drawn.x1, `${width}x${height}: drawn right of the tap point`).toBeGreaterThanOrEqual(
        anchor.x,
      );
      expect(drawn.y0, `${width}x${height}: drawn above the tap point`).toBeLessThanOrEqual(
        anchor.y,
      );
      expect(drawn.y1, `${width}x${height}: drawn below the tap point`).toBeGreaterThanOrEqual(
        anchor.y,
      );
    }
  });

  it('moves the picture when the stage changes shape under it', () => {
    const engine = engineFor(390 / 844);
    const before = lighterAsDrawn(engine.getState(), 390, 844).drawn;
    engine.setStageAspect(2.16);
    const state = engine.getState();
    expect(state.stage.layout.lighter).toEqual(layoutFor(2.16).lighter);
    const after = lighterAsDrawn(state, 390, 844).drawn;
    // Same canvas, different stage shape: the drawn lighter cannot stay where it was.
    expect(after.x0).not.toBeCloseTo(before.x0, 0);
    expect(after.y0).not.toBeCloseTo(before.y0, 0);
  });
});
