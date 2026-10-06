/**
 * The rail's caption must stay one line — SPEC.md §9.2, and the user's own report.
 *
 * 「在手机上移动端烟灰缸 3 个字换行了 我感觉这个文字有点过于大了」. The fix was one notch under
 * the reading floor plus `white-space: nowrap`; this file is what stops it from coming back. What
 * can be checked without a browser is checked exactly, and what cannot is named rather than
 * estimated: text advance needs a real font and a real layout, so the Latin tier is held to its
 * shipped character count instead of to a width computed from a made-up average.
 *
 * The Chinese tier is the one place arithmetic is honest: a CJK glyph is one em wide by definition,
 * so three of them at the shipped label size is a number, not a guess.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, LOCALES } from '../i18n/copy';

const CSS = readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8');
const RAIL = readFileSync(new URL('../components/TabRail.vue', import.meta.url), 'utf8');

const RAIL_KEYS = ['tab.light', 'tab.puff', 'tab.tray', 'tab.settings'] as const;

/** The `.tab` rule, taken as one block so a declaration elsewhere cannot stand in for it. */
function tabRule(): string {
  const rule = RAIL.match(/\.tab \{([^}]*)\}/)?.[1];
  if (!rule) throw new Error('no .tab rule in TabRail.vue');
  return rule;
}

/** One tier's caption for a rail key; '' where the tier is deliberately sparse. */
function caption(locale: string, key: string): string {
  const table = COPY[locale] as Record<string, string | undefined> | undefined;
  return table?.[key] ?? '';
}

function tokenNumber(name: string): number {
  const match = CSS.match(new RegExp(`${name}:\\s*calc\\((\\d+(?:\\.\\d+)?)px`));
  if (!match?.[1]) throw new Error(`${name} is not a calc(<number>px * …)`);
  return Number(match[1]);
}

describe('the rail label stays on one line (§9.2)', () => {
  it('forbids the wrap in the rule that draws the caption', () => {
    const rule = tabRule();
    expect(rule).toContain('white-space: nowrap');
    // The size has to come from the token; a literal px here is a second source that drifts.
    expect(rule).toContain('font-size: var(--label-size)');
  });

  it('keeps the caption one notch under the reading floor', () => {
    // 15px is the floor for text a player reads. The caption is not that; at 15px, 烟灰缸 wrapped.
    expect(tokenNumber('--label-size')).toBeLessThanOrEqual(13);
  });

  it('fits three full-width characters inside the tab’s own floor', () => {
    const rule = tabRule();
    const minWidth = Number(/min-width:\s*(\d+)px/.exec(rule ?? '')?.[1] ?? 0);
    const padding = Number(/padding: 0 (\d+)px/.exec(rule ?? '')?.[1] ?? 0);
    const content = minWidth - padding * 2;
    const widestChinese = Math.max(...RAIL_KEYS.map((key) => caption('zh-CN', key).length));
    // A CJK glyph is one em, so this is arithmetic rather than an estimate — but it is arithmetic
    // about the tab's *floor*, which a flex item may grow past, not about the width a phone
    // actually gives it. It catches a fourth character; it does not and cannot catch the wrap the
    // 15px caption caused, because 3 × 15 still fits 46. That one is held by the size bound above.
    expect(widestChinese * tokenNumber('--label-size')).toBeLessThanOrEqual(content);
    expect(widestChinese).toBe(3);
  });

  it('never overflows the narrowest stage the game supports', () => {
    const rule = tabRule();
    const minWidth = Number(/min-width:\s*(\d+)px/.exec(rule ?? '')?.[1] ?? 0);
    // SPEC.md §55 names 320×568 as the smallest stage measured. Four tabs at their floor still fit.
    expect(minWidth * RAIL_KEYS.length).toBeLessThanOrEqual(320);
  });

  it('holds every tier to the labels it ships today', () => {
    expect(LOCALES).toContain('icons');
    for (const locale of ['en', 'zh-CN', 'ar'] as const) {
      for (const key of RAIL_KEYS) {
        const text = caption(locale, key);
        if (text === '') continue;
        // 'settings' is the longest thing down here in the anchor tier; growing a caption is a
        // decision, not an accident, so the count is pinned rather than left to fit.
        expect(text.length, `${locale}.${key} = ${text}`).toBeLessThanOrEqual(9);
        expect(text, `${locale}.${key} has a line break in it`).not.toMatch(/\s/);
      }
    }
  });
});
