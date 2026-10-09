import { describe, expect, it } from 'vitest';
import { roomBackdrop, type RoomSource, type StyleSource } from '../room';

const style: StyleSource = { scene: { pool: [10, 20, 30] } };
const place = (warmth: number, ambient: number, deg = 90): RoomSource => ({
  background: {
    sky: [
      [30, 34, 44],
      [46, 48, 58],
    ],
    horizon: [24, 26, 34],
    silhouette: [12, 13, 18],
  },
  lighting: { ambient, warmth, keyDirectionDeg: deg },
});

describe('the 3D backdrop reads the same sky the painted one does', () => {
  it('reads the palette the renderer paints with, at the same exposure', () => {
    const lit = roomBackdrop(place(0.5, 0.8), style).sky;
    const dark = roomBackdrop(place(0.5, 0.1), style).sky;
    // Exposure runs 0.34..0.80, so a bright room's sky is measurably lighter than a dark one's.
    expect(lit[1]).toBeGreaterThan(dark[1]);
    // And the cast moves it too: the same exposure at the warm end is redder than at the cool end.
    const warm = roomBackdrop(place(1, 0.8), style).sky;
    const cool = roomBackdrop(place(0, 0.8), style).sky;
    expect(warm[0] - warm[2]).toBeGreaterThan(cool[0] - cool[2]);
  });

  it('moves when the place moves: a warm room and a cold one are different pictures', () => {
    const cold = roomBackdrop(place(0.1, 0.9), style).sky;
    const warm = roomBackdrop(place(0.9, 0.9), style).sky;
    expect(cold).not.toEqual(warm);
  });

  it('takes the key light’s angle from the place, and the pool from the skin in force', () => {
    const left = roomBackdrop(place(0.5, 1), style);
    const right = roomBackdrop(place(0.5, 1, 0), style);
    expect(left.key.x).not.toBeCloseTo(right.key.x, 3);
    expect(left.pool).toEqual([10, 20, 30]);
  });
});
