import { describe, expect, it } from 'vitest';
import { radialVignette, roundedRect, softDisc, solidDisc } from '../sprite';

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

describe('the ash sprite is a shape, not a smudge', () => {
  it('is opaque through the body and only feathered at the rim', () => {
    const size = 33;
    const data = solidDisc(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(16, 16)).toBe(255);
    // Three quarters out is still the body — a softDisc would be down to a fraction by here.
    expect(alphaAt(16 + 12, 16)).toBe(255);
    expect(alphaAt(0, 0)).toBeLessThan(60);
  });

  it('still fades monotonically at the edge, so the rim is not jagged', () => {
    const size = 41;
    const data = solidDisc(size).image.data as Uint8Array;
    let previous = 999;
    for (let x = 20; x < size; x += 1) {
      const now = data[(20 * size + x) * 4 + 3] as number;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });
});

describe('a card is a rounded rectangle, not a disc', () => {
  it('is opaque through the body and at the middle of an edge', () => {
    const size = 65;
    const data = roundedRect(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(32, 32)).toBe(255);
    expect(alphaAt(32, 3)).toBe(255);
    expect(alphaAt(3, 32)).toBe(255);
  });

  it('turns the corners away', () => {
    const size = 65;
    const data = roundedRect(size).image.data as Uint8Array;
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3] as number;
    expect(alphaAt(1, 1)).toBeLessThan(60);
    expect(alphaAt(63, 63)).toBeLessThan(60);
  });

  it('a smaller radius keeps more of the corner than a stadium does', () => {
    const size = 65;
    const square = roundedRect(size, 0.2).image.data as Uint8Array;
    const stadium = roundedRect(size, 0.5).image.data as Uint8Array;
    const alphaAt = (data: Uint8Array, x: number, y: number): number =>
      data[(y * size + x) * 4 + 3] as number;
    // Diagonal distance from the corner: inside a 0.2 radius, outside a stadium's.
    expect(alphaAt(square, 3, 3)).toBe(255);
    expect(alphaAt(stadium, 3, 3)).toBeLessThan(60);
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
