/**
 * The 「混响」 row, checked as a control rather than as a screenshot.
 *
 * apps/web has no component harness, so this is structural on purpose — the same shape
 * `copy-tiers.test.ts` uses for the language row. What it protects is the specific way a settings
 * row rots: a button that toggles something else, a pressed state that lies about the setting, or a
 * label whose key exists in one tier only and therefore renders as nothing at all.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '@puffly/game-core';
import { COPY, type CopyKey } from '../i18n';

const SHEET = readFileSync(new URL('../components/SettingsSheet.vue', import.meta.url), 'utf8');

/** The one row that owns the room, sliced out of the template. */
const row = (() => {
  const start = SHEET.indexOf('data-setting="tail"');
  expect(start, 'the settings sheet lost its 混响 row').toBeGreaterThan(-1);
  const end = SHEET.indexOf('</button>', start);
  return SHEET.slice(start, end);
})();

describe('the reverb row is a control and not a decoration (S6)', () => {
  it('writes the setting it claims to, and shows the one it read', () => {
    expect(row).toContain('reverb: !settings.reverb');
    expect(row).toContain(':aria-pressed="settings.reverb"');
  });

  it('names itself in a screen reader, in both tiers that say words', () => {
    const say = /copy\.say\('([^']+)'\)/.exec(row)?.[1];
    expect(say, 'an unnamed control is a broken control').toBeTruthy();
    for (const locale of ['en', 'zh-CN'] as const) {
      const value = COPY[locale]?.[say as CopyKey];
      expect(value, `${locale}:${say ?? ''}`).toBeTypeOf('string');
      expect(value?.trim(), `${locale}:${say ?? ''} is empty`).not.toBe('');
    }
  });

  it('has a label word in both tiers, so the row is never a button floating alone', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(COPY[locale]?.['settings.tail'], locale).toBeTypeOf('string');
    }
    // And the label is gated the way every other row gates its words: the icons-only tier must
    // still get the button, just without a word beside it.
    expect(SHEET).toContain("word('settings.tail') !== null");
  });

  it('says the thing the deck says about the default: off', () => {
    // The row is a switch, so "off" has to be the value the app starts with — S6 writes 混响 关.
    // Read from the core's own default rather than restated here, so the two cannot drift.
    expect(createDefaultSettings().reverb).toBe(false);
  });
});
