/**
 * S20's stance, checked against the strings that ship rather than against prose: the reduction
 * page states the player's own counts and nothing else. No health claim, no threat, no penalty,
 * no fourth piece of advice (§ redlines.noAntiSmokingPressure, §10).
 */

import { describe, expect, it } from 'vitest';
import { COPY, translate } from '../i18n';
import { EN, type CopyKey } from '../i18n/copy';

const KEYS = Object.keys(EN) as CopyKey[];

/** Every word on the page the player reads when they are not smoking. */
const REDUCTION_KEYS = KEYS.filter(
  (key) =>
    key.startsWith('reduction.') || key.startsWith('a11y.reduction.') || key === 'settings.limit',
);

/** The lines a spoken locale actually shows for one key, in the locale the player would see them in. */
function linesFor(key: CopyKey): string[] {
  const out: string[] = [];
  for (const locale of Object.keys(COPY)) {
    const value = translate(locale, key);
    if (value !== null) out.push(`${locale} · ${key} → ${value}`);
  }
  return out;
}

/** The same lines with the locale tag stripped, so a scan reads only what a player reads. */
function valuesFor(key: CopyKey): string[] {
  return linesFor(key).map((line) => line.slice(line.indexOf('→') + 2).toLowerCase());
}

/**
 * Two families, both from the brief: an assertion about smoking and health, and a lever that
 * punishes or locks. The page is allowed to say "fewer" and "more" about the player's own week.
 */
const FORBIDDEN = [
  '健康',
  '肺',
  '癌',
  '疾病',
  '医生',
  '戒烟',
  '戒断',
  '危害',
  '好处',
  '改善',
  '风险',
  'health',
  'lung',
  'cancer',
  'disease',
  'doctor',
  'quit',
  'withdraw',
  'damage',
  'benefit',
  'risk',
  '惩罚',
  '处罚',
  '清零',
  '断签',
  '锁死',
  '锁定',
  '禁止',
  'penalty',
  'punish',
  'lock',
  'streak',
  'forbid',
];

/** The pressure verbs: this page may describe a count, it may not tell anyone what to do. */
const IMPERATIVE = /\b(should|must|have to|need to)\b/;

describe('the reduction page says nothing but the player log (S20, §10)', () => {
  it('the guard has strings to read, in both the anchor and the target language', () => {
    expect(REDUCTION_KEYS.length).toBeGreaterThan(8);
    for (const key of REDUCTION_KEYS) {
      expect(typeof COPY.en?.[key], key).toBe('string');
      expect(typeof COPY['zh-CN']?.[key], key).toBe('string');
    }
  });

  it('no line on the page asserts anything about health, and none threatens a penalty', () => {
    for (const key of REDUCTION_KEYS) {
      for (const value of valuesFor(key)) {
        for (const word of FORBIDDEN) {
          expect(value, `${key} → ${value}`).not.toContain(word);
        }
        expect(value, key).not.toMatch(IMPERATIVE);
      }
    }
  });

  it('the word list bites, so the pass above is not an empty scan', () => {
    const planted = '戒烟有益健康，肺的风险降低，否则连续记录清零';
    const hits = FORBIDDEN.filter((word) => planted.includes(word));
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(IMPERATIVE.test('you should quit to protect your health')).toBe(true);
    // And it does not bite on the page's own vocabulary, which says "more" and "fewer".
    for (const key of REDUCTION_KEYS) {
      for (const value of valuesFor(key)) {
        expect(IMPERATIVE.test(value), `${key} → ${value}`).toBe(false);
      }
    }
  });

  it('the delta line only ever subtracts the player from the player', () => {
    for (const key of ['reduction.deltaMore', 'reduction.deltaFewer'] as CopyKey[]) {
      const lines = linesFor(key);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line, key).toContain('{count}');
        expect(line, key).toMatch(/week|周/);
      }
    }
  });

  it('the alternatives stay the three the design names, so a fourth lecture cannot appear', () => {
    const alternatives = KEYS.filter((key) => key.startsWith('reduction.alt.'));
    expect(alternatives.sort()).toEqual([
      'reduction.alt.breathe',
      'reduction.alt.walk',
      'reduction.alt.water',
    ]);
  });
});
