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

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAIL_ENTRIES } from '../rail';
import { RUNG_MARKS } from '../scenes';

const HUD_SOURCE = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');
const SHEET_SOURCE = readFileSync(
  new URL('../components/CollectionSheet.vue', import.meta.url),
  'utf8',
);
const PILL_SOURCE = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');
const TAB_SOURCE = readFileSync(new URL('../components/TabRail.vue', import.meta.url), 'utf8');
const REDUCE_SOURCE = readFileSync(
  new URL('../components/ReductionPanel.vue', import.meta.url),
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
  level: 'a level',
  // S11's 统计 entry: the ledger's own numbers, which is also what `▤` must never come to mean on
  // any other surface.
  stats: 'the ledger',
  // S14's six gestures and S1-S6's three phase tabs. A gesture and the object it uses are one
  // referent on purpose: `△` on the pill (hold the lighter) and `△` on the tab (the 点燃 phase) are
  // both the lighter. That rule is what the two clashes below were measured against, and it resolved
  // both: the shape says what the moment is about, never which finger motion is asked for.
  pick: 'a rod',
  puff: 'a draw',
  flick: 'the ash',
  extinguish: 'a stubbed rod',
  discard: 'the tray',
  light: 'a lighter',
  // S23's three substitutes. `⌇` is the one to watch: it is a hair away from `⌁`, which is 磕灰.
  breathe: 'a breath',
  water: 'a drink',
  walk: 'a walk',
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

/**
 * S14 names six gestures as the loop itself and S1–S6 put three phases on the bottom rail, both in
 * the same shapes the rail and the HUD use. Until now neither site was in this alphabet, so
 * "a shape never changes sides" had never been checked against the marks a finger reads mid-break.
 * They join the one `MEANING` table above rather than getting their own: a gesture and the object it
 * uses are the same referent, and two tables would be two claims about what a shape means.
 */
function gestureMarks(source: string): Array<[string, string]> {
  return [...source.matchAll(/affordance === '(\w+)'">([^<]+)<\/template>/g)].map((match) => [
    String(match[1]),
    String(match[2]),
  ]);
}
function phaseMarks(source: string): Array<[string, string]> {
  return [...source.matchAll(/\{ id: '(\w+)', glyph: '([^']+)', key/g)].map((match) => [
    String(match[1]),
    String(match[2]),
  ]);
}

/** 减量页's three substitutes are marks from the same geometric family, so they are judged here too. */
function alternativeMarks(source: string): Array<[string, string]> {
  return [...source.matchAll(/\{ key: 'reduction\.alt\.(\w+)', glyph: '([^']+)' \}/g)].map(
    (match) => [String(match[1]), String(match[2])],
  );
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
  ...gestureMarks(PILL_SOURCE).map(([key, glyph]) => ({
    glyph,
    meaning: MEANING[key] ?? key,
    where: `pill:${key}`,
  })),
  ...phaseMarks(TAB_SOURCE).map(([key, glyph]) => ({
    glyph,
    meaning: MEANING[key] ?? key,
    where: `phase:${key}`,
  })),
  ...alternativeMarks(REDUCE_SOURCE).map(([key, glyph]) => ({
    glyph,
    meaning: MEANING[key] ?? key,
    where: `reduction:${key}`,
  })),
];

describe('the mark alphabet means one thing (§23, §55)', () => {
  it('knows every mark the interface wears', () => {
    // The denominator, printed so a new site cannot be added without widening this list.
    console.log(
      `ALPHABET ${alphabet.length} marks: ${alphabet.map((m) => `${m.glyph}=${m.meaning}`).join(' ')}`,
    );
    // +1 for the rung mark the level ladder wears: the places used to be hung on the calendar,
    // and a level is a fifth axis (§6.1). The rail term is the entry count of S10's seven plus
    // S11's 统计 — a new entry has to be added to that number on purpose, which is the whole point
    // of writing the denominator out. The next two terms are S14's gesture marks on the pill and
    // S1-S6's three phase tabs, added when this file started covering the loop itself: the pill term
    // is five because 取烟 has no mark of its own, which the case below pins. The last three are
    // S23's substitutes, which wear marks from this same geometric family.
    expect(alphabet.length).toBe(8 + 3 + 4 + 5 + 5 + 3 + 3);
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

  it('wears marks that are actually characters, not escape sequences', () => {
    // `\u2307` inside a `<template>` is not the character: Vue has no string escapes there, so the
    // row prints the six ASCII characters, which a player reads as "a unicode thing that did not
    // render". Only the template is scanned — in a script a real escape is correct code.
    const escape = /\\u[0-9a-fA-F]{4}/;
    const dir = new URL('../components/', import.meta.url);
    const files = readdirSync(dir).filter((name) => name.endsWith('.vue'));
    expect(files.length, 'the components this scans').toBeGreaterThan(6);
    const offenders = files
      .filter((name) => {
        const source = readFileSync(new URL(name, dir), 'utf8');
        const end = source.indexOf('</template>');
        return escape.test(source.slice(0, end < 0 ? source.length : end));
      })
      .map((name) => name);
    console.log(`GLYPH escape offenders=${offenders.join(',') || 'none'}`);
    expect(offenders).toEqual([]);
    // The positive control: the exact shape the scan forbids must be reported by it.
    expect(escape.test('\\u2307\n      </button>')).toBe(true);
  });

  it('reads the loop sites as well as the shelf ones', () => {
    // The two extractors above are string matches against a template: if either silently stops
    // matching, the alphabet shrinks and the clash case has fewer shapes to judge rather than more.
    // So each site names what it must find.
    expect(gestureMarks(PILL_SOURCE).map(([key]) => key)).toEqual([
      'puff',
      'lighter',
      'flick',
      'extinguish',
      'discard',
    ]);
    expect(phaseMarks(TAB_SOURCE).map(([key]) => key)).toEqual(['light', 'puff', 'tray']);
    expect(alternativeMarks(REDUCE_SOURCE).map(([key]) => key)).toEqual([
      'breathe',
      'water',
      'walk',
    ]);
    // The two shapes a player can confuse at 15px: 磕灰 on the pill and 走两步 on 减量. The machine
    // cannot judge whether they read apart, so it keeps them apart in codepoints and says which pair
    // to look at; the eye is the one that decides.
    const flick = alphabet.find((entry) => entry.where === 'pill:flick');
    const walk = alphabet.find((entry) => entry.where === 'reduction:walk');
    expect(flick?.glyph).toBe('⌁');
    expect(walk?.glyph).toBe('⌇');
    console.log(`LOOKALIKE ${flick?.glyph}(${flick?.meaning}) vs ${walk?.glyph}(${walk?.meaning})`);
  });

  it('leaves the first gesture of the loop without a mark of its own (§ S14)', () => {
    // S14 lists six: 取烟 点燃 吸入 吐烟 磕灰 掐灭. The pill defines five and lets 取烟 fall through to
    // `—`, which is the rod - not wrong, but not the sixth shape the deck drew (a finger lifting the
    // rod off the table). Written as a case so that giving it one is a decision, and so that an
    // accidental second `—` on the pill reddens the clash case rather than passing unnoticed.
    expect(gestureMarks(PILL_SOURCE).map(([key]) => key)).not.toContain('pick');
    expect(PILL_SOURCE).toContain('<template v-else>');
    const borrowed = alphabet.filter((entry) => entry.glyph === '—');
    for (const entry of borrowed) expect(entry.meaning, entry.where).toBe('a rod');
  });
});
