/**
 * One glyph, one meaning — the alphabet the whole interface is read with.
 *
 * The marks are the only thing a player reads a tier by at a glance: two cards can both say `14`
 * and mean different doors. That only works if a shape never changes sides, and it had already
 * broken once — the rung for *draws* borrowed `—`, which is the rod on the rail and in the HUD, so
 * a smoke shape at `—120` read as 120 sticks, an order of magnitude out, on the row the brief asks
 * to be read as tiers.
 *
 * The alphabet is written down in four places (the rail, the cabinet's kit, the HUD's readouts, the
 * collection rungs), so this reads all four and holds them against one meaning each. The alias table
 * below is the test's own claim about which names are the same thing — it is short on purpose, and
 * a new name has to be placed in it deliberately rather than absorbed silently.
 *
 * Outside this alphabet on purpose: `≈` used as prose inside 档案, where it marks an estimate and
 * not a category. It is also `≈` as the smoke-shape mark in the kit, which is a real ambiguity and
 * is written down in SPEC.md rather than quietly fixed here.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAIL_ENTRIES } from '../rail';
import { RUNG_MARKS } from '../scenes';

const HUD_SOURCE = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');
const SHEET_SOURCE = readFileSync(
  new URL('../components/CollectionSheet.vue', import.meta.url),
  'utf8',
);

/** The canonical thing each source's own name stands for. */
const MEANING: Record<string, string> = {
  // rail
  break: 'a break',
  ladder: 'a rod',
  boxes: 'a box',
  skins: 'a skin',
  kit: 'the kit',
  reduction: 'the reduction',
  settings: 'the settings',
  // HUD readouts
  rod: 'a rod',
  lighter: 'a lighter',
  tray: 'the tray',
  out: 'a stubbed rod',
  menu: 'the menu',
  // cabinet kit categories
  LIGHTERS: 'a lighter',
  ASHTRAYS: 'the tray',
  SMOKE: 'a smoke shape',
  SOUNDS: 'a sound',
  // rung axes
  breaks: 'a break',
  draws: 'a draw',
};

/** `key: 'glyph'` pairs from a component's own literal map, whatever the variable is called. */
function glyphsIn(source: string, keys: readonly string[]): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const key of keys) {
    const match = new RegExp(`${key}:\\s*'([^']+)'`).exec(source);
    if (match?.[1]) found.push([key, match[1]]);
  }
  return found;
}

const alphabet: Array<{ glyph: string; meaning: string; where: string }> = [
  ...RAIL_ENTRIES.map((entry) => ({
    glyph: entry.glyph,
    meaning: MEANING[entry.id] ?? entry.id,
    where: `rail:${entry.id}`,
  })),
  ...Object.entries(RUNG_MARKS)
    .filter(([, glyph]) => glyph !== null)
    .map(([unit, glyph]) => ({
      glyph: glyph as string,
      meaning: MEANING[unit] ?? unit,
      where: `rung:${unit}`,
    })),
  ...glyphsIn(HUD_SOURCE, ['rod', 'lighter', 'tray', 'out']).map(([key, glyph]) => ({
    glyph,
    meaning: MEANING[key] ?? key,
    where: `hud:${key}`,
  })),
  ...[...SHEET_SOURCE.matchAll(/CollectionCategory\.(\w+),\s*glyph:\s*'([^']+)'/g)].map(
    (match) => ({
      glyph: match[2] ?? '',
      meaning: MEANING[match[1] ?? ''] ?? match[1] ?? '',
      where: `kit:${match[1]}`,
    }),
  ),
];

describe('the mark alphabet means one thing (§23, §55)', () => {
  it('knows every mark the interface wears', () => {
    // The denominator, printed so a new site cannot be added without widening this list.
    console.log(
      `ALPHABET ${alphabet.length} marks: ${alphabet.map((m) => `${m.glyph}=${m.meaning}`).join(' ')}`,
    );
    expect(alphabet.length).toBe(7 + 3 + 4 + 4);
  });

  it('never lets one shape mean two things', () => {
    const clashes: string[] = [];
    for (const entry of alphabet) {
      const same = alphabet.filter(
        (other) => other.glyph === entry.glyph && other.meaning !== entry.meaning,
      );
      for (const other of same) clashes.push(`${entry.glyph}: ${entry.where} vs ${other.where}`);
    }
    expect([...new Set(clashes)]).toEqual([]);
  });

  it('keeps the rungs distinguishable from each other', () => {
    // The reason the marks exist: `14` and `14` are two different doors.
    const rungGlyphs = Object.values(RUNG_MARKS).filter((glyph) => glyph !== null);
    expect(new Set(rungGlyphs).size).toBe(rungGlyphs.length);
  });

  it('reddens when a rung borrows a mark that already means something else', () => {
    // The regression this file was written for, stated as a case rather than as prose.
    const rod = alphabet.filter((entry) => entry.glyph === '—');
    expect(rod.length).toBeGreaterThan(0);
    for (const entry of rod) expect(entry.meaning).toBe('a rod');
  });
});
