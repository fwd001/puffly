/**
 * S10's sidebar, checked as data rather than as pixels: the screen names the entries it names, and
 * the only thing a test can hold it to is that the list is the list, that each one leads somewhere
 * the app really has, and that each one is wearing a word that exists in every spoken table.
 *
 * The entries are asserted as an id list rather than as a count repeated four times: the count was
 * wrong the first week (seven, then the deck's 统计 arrived), and a number that has to be edited in
 * several places is a number that gets edited in one of them.
 */

import { describe, expect, it } from 'vitest';
import { COPY, type CopyKey } from '../i18n';
import { RAIL_ENTRIES, entryFor } from '../rail';

/** S10's seven plus S11's 统计, in the order the column prints them. */
const IDS: readonly string[] = [
  'break',
  'ladder',
  'boxes',
  'skins',
  'kit',
  'stats',
  'reduction',
  'settings',
];

/** Which sheet each destination opens, and which sections that sheet actually has. */
const SECTIONS: Readonly<Record<string, (string | null)[]>> = {
  break: [null, 'stats', 'reduction'],
  shelf: ['rods', 'packs', 'skins', 'kit'],
  settings: [null],
};

describe('the desk column (S10 侧栏, S11 统计)', () => {
  it('is the eight entries the design lists, none of them sharing a mark', () => {
    expect(RAIL_ENTRIES.map((entry) => entry.id)).toEqual(IDS);
    // One shape means one thing across the whole interface, so a mark cannot be used twice.
    expect(new Set(RAIL_ENTRIES.map((entry) => entry.glyph)).size).toBe(IDS.length);
  });

  it('every entry leads somewhere the app has, and every sheet is reachable from the column', () => {
    expect(new Set(RAIL_ENTRIES.map((entry) => entry.sheet))).toEqual(
      new Set(['break', 'shelf', 'settings']),
    );
    for (const entry of RAIL_ENTRIES) {
      const allowed = SECTIONS[entry.sheet];
      expect(allowed, `${entry.id} opens ${entry.sheet}`).toBeDefined();
      expect(allowed, `${entry.id} lands on a section ${entry.sheet} does not have`).toContain(
        entry.section,
      );
    }
  });

  it('wears a word that exists in the anchor and in the shipped second language', () => {
    for (const entry of RAIL_ENTRIES) {
      expect(typeof COPY['en']?.[entry.key], entry.id).toBe('string');
      expect(typeof COPY['zh-CN']?.[entry.key as CopyKey], entry.id).toBe('string');
    }
  });

  it('has exactly one entry current for a given sheet, and none while a sheet is closed', () => {
    expect(entryFor('none', null)).toBeUndefined();
    expect(entryFor('shelf', null)).toBeUndefined();
    expect(entryFor('shelf', 'skins')?.id).toBe('skins');
    expect(entryFor('settings', null)?.id).toBe('settings');
    // The two break-sheet entries have to be told apart, or 统计 and 减量 light up together.
    expect(entryFor('break', null)?.id).toBe('break');
    expect(entryFor('break', 'stats')?.id).toBe('stats');
    expect(entryFor('break', 'reduction')?.id).toBe('reduction');
    const unique = RAIL_ENTRIES.map((entry) => entryFor(entry.sheet, entry.section)?.id);
    expect(new Set(unique).size).toBe(IDS.length);
  });
});
