/**
 * The three tiers, checked as a set rather than as prose.
 *
 * §9's rule is target language → English → icons only, and the fallback is what makes a missing
 * string invisible: the word simply appears in English, in an app whose whole point is that it can
 * be read with no words at all. The copy table's own header claims `zh-CN` is complete; a claim in
 * a comment is not a check.
 *
 * The one that would hurt most is the placeholders. `{n}` is how a number gets into a sentence, and
 * a translation that drops or renames one does not look wrong while writing it — it renders as a
 * literal `{n}` on the card, or loses the number entirely.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, coverageOf, TIER_TOTAL } from '../i18n';

/** English is the anchor: the tier every other one is checked against. */
const EN = COPY.en ?? {};
const EN_KEYS = Object.keys(EN).sort();
const SHEET = readFileSync(new URL('../components/SettingsSheet.vue', import.meta.url), 'utf8');

const tokens = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');

describe('the copy tiers hold together (§9)', () => {
  it('carries every English key into the target language', () => {
    const zh = COPY['zh-CN'] as Record<string, string | undefined>;
    const missing = EN_KEYS.filter((key) => !zh[key]?.trim());
    expect(missing).toEqual([]);
  });

  it('keeps every placeholder the sentence needs', () => {
    const broken: string[] = [];
    for (const [tier, table] of Object.entries(COPY)) {
      for (const [key, english] of Object.entries(EN)) {
        const text = (table as Record<string, string | undefined>)[key];
        if (text === undefined) continue;
        const wanted = [...new Set(tokens(english))].sort();
        const got = [...new Set(tokens(text))].sort();
        if (wanted.join() !== got.join()) broken.push(`${tier}.${key}: ${got} vs ${wanted}`);
      }
    }
    console.log(`COPY_TOKENS checked=${String(EN_KEYS.length)} broken=${String(broken.length)}`);
    expect(broken).toEqual([]);
  });

  it('has no key that exists only in a translation', () => {
    // A key missing from the anchor cannot be looked up, so its translation is dead text.
    const extras: string[] = [];
    for (const [tier, table] of Object.entries(COPY)) {
      for (const key of Object.keys(table)) {
        if (!(key in EN)) extras.push(`${tier}.${key}`);
      }
    }
    expect(extras).toEqual([]);
  });

  it('names the one tier offered before it is finished', () => {
    // A language button spells its name in its own script — العربية reads as a promise — while §9
    // lets a partial table fall back to English. The fallback is the design; the unlabelled endonym
    // is not, so the row carries the tier's own count.
    const partial = Object.keys(COPY).filter((tier) => coverageOf(tier) !== null);
    expect(partial).toEqual(['ar']);
    expect(coverageOf('ar')).toBe(`4 / ${String(TIER_TOTAL)}`);
    console.log(`COPY_AR ${coverageOf('ar') ?? 'complete'}`);
  });

  it('calls a finished tier finished, and a non-language no tier at all', () => {
    expect(coverageOf('en')).toBeNull();
    expect(coverageOf('zh-CN')).toBeNull();
    // `icons` is a tier with no table of its own; it must not render as a language at 0 %.
    expect(coverageOf('icons')).toBeNull();
  });

  it('renders that answer in the language row, not somewhere else', () => {
    // Structural on purpose: mounting the sheet needs a whole `Puffly` object and this repo has no
    // component harness yet. What this does catch is the rule quietly leaving the row it belongs to.
    expect(SHEET).toContain('coverageOf(choice.code)');
    expect(SHEET).toContain('class="part"');
  });
});
