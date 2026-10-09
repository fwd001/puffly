/**
 * The 3D layer's room must be the painted layer's room.
 *
 * `backgroundStructure` is a second reader of the same picture — the sky's stops, the wall band, the
 * table's ink, the seeded clutter, the two pools — and the failure this guards against is the quiet
 * one: a reader that keeps its shape while the painter's numbers drift. So the colours it hands out
 * are compared against the fills `drawBackground` actually put on the canvas, from the same state.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { rgbToCss } from '@puffly/shared';
import { backgroundStructure, drawBackground, geometryFor } from '../background';
import { createViewport } from '../viewport';
import { createFakeCanvas } from './fakeCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const BOX = { x: 0, y: 0, width: 1, height: 1 };
const WIDTH = 390;
const HEIGHT = 844;

describe('the room as data is the room as paint', () => {
  it('stands up the default room: wall, table edge, the seeded clutter, two pools', () => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
    lit(h);
    const state = h.state();
    const structure = backgroundStructure(state, BOX, WIDTH, HEIGHT);
    expect(structure.wall?.alpha).toBe(0.85);
    expect(structure.table?.edgeY).toBe(state.stage.layout.tableEdgeY);
    expect(structure.glows).toHaveLength(2);

    // The clutter is the painter's own five seeded marks, at the same spots.
    const seeded = geometryFor(state).details;
    expect(structure.boxes).toHaveLength(seeded.length);
    structure.boxes.forEach((box, index) => {
      expect(box.x).toBeCloseTo(seeded[index]?.x ?? -1, 9);
      expect(box.y).toBeCloseTo(seeded[index]?.y ?? -1, 9);
    });
  });

  it('names the same wall and the same table ink the painter actually fills', () => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
    lit(h);
    const state = h.state();
    const fake = createFakeCanvas();
    drawBackground(fake.ctx, state, createViewport({ width: WIDTH, height: HEIGHT, dpr: 1 }));
    const fills = fake.calls
      .filter((call) => call.name === 'set:fillStyle')
      .map((call) => String(call.args[0]));

    const structure = backgroundStructure(state, BOX, WIDTH, HEIGHT);
    if (structure.wall === null || structure.table === null)
      throw new Error('quiet room is interior');
    expect(fills).toContain(rgbToCss(structure.wall.rgb, structure.wall.alpha));
    expect(fills).toContain(rgbToCss(structure.table.ink));
    expect(fills).toContain(rgbToCss(structure.table.nosingRgb, structure.table.nosingAlpha));
  });

  it('says nothing about an outdoor room it does not cover yet — empty, not wrong', () => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId: 'neon-street' });
    lit(h);
    const structure = backgroundStructure(h.state(), BOX, WIDTH, HEIGHT);
    expect(structure.sky).toHaveLength(3);
    expect(structure.wall).toBeNull();
    expect(structure.table).toBeNull();
    expect(structure.boxes).toEqual([]);
    expect(structure.glows).toEqual([]);
  });
});
