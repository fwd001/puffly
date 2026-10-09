import { describe, expect, it } from 'vitest';
import {
  canvasToWorld,
  parseAim,
  parseStageBox,
  rodBetween,
  stageWorldSize,
  toWorld,
  WORLD_HEIGHT,
} from '../stage';

describe('the scene reads the shell’s own mirror, and nothing else', () => {
  it('parses the five points out of the data-aim string', () => {
    const aim = parseAim(
      'body:0.6,0.4 ember:0.7,0.35 lighter:0.1,0.8 ashtray:0.5,0.9 pack:0.2,0.85',
    );
    expect(Object.keys(aim).sort()).toEqual(['ashtray', 'body', 'ember', 'lighter', 'pack']);
    expect(aim.body).toEqual({ x: 0.6, y: 0.4 });
  });

  it('ignores junk instead of inventing a point at (0,0)', () => {
    const aim = parseAim('body:0.6,0.4 nonsense:x,y pack:0.2,0.85 later:0.9,0.9');
    expect(Object.keys(aim).sort()).toEqual(['body', 'pack']);
  });

  it('maps fractions to world units with y flipped, so the table is not upside down', () => {
    const centre = toWorld({ x: 0.5, y: 0.5 }, 1);
    expect(centre).toEqual([0, 0, 0]);
    const top = toWorld({ x: 0.5, y: 0.25 }, 1);
    expect(top[1]).toBeCloseTo(WORLD_HEIGHT * 0.25, 6);
    const right = toWorld({ x: 0.75, y: 0.5 }, 2);
    expect(right[0]).toBeCloseTo(WORLD_HEIGHT * 2 * 0.25, 6);
  });

  it('takes the rod’s angle from the two published points', () => {
    const straight = rodBetween({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, 1);
    expect(straight.angle).toBeCloseTo(0, 6);
    expect(straight.mid[0]).toBeCloseTo(0, 6);
    const rising = rodBetween({ x: 0.5, y: 0.6 }, { x: 0.5, y: 0.4 }, 1);
    expect(rising.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('a rod has length even when the two points coincide', () => {
    const degenerate = rodBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1);
    expect(Number.isFinite(degenerate.length)).toBe(true);
    expect(degenerate.length).toBeLessThan(0.01);
  });
});

describe('the stage box is what makes a fraction land where the core says', () => {
  it('refuses a box it cannot read rather than pretending the canvas is the stage', () => {
    expect(parseStageBox('0,0.1,1,0.7')).toEqual({ x: 0, y: 0.1, width: 1, height: 0.7 });
    expect(parseStageBox('junk')).toBeNull();
    expect(parseStageBox('0,0,0,1')).toBeNull();
    expect(parseStageBox('0,0,1')).toBeNull();
  });

  it('puts the stage centre at the world origin whatever the letterbox', () => {
    const box = { x: 0.1, y: 0.2, width: 0.8, height: 0.5 };
    const centre = canvasToWorld({ x: 0.5, y: 0.45 }, box, 0.5);
    expect(centre[0]).toBeCloseTo(0, 6);
    expect(centre[1]).toBeCloseTo(0, 6);
  });

  it('lands the box’s own edges on the stage’s world edges', () => {
    // A 3:4 stage inside a 390×844 canvas: full width, and a letterbox top and bottom.
    const box = { x: 0, y: 0.192, width: 1, height: 0.616 };
    const viewportAspect = 390 / 844;
    const topLeft = canvasToWorld({ x: 0, y: 0.192 }, box, viewportAspect);
    const bottomRight = canvasToWorld({ x: 1, y: 0.808 }, box, viewportAspect);
    const size = stageWorldSize(box, viewportAspect);
    expect(topLeft[1]).toBeCloseTo(size.height / 2, 6);
    expect(bottomRight[1]).toBeCloseTo(-size.height / 2, 6);
    expect(topLeft[0]).toBeCloseTo(-size.width / 2, 6);
    expect(bottomRight[0]).toBeCloseTo(size.width / 2, 6);
    // And the stage is 3:4, because that is what the box says it is — not what a camera assumed.
    expect(size.width / size.height).toBeCloseTo(0.75, 3);
  });

  it('sizes the camera frame from the box, not from the canvas', () => {
    const size = stageWorldSize({ x: 0, y: 0, width: 0.75, height: 1 }, 0.5);
    expect(size.height).toBe(WORLD_HEIGHT);
    expect(size.width).toBeCloseTo(WORLD_HEIGHT * 0.75 * 0.5, 6);
  });
});
