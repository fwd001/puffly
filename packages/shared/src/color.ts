/** Colour helpers shared by the pure layer (tints) and the renderer (drawing). */

export type Rgb = readonly [number, number, number];

export const rgb = (r: number, g: number, b: number): Rgb => [r, g, b] as const;

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

export const scaleRgb = (value: Rgb, factor: number): Rgb => [
  Math.round(value[0] * factor),
  Math.round(value[1] * factor),
  Math.round(value[2] * factor),
];

export const rgbToCss = (value: Rgb, alpha = 1): string =>
  alpha >= 1
    ? `rgb(${value[0]}, ${value[1]}, ${value[2]})`
    : `rgba(${value[0]}, ${value[1]}, ${value[2]}, ${alpha.toFixed(3)})`;

/** Base palette of SPEC.md §57 — restrained, flame is the only loud colour. */
export const PALETTE = {
  deepCharcoal: rgb(18, 19, 23),
  warmGray: rgb(94, 88, 82),
  softWhite: rgb(232, 228, 220),
  emberOrange: rgb(255, 106, 26),
  emberCore: rgb(255, 214, 150),
  smokeGray: rgb(196, 198, 205),
  ashGray: rgb(126, 126, 130),
  coalBlack: rgb(34, 32, 33),
} as const;
