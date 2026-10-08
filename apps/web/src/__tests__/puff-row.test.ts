/**
 * S14's 「单口时长」 row, checked as a control and as a wiring — the way `realism-row.test.ts` reads
 * the row above it. apps/web has no component harness, so these buy "the call exists, in the branch
 * that means it, and it writes the setting it names", and nothing more. What the dial does to a draw
 * is judged in `packages/game-core/src/__tests__/puff-length.test.ts`.
 *
 * Two claims are worth pinning because they are the easy ones to lose later: the row must reach the
 * number it ships with, and **absent has to stay a real option** — a default here would override the
 * 单口吸入 column every rod was authored around, which is one of the few ways six cigarettes differ.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CIGARETTES } from '@puffly/game-content';
import { createDefaultSettings } from '@puffly/game-core';
import { COPY, type CopyKey } from '../i18n';

const SHEET = readFileSync(new URL('../components/SettingsSheet.vue', import.meta.url), 'utf8');

/** The one row that owns the draw length, sliced out of the template. */
const row = (() => {
  const start = SHEET.indexOf('data-setting="puff"');
  expect(start, 'the settings sheet lost its 单口时长 row').toBeGreaterThan(-1);
  const begin = SHEET.lastIndexOf('<div class="row">', start);
  const end = SHEET.indexOf('data-setting="puff-track"', start);
  expect(end, 'the row has no track beside its dial').toBeGreaterThan(start);
  return SHEET.slice(begin, SHEET.indexOf('</div>', end));
})();

const track = {
  min: Number(/min="([0-9.]+)"/.exec(row)?.[1]),
  max: Number(/max="([0-9.]+)"/.exec(row)?.[1]),
  step: Number(/step="([0-9.]+)"/.exec(row)?.[1]),
};

/** The number the dial lands on when the player turns it on, read out of the sheet itself. */
const picked = Number(/puffOwn\.value \? ([0-9.]+) : undefined/.exec(SHEET)?.[1]);

const classic = CIGARETTES.find((rod) => rod.unlock.kind === 'default');
const authoredMiddle =
  ((classic?.puffProfile.durationMin ?? 0) + (classic?.puffProfile.durationMax ?? 0)) / 2 / 1000;

describe('the 单口时长 row is a control and not a decoration (S14)', () => {
  it('writes the setting it claims to, and shows the one it read', () => {
    expect(row).toContain('puffDurationSec: Number(');
    expect(row).toContain(':value="settings.puffDurationSec"');
    expect(row).toContain('{{ puffSeconds }}');
    // The seconds are shown to a tenth, because the track’s finest stop is half a second.
    expect(SHEET).toContain('puffDurationSec?.toFixed(1)');
  });

  it('can actually be moved to the number it turns itself on with', () => {
    expect(track.step, 'the row is not a stepped track').toBeGreaterThan(0);
    expect(picked, 'the dial has no number to fall back on').toBeGreaterThan(0);
    expect(picked).toBeGreaterThanOrEqual(track.min);
    expect(picked).toBeLessThanOrEqual(track.max);
    expect(
      (picked - track.min) % track.step,
      `${String(picked)} is not one of the row’s stops`,
    ).toBe(0);
  });

  it('turns on at the default rod’s own middle of a draw, not at a restated number', () => {
    // S9 gives 原生 2.0 s and the rod was authored around that, so the deck’s figure and the rod’s
    // midpoint are the same number by construction. Deriving it here means the row cannot drift away
    // from the content by someone editing one file.
    expect(
      authoredMiddle,
      'the default rod’s draw window is not centred on the deck’s figure',
    ).toBe(2);
    expect(picked).toBe(authoredMiddle);
  });

  it('leaves the rod in charge by default, in the core and on the screen', () => {
    expect(
      createDefaultSettings().puffDurationSec,
      'a draw length nobody picked is a default',
    ).toBe(undefined);
    expect(row).toContain(':aria-pressed="puffOwn"');
    expect(row).toContain('v-if="!puffOwn"');
    expect(SHEET).toContain("puffOwn.value ? '—'");
  });

  it('names itself in a screen reader, in both tiers that say words', () => {
    // The row has to point at both names, not merely have them written down somewhere: a dial whose
    // label is a string in a table nobody reads is an unnamed control on the screen.
    expect(row).toContain("copy.say('a11y.puffOwn')");
    expect(row).toContain("copy.say('a11y.puffLength')");
    for (const key of ['a11y.puffOwn', 'a11y.puffLength'] as const) {
      for (const locale of ['en', 'zh-CN'] as const) {
        const value = COPY[locale]?.[key as CopyKey];
        expect(value, `${locale}:${key}`).toBeTypeOf('string');
        expect(value?.trim(), `${locale}:${key} is empty`).not.toBe('');
      }
    }
    // And the seconds are the unit both names agree on.
    const en = COPY.en?.['a11y.puffLength' as CopyKey] ?? '';
    expect(en.includes('second'), en).toBe(true);
  });

  it('keeps its label word gated so the icons tier keeps the control', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(COPY[locale]?.['settings.puff'], locale).toBeTypeOf('string');
    }
    expect(row).toContain("word('settings.puff') !== null");
  });
});
