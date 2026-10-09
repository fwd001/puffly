/**
 * Every word the interface can say must have a glyph in the baked atlas.
 *
 * The atlas is baked from the copy table (`scripts/bake-atlas.mjs`), so this failure has one shape:
 * a word was added or changed and nobody re-baked. Without this test the symptom would be a tofu box
 * or a hole in the middle of a number on a phone at 2am, which is exactly the class of failure §9 of
 * the brief exists to prevent.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutText, parseAtlas } from '@puffly/game-scene';
import { COPY } from '../copy';

const atlas = parseAtlas(
  JSON.parse(readFileSync(new URL('../../../public/atlas/glyphs.json', import.meta.url), 'utf8')),
);

describe('the baked atlas covers the copy table', () => {
  it('has a glyph for every character of every value, in every locale', () => {
    const missing = new Set<string>();
    for (const table of Object.values(COPY)) {
      for (const value of Object.values(table)) {
        for (const char of layoutText(String(value), atlas, 1).missing) missing.add(char);
      }
    }
    expect([...missing], 're-bake: node scripts/bake-atlas.mjs').toEqual([]);
  });

  it('covers the alphabet the figures on screen are formatted with, which the copy table never spells', () => {
    // `2 / 12` and `100%` are built at runtime. The bake writes down the alphabet it claims covers
    // them; this is the guard on that claim — the first atlas was missing `2` and `%` and the HUD
    // drew "1 / 1" over a hole.
    expect(atlas.readout.length).toBeGreaterThanOrEqual(10);
    const missing = [...atlas.readout].filter((char) => atlas.metrics[char] === undefined);
    expect(missing, 're-bake: node scripts/bake-atlas.mjs').toEqual([]);
    expect(layoutText('2 / 12', atlas, 1).missing).toEqual([]);
    expect(layoutText('100%', atlas, 1).missing).toEqual([]);
  });

  it('was baked with room to spare rather than exactly the table', () => {
    // The bake adds a spare column and row to the grid; a count at the floor would mean the grid
    // arithmetic changed shape, not that the copy table shrank.
    expect(Object.keys(atlas.metrics).length).toBeGreaterThanOrEqual(300);
    expect(atlas.columns * atlas.rows).toBeGreaterThanOrEqual(Object.keys(atlas.metrics).length);
  });
});
