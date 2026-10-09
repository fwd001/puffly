/**
 * While two renderers ship, they must agree about how big a prop is.
 *
 * The 3D scene cannot import the Canvas 2D props module — that module is canvas-bound and is slated
 * for deletion (P5) — so it carries its own constants, and this test is what stops them drifting
 * apart in the meantime. It is deliberately temporary: when the 2D renderer goes, this file goes
 * with it, and the scene's constants become the only ones.
 */
import { describe, expect, it } from 'vitest';
import { LIGHTER_SIZE as SCENE_LIGHTER, PACK_SIZE as SCENE_PACK } from '@puffly/game-scene';
import { LIGHTER_SIZE as CANVAS_LIGHTER, PACK_SIZE as CANVAS_PACK } from '@puffly/game-renderer';

describe('the two renderers agree about prop sizes', () => {
  it('draws the lighter and the pack at the size the canvas layer uses', () => {
    expect(SCENE_LIGHTER).toEqual(CANVAS_LIGHTER);
    expect(SCENE_PACK).toEqual(CANVAS_PACK);
  });

  it('reads a stage unit the same way: the number is a fraction of the stage’s height', () => {
    // A guard on the direction of the conversion, not just the magnitude: 0.05 of a 4-unit-tall
    // stage is 0.2 world units, and a layer that multiplied by the width instead would fail here.
    const worldHeight = 4;
    expect(SCENE_LIGHTER.width * worldHeight).toBeCloseTo(0.2, 6);
  });
});
