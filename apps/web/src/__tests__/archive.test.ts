/**
 * The two redlines the archive has to keep, checked against the shipped data rather than
 * against prose: an estimate must announce itself with ≈, and a fictional rod must not be
 * given a real brand's facts.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONTENT, PACKS } from '@puffly/game-content';
import { COPY, type CopyKey } from '../i18n';

/** §dataHonesty: a range without its ≈ is a claim, not an estimate. */
const APPROXIMATIONS: readonly CopyKey[] = ['archive.range'];

describe('the archive data rules (§10, §13)', () => {
  it('every estimate in the copy table carries its ≈, in every language that says it', () => {
    for (const [locale, table] of Object.entries(COPY)) {
      for (const key of APPROXIMATIONS) {
        const value = table?.[key];
        if (value === undefined) continue;
        expect(`${locale}:${value}`, key).toContain('≈');
      }
    }
    // And the guard is not vacuous: the English and Chinese rows are both there to be read.
    expect(COPY.en?.['archive.range']).toBeTypeOf('string');
    expect(COPY['zh-CN']?.['archive.range']).toBeTypeOf('string');
  });

  it('every rod names its own category and family, because the card has nothing else to say', () => {
    for (const rod of DEFAULT_CONTENT.cigarettes) {
      expect(rod.archive.zhName, rod.id).not.toBe('');
      expect(['inhale', 'savor', 'filter']).toContain(rod.archive.kind);
      // The three tier-two cells are all arithmetic on content the rod already carries.
      expect(rod.physical.puffs.target, rod.id).toBeGreaterThan(0);
      expect(rod.physical.centerTempC[0], rod.id).toBeLessThan(rod.physical.centerTempC[1]);
    }
  });

  it('no fictional rod borrows a real brand name (§13: brands are archive data, not objects)', () => {
    const brands = [
      '中华',
      '玉溪',
      '芙蓉王',
      '黄鹤楼',
      '红塔山',
      '利群',
      '白沙',
      '南京',
      '和天下',
      '1916',
    ];
    for (const rod of DEFAULT_CONTENT.cigarettes) {
      const text = `${rod.name} ${rod.archive.zhName}`;
      for (const brand of brands) expect(text, rod.id).not.toContain(brand);
    }
  });
});
/**
 * The other half of §13: a brand is archive data, so it must not be able to leak into the loop.
 * Checked against the shipped source of the three chrome pieces and the copy table's loop keys,
 * because "we only show brands in the cabinet" is the kind of sentence that decays into a bug.
 */
describe('brands stay in the archive (§ redlines.noAdvertising)', () => {
  const brands = PACKS.filter((pack) => pack.brand !== '').map((pack) => pack.brand);

  it('the loop chrome never names a brand', () => {
    const loop = [
      'components/HudBar.vue',
      'components/CtaPill.vue',
      'components/TabRail.vue',
      'components/ArchiveCard.vue',
      'App.vue',
    ];
    for (const file of loop) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const brand of brands) expect(source, file).not.toContain(brand);
    }
  });

  it('the words the loop can show carry no brand and no price', () => {
    const keys = Object.keys(COPY.en ?? {}).filter(
      (key) =>
        key.startsWith('hint.') ||
        key.startsWith('cta.') ||
        key.startsWith('tab.') ||
        key.startsWith('state.'),
    );
    expect(keys.length).toBeGreaterThan(15);
    for (const key of keys) {
      for (const locale of ['en', 'zh-CN'] as const) {
        const value = COPY[locale]?.[key as CopyKey] ?? '';
        for (const brand of brands) expect(value, `${locale}:${key}`).not.toContain(brand);
        expect(value, `${locale}:${key}`).not.toMatch(/\u2248\s?\d/);
      }
    }
  });
});
