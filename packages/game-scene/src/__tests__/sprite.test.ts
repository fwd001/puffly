import { describe, expect, it } from 'vitest';
import { radialVignette, softDisc } from '../sprite';

describe('the puff sprite is soft, and it is generated rather than drawn', () => {
  it('is solid in the middle and clear at the rim', () => {
    const size = 33;
    const data = softDisc(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(16, 16)).toBe(255);
    expect(alphaAt(0, 0)).toBeLessThan(40);
    expect(alphaAt(16, 0)).toBeLessThan(40);
  });

  it('fades monotonically outwards, so a puff has no ring in it', () => {
    const size = 41;
    const data = softDisc(size).image.data as Uint8Array;
    const alphaAt = (x: number): number => data[(20 * size + x) * 4 + 3] as number;
    let previous = 999;
    for (let x = 20; x < size; x += 1) {
      const now = alphaAt(x);
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it('carries the size it was asked for', () => {
    expect(softDisc(16).image.width).toBe(16);
  });
});

describe('the vignette is clear in the middle and dark at the rim', () => {
  it('is transparent at the centre and opaque at the edge', () => {
    const size = 33;
    const data = radialVignette(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(16, 16)).toBeLessThan(10);
    expect(alphaAt(0, 16)).toBe(255);
  });

  it('gets darker as it goes out, so there is no ring', () => {
    const size = 41;
    const data = radialVignette(size).image.data as Uint8Array;
    let previous = -1;
    for (let x = 20; x < size; x += 1) {
      const now = data[(20 * size + x) * 4 + 3] as number;
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
  });
});
