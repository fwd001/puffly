/**
 * S10's sidebar, checked as data rather than as pixels: the screen names seven entries, and the
 * only thing a test can hold it to is that there are seven, that each one leads somewhere the app
 * really has, and that each one is wearing a word that exists in every spoken table.
 */

import { describe, expect, it } from 'vitest';
import { COPY, type CopyKey } from '../i18n';
import { RAIL_ENTRIES, entryFor } from '../rail';

describe('the desk column (S10 侧栏 7 入口)', () => {
  it('is exactly seven entries, none of them sharing a mark', () => {
    expect(RAIL_ENTRIES).toHaveLength(7);
    expect(new Set(RAIL_ENTRIES.map((entry) => entry.id)).size).toBe(7);
    // One shape means one thing across the whole interface, so a mark cannot be used twice.
    expect(new Set(RAIL_ENTRIES.map((entry) => entry.glyph)).size).toBe(7);
  });

  it('every entry leads somewhere the app has, and every sheet is reachable from the column', () => {
    expect(new Set(RAIL_ENTRIES.map((entry) => entry.sheet))).toEqual(
      new Set(['break', 'shelf', 'settings']),
    );
    for (const entry of RAIL_ENTRIES) {
      const sections: (string | null)[] =
        entry.sheet === 'shelf' ? ['rods', 'packs', 'skins', 'kit'] : ['reduction', null];
      expect(sections, entry.id).toContain(entry.section);
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
    const unique = RAIL_ENTRIES.map((entry) => entryFor(entry.sheet, entry.section)?.id);
    expect(new Set(unique).size).toBe(7);
  });
});
