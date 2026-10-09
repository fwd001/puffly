import { describe, expect, it } from 'vitest';
import { parseAim, rodBetween, toWorld, WORLD_HEIGHT } from '../stage';

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
