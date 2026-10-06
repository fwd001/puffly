/**
 * The brief's 视觉基线 (附录 C) is a table of named colours, and a named colour is checkable.
 *
 * These read the shell's own tokens out of the two files that decide what the app looks like
 * before a pixel is drawn, so the comparison is with what ships rather than with what a
 * component happens to remember. The one place the baseline contradicts itself is measured too
 * (see the AA exception below) rather than argued about.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const MANIFEST = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

/** 附录 C, verbatim. */
const BASELINE = {
  '--deep-charcoal': '#0b0a09', // 底色
  '--soft-white': '#f2ede6', // 正文
  '--ember-orange': '#ff8a3d', // 余烬橙
  '--cool-blue': '#a8d4e0', // 冷色（减量/水）
  '--warm-gray': '#7e746a', // 次级文字
} as const;

function token(name: string): string {
  const match = CSS.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  const hex = match?.[1];
  if (!hex) throw new Error(`${name} is not a hex token in global.css`);
  return hex.toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG 2.x relative luminance, then the ratio — the same maths §5.4 holds the text to. */
function contrast(foreground: string, background: string): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string): number => {
    const [r = 0, g = 0, b = 0] = hexToRgb(hex).map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

describe('the visual baseline (附录 C)', () => {
  it('paints the chrome with the named colours from the brief', () => {
    for (const [name, hex] of Object.entries(BASELINE)) {
      expect(token(name)).toBe(hex);
    }
  });

  it('the launch screen is the same colour as the page', () => {
    const declared = [...MANIFEST.matchAll(/(?:background_color|theme_color): '(#[0-9a-f]{6})'/g)];
    // Both keys, or the OS paints one edge and the app paints another.
    expect(declared).toHaveLength(2);
    for (const match of declared) {
      expect(match[1]?.toLowerCase()).toBe(token('--deep-charcoal'));
    }
  });

  it('clears AA wherever the chrome puts words on the base', () => {
    const base = token('--deep-charcoal');
    for (const name of ['--soft-white', '--smoke-gray', '--ember-orange', '--ember-core']) {
      expect(contrast(token(name), base), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the 次级 tone off running text, because the brief contradicts itself', () => {
    const base = token('--deep-charcoal');
    const secondary = contrast(token('--warm-gray'), base);
    // §5.4 asks for AA on body text at ≥ 15px; 附录 C asks for #7E746A. Both cannot hold, so the
    // hairlines get the named colour and the labels keep the lighter one — measured, not asserted
    // in prose, so nobody "tidies" the labels onto this colour later.
    expect(secondary).toBeLessThan(4.5);
    expect(secondary).toBeGreaterThanOrEqual(3);
  });
});
