/**
 * The accessibility floor the design names: 最小字号 15 (Smoke Ritual `accessibility.minFontSize`).
 *
 * This is a source-level check rather than a browser one on purpose. A computed-style assertion
 * would only ever see the screens a test happens to open, while the rule is about every string
 * the shell can put on screen — including the ones that appear only after a player has unlocked
 * something, or only in right-to-left, or only in the wordless tier.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../..', import.meta.url));

const FLOOR = 15;
/** The three ways the shell writes a size: scaled pixels, plain pixels, and `rem` on a 16px root. */
const SIZES =
  /font-size:\s*(?:calc\((\d+(?:\.\d+)?)px\s*\*\s*var\(--text-scale\)\)|(\d+(?:\.\d+)?)px|(\d+(?:\.\d+)?)rem)/g;

function styles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
      found.push(...styles(full));
      continue;
    }
    if (entry.endsWith('.vue') || entry.endsWith('.css')) found.push(full);
  }
  return found;
}

/** What a declaration actually paints, in css pixels. */
function pxOf(match: RegExpMatchArray): number | undefined {
  const [scaled, plain, rem] = [match[1], match[2], match[3]];
  if (scaled !== undefined) return Number(scaled);
  if (plain !== undefined) return Number(plain);
  return rem === undefined ? undefined : Number(rem) * 16;
}

function sizesOf(css: string): number[] {
  return [...css.matchAll(SIZES)].flatMap((match) => {
    const px = pxOf(match);
    return px === undefined ? [] : [px];
  });
}

describe(`the type floor (§accessibility: ${String(FLOOR)}px)`, () => {
  it('finds the styles the shell ships, so the scan is not empty', () => {
    const files = styles(src);
    expect(files.length).toBeGreaterThan(6);
    const all = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(all).toContain('var(--text-scale)');
    expect(sizesOf(all).length).toBeGreaterThan(20);
  });

  it('no word the shell can put on screen is smaller than the floor', () => {
    for (const file of styles(src)) {
      for (const px of sizesOf(readFileSync(file, 'utf8'))) {
        expect(px, `${file.replace(src, '')} sets ${String(px)}px`).toBeGreaterThanOrEqual(FLOOR);
      }
    }
  });

  it('the scan reads all three shapes it claims to cover', () => {
    expect(sizesOf('.a { font-size: calc(11px * var(--text-scale)); }')).toEqual([11]);
    expect(sizesOf('.b { font-size: 9px; }')).toEqual([9]);
    expect(sizesOf('.c { font-size: 0.85rem; }')).toEqual([13.6]);
    expect(sizesOf('.d { font-size: calc(15px * var(--text-scale)); }')).toEqual([15]);
  });
});
