/**
 * The two redlines the archive has to keep, checked against the shipped data rather than
 * against prose: an estimate must announce itself with ≈, and a fictional rod must not be
 * given a real brand's facts.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
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
