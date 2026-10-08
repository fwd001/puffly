/**
 * The 休息 row, which is the one place the player sets how long a break is meant to run.
 *
 * Structural, the way `realism-row.test.ts` reads its row: apps/web has no component harness, so
 * these checks buy "the track, the number it shows and the setting it writes are counted in the same
 * unit", and nothing more. That is not a hypothetical here — the row's slider was authored in one
 * unit and its value read in another, which left the shipped default below the track's own minimum:
 * a player touching the row could only ever jump to a break ten times the length they were shown.
 *
 * The unit is pinned to the content rather than restated: the row's default is the middle of the
 * default rod's own burn, so the two can never drift apart by someone editing one file.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CIGARETTES } from '@puffly/game-content';
import { createDefaultSettings } from '@puffly/game-core';
import { COPY, type CopyKey } from '../i18n';

const SHEET = readFileSync(new URL('../components/SettingsSheet.vue', import.meta.url), 'utf8');

/** The one row that owns the break's length, sliced out of the template. */
const row = (() => {
  const start = SHEET.indexOf("copy.say('a11y.breakLength')");
  expect(start, 'the settings sheet lost its 休息 row').toBeGreaterThan(-1);
  const begin = SHEET.lastIndexOf('<div class="row">', start);
  return SHEET.slice(begin, SHEET.indexOf('</div>', start));
})();

/**
 * The divisor the row itself uses to turn `sessionTargetMs` into the number it shows. Read rather
 * than assumed: the point of this file is that the track, the digits and the words beside them are
 * counted in one unit, and a rule that only accepts `60000` would report a row that switched to
 * seconds as a file that failed to run instead of as the named case it is.
 */
const DIVISOR = (() => {
  const match = /settings\.sessionTargetMs \/ ([0-9_]+)/.exec(SHEET);
  expect(match, 'the row neither divides the break length nor writes it').not.toBeNull();
  return Number((match?.[1] ?? '').replace('_', ''));
})();

const bounds = {
  min: Number(/min="(\d+)"/.exec(row)?.[1]),
  max: Number(/max="(\d+)"/.exec(row)?.[1]),
  step: Number(/step="(\d+)"/.exec(row)?.[1]),
};

const defaultMinutes = createDefaultSettings().sessionTargetMs / DIVISOR;

describe('the 休息 row counts in one unit (S14)', () => {
  it('lets the track reach the length the game ships with', () => {
    expect(bounds.step, 'the row is not a stepped track').toBeGreaterThan(0);
    expect(defaultMinutes).toBeGreaterThanOrEqual(bounds.min);
    expect(defaultMinutes).toBeLessThanOrEqual(bounds.max);
    expect(
      defaultMinutes % bounds.step,
      `${String(defaultMinutes)} is not one of the row's stops`,
    ).toBe(0);
  });

  it('shows the same number the track is measured in', () => {
    // The digits beside the slider and the value fed into it must come from the same arithmetic, or
    // the row displays one length while selecting another.
    expect(row).toContain(`:value="settings.sessionTargetMs / ${DIVISOR}"`);
    expect(row).toContain(`{{ Math.round(settings.sessionTargetMs / ${DIVISOR}) }}`);
    expect(row).toContain('class="digits"');
  });

  it('promises the unit its own number is in', () => {
    // The screen-reader name says which unit the digits are in; if the divisor stops being a minute,
    // that sentence becomes a lie in both tiers that say words.
    for (const locale of ['en', 'zh-CN'] as const) {
      const say = COPY[locale]?.['a11y.breakLength' as CopyKey];
      expect(say, `${locale}:a11y.breakLength`).toBeTypeOf('string');
      expect(say?.includes(locale === 'en' ? 'minute' : '分钟'), `${locale}: ${String(say)}`).toBe(
        true,
      );
    }
    expect(DIVISOR).toBe(60_000);
  });

  it('defaults to the break the default rod actually takes', () => {
    const classic = CIGARETTES.find((rod) => rod.unlock.kind === 'default');
    expect(classic, 'no rod is the default one').toBeTruthy();
    const middle = ((classic?.burnDuration.min ?? 0) + (classic?.burnDuration.max ?? 0)) / 2;
    expect(createDefaultSettings().sessionTargetMs).toBe(middle);
  });
});
