/**
 * The fallback chain, proven rather than asserted in prose — §9's three tiers.
 */

import { describe, expect, it } from 'vitest';
import { COPY, announce, isRtl, resolveLocale, translate } from '../index';
import { EN, type CopyKey } from '../copy';

const KEYS = Object.keys(EN) as CopyKey[];

describe('three tiers: target language → English → icons (§9)', () => {
  it('the anchor table is complete, because every key is defined against it', () => {
    for (const key of KEYS) expect(EN[key]).to.be.a('string').and.not.equal('');
  });

  it('the shipped second language covers every key, so no player sees an English orphan', () => {
    const missing = KEYS.filter((key) => typeof COPY['zh-CN']?.[key] !== 'string');
    expect(missing, `missing zh-CN: ${missing.join(', ')}`).toEqual([]);
  });

  it('a partial language falls through to English rather than to nothing', () => {
    expect(translate('ar', 'tab.settings')).toBe('الإعدادات');
    expect(translate('ar', 'tab.puff')).toBe('inhale');
    // The partial table is the point: it has to stay partial for this to mean anything.
    expect(Object.keys(COPY.ar ?? {}).length).toBeLessThan(KEYS.length);
  });

  it('the third tier is reachable, and only for what a player reads with their eyes', () => {
    expect(translate('icons', 'hint.pick')).toBeNull();
    expect(translate('icons', 'cta.puff')).toBeNull();
    expect(announce('icons', 'a11y.close')).toBe('close');
    expect(announce('icons', 'state.burning')).toBe('burning');
  });

  it('a missing key never produces an empty name for a screen reader', () => {
    expect(announce('zh-CN', 'app.name')).toBe('Puffly');
    expect(announce('zz-ZZ', 'a11y.close')).toBe('close');
  });

  it('a parameter is filled in whatever language answers', () => {
    expect(translate('en', 'a11y.smokeOption', { word: 'soft' })).toBe('smoke soft');
    expect(translate('zh-CN', 'a11y.smokeOption', { word: '稀' })).toBe('烟雾 稀');
    expect(translate('ar', 'a11y.smokeOption', { word: 'x' })).toBe('smoke x');
  });

  it('right-to-left is a property of the language, not of the tier', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he')).toBe(true);
    expect(isRtl('zh-CN')).toBe(false);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('icons')).toBe(false);
  });

  it('the core loop is spelled with icons and digits, never a quantifier', () => {
    // §9.2: the stage and its chrome are icons and Arabic digits, so a key that appears there
    // with a 中文量词 in it is the mistake this guards against. The sheets may speak.
    const quantifiers = ['支', '口', '根', '次'];
    const inLoop = KEYS.filter(
      (key) =>
        key.startsWith('hint.') ||
        key.startsWith('cta.') ||
        key.startsWith('tab.') ||
        key.startsWith('state.'),
    );
    expect(inLoop.length).toBeGreaterThan(10);
    for (const key of inLoop) {
      const chinese = COPY['zh-CN']?.[key] ?? '';
      for (const unit of quantifiers) {
        expect(chinese, `${key} = "${chinese}" uses the quantifier ${unit}`).not.toContain(unit);
      }
    }
    // Where a quantifier may live: the sheets a player reads a count in (the 图鉴, the 档案, the
    // day's own numbers), a sheet that is allowed to speak in full sentences (settings), and the
    // spoken names no eye ever reads (a11y). §9.2 binds the stage and its three chrome pieces.
    const outside = /^(a11y|archive|shelf|reduction|settings)\./;
    const carrying = KEYS.filter((key) => {
      const chinese = COPY['zh-CN']?.[key] ?? '';
      return quantifiers.some((unit) => chinese.includes(unit));
    });
    expect(carrying.length).toBeGreaterThan(0);
    const inTheLoop = carrying.filter((key) => !outside.test(key));
    expect(inTheLoop, `量词 inside the core loop: ${inTheLoop.join(', ')}`).toEqual([]);
  });
});

/** §9's first tier is a question about the device, not about the table. */
describe('which language a player ends up with', () => {
  it('an explicit choice wins over the device, including the wordless tier', () => {
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN');
    expect(resolveLocale('icons', ['zh-CN'])).toBe('icons');
  });

  it('an absent or undecided choice follows the device, exactly first and then by family', () => {
    expect(resolveLocale(undefined, ['en-US'])).toBe('en');
    expect(resolveLocale(undefined, ['zh-Hans-CN', 'en'])).toBe('zh-CN');
    expect(resolveLocale('auto', ['fr-FR', 'ar-EG'])).toBe('ar');
  });

  it('a device the table has no words for falls to the anchor, never to a blank', () => {
    expect(resolveLocale(undefined, [])).toBe('en');
    expect(resolveLocale('th-TH', ['th-TH'])).toBe('en');
    // The anchor is a language with a complete table, not the tier that says nothing.
    expect(announce(resolveLocale(undefined, ['de-DE']), 'tab.puff')).toBe('inhale');
  });
});
