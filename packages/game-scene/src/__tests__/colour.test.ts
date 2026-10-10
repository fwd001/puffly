/**
 * The colour strings the mirror actually meets.
 *
 * Three shapes are computed values (`rgb()` / `color(srgb …)` / `oklab(…)`) and two are token values
 * read out of custom properties (`#hex`, `color-mix(… , transparent)`) — the sliders' `--slider-*`
 * variables are the second kind, and they are why the last two shapes exist. Everything else here
 * guards parse shapes the pill, the sheets and the SVG ink already consume.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseColour } from '../colour';

describe('computed colours (read off real properties)', () => {
  it('rgb() channels are 0–255 and alpha rides along', () => {
    const solid = parseColour('rgb(196, 198, 205)');
    expect(solid?.alpha).toBe(1);
    expect(solid?.colour.getHex()).toBe(0xc4c6cd);
    const half = parseColour('rgb(10 20 30 / 0.5)');
    expect(half?.alpha).toBeCloseTo(0.5, 6);
  });

  it('color(srgb …) reads fractions, not 0–255', () => {
    // The trap this guards: dividing a 0–1 channel by 255 turns mid-grey into near-black.
    const grey = parseColour('color(srgb 0.5 0.5 0.5)');
    expect(grey?.colour.getHex()).toBe(0x808080);
  });

  it('oklab() runs the reference matrices — 0.5 lightness is linear 0.125 grey', () => {
    const grey = parseColour('oklab(0.5 0 0)');
    const out = new THREE.Color();
    grey?.colour.getRGB(out, THREE.LinearSRGBColorSpace);
    expect(out.r).toBeCloseTo(0.125, 4);
    expect(out.g).toBeCloseTo(0.125, 4);
    expect(out.b).toBeCloseTo(0.125, 4);
  });
});

describe('token values (read out of custom properties)', () => {
  it('hex stays hex — a custom property is not a computed colour', () => {
    expect(parseColour('#c4c6cd')?.colour.getHex()).toBe(0xc4c6cd);
    expect(parseColour('#fff')?.colour.getHex()).toBe(0xffffff);
  });

  it('a color-mix with transparent is that colour at that alpha', () => {
    const faded = parseColour('color-mix(in oklab, #808080 45%, transparent)');
    expect(faded?.colour.getHex()).toBe(0x808080);
    expect(faded?.alpha).toBeCloseTo(0.45, 6);
    const nested = parseColour('color-mix(in srgb-linear, rgb(196, 198, 205) 82%, transparent)');
    expect(nested?.colour.getHex()).toBe(0xc4c6cd);
    expect(nested?.alpha).toBeCloseTo(0.82, 6);
  });

  it('anything else is null, on purpose — no guessed colour', () => {
    expect(parseColour('color-mix(in oklab, red 45%, white)')).toBeNull();
    expect(parseColour('color-mix(in oklab, #fff, transparent)')).toBeNull();
    expect(parseColour('currentColor')).toBeNull();
    expect(parseColour('')).toBeNull();
  });
});
