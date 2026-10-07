/**
 * The three shapes the deck names for the hand (S6: 点火 短促 / 吸入 渐强 / 烟灰 细碎), judged as
 * patterns rather than as a buzz.
 *
 * `navigator.vibrate` has no amplitude — durations and counts are the only levers — so "three shapes
 * that feel different" has to mean three *different patterns*, and "a slider for how hard" has to
 * mean the pattern changes in a stated direction. Both are arithmetic, which is why this is a pure
 * module with a pure test instead of a screenshot of a phone.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SessionEventType } from '@puffly/game-core';
import { SWELL_RUNGS, hapticPattern, shapeForEvent, swellRung } from '../haptics';
import type { HapticShape } from '../haptics';
import { COPY } from '../i18n';
import { shellSource } from './sourceProbe';

const SHAPES: readonly HapticShape[] = ['spark', 'swell', 'grit', 'thud', 'settle'];
const TOTAL = (pattern: number[] | null): number => pattern?.reduce((a, b) => a + b, 0) ?? 0;

describe('three beats, three shapes (S6)', () => {
  it('never hands two of them the same pattern', () => {
    // Compared at one level, because `level` means the draw's depth for 渐强 and the column's height
    // for 细碎 — for the other three shapes it is not an input at all, and asking them to differ from
    // themselves across levels would be a claim about nothing.
    for (const level of [0.5, 1]) {
      const seen = new Map<string, string>();
      for (const shape of SHAPES) {
        const pattern = hapticPattern(shape, 0.7, level);
        expect(pattern, shape).not.toBeNull();
        const signature = pattern?.join(',');
        for (const [other, otherSignature] of seen) {
          expect(signature, `${shape}@${String(level)} matches ${other}`).not.toBe(otherSignature);
        }
        seen.set(shape, signature ?? '');
      }
      expect(seen.size).toBe(SHAPES.length);
    }
  });

  it('点火 is the short one and 掐灭 is the heavy one', () => {
    // The deck's own ordering: 短促 for the catch, 触觉重击 for pressing the rod out.
    const spark = hapticPattern('spark', 0.7)?.[0] ?? 0;
    const thud = hapticPattern('thud', 0.7)?.[0] ?? 0;
    expect(spark).toBeGreaterThan(0);
    expect(thud).toBeGreaterThan(spark * 2);
    expect(hapticPattern('spark', 0.7)?.length).toBe(1);
  });

  it('吸入 really does grow, step by step, and never more than four steps', () => {
    const lengths: number[] = [];
    for (let rung = 1; rung <= SWELL_RUNGS; rung += 1) {
      const pattern = hapticPattern('swell', 0.7, rung / SWELL_RUNGS);
      expect(pattern?.length, `rung ${String(rung)}`).toBe(1);
      lengths.push(pattern?.[0] ?? 0);
    }
    console.log(`HAPTIC swell rungs=${lengths.join(',')}`);
    for (let i = 1; i < lengths.length; i += 1) {
      expect(lengths[i] ?? 0, `rung ${String(i + 1)} is not longer`).toBeGreaterThan(
        lengths[i - 1] ?? 0,
      );
    }
    // A rung is what the frame loop compares, so the whole draw has to fit in four of them: a
    // tremulous thumb would otherwise fire a dozen pulses.
    expect(swellRung(0)).toBe(0);
    expect(swellRung(0.01)).toBe(1);
    expect(swellRung(1)).toBe(SWELL_RUNGS);
    expect(swellRung(1.7)).toBe(SWELL_RUNGS);
    expect(swellRung(Number.NaN)).toBe(0);
  });

  it('烟灰 is four to six grains, the deck’s own count', () => {
    for (const column of [0, 0.4, 0.8, 1]) {
      const pattern = hapticPattern('grit', 0.7, column);
      expect(pattern, `column ${String(column)}`).not.toBeNull();
      const pulses = pattern ? (pattern.length + 1) / 2 : 0;
      expect(pulses, `grains at column ${String(column)}`).toBeGreaterThanOrEqual(4);
      expect(pulses).toBeLessThanOrEqual(6);
      // …and a taller column is the same gesture with more in it.
      if (column > 0) {
        const fewer = hapticPattern('grit', 0.7, 0);
        expect(pulses).toBeGreaterThanOrEqual(fewer ? (fewer.length + 1) / 2 : 0);
      }
    }
  });

  it('the slider changes how the pattern feels, in the direction it claims', () => {
    // No amplitude, so the rule is written down once, in `haptics.ts`: every **contact** gets longer
    // with strength, and every **gap** gets shorter. That is what makes a hard 细碎 read as fine
    // rather than as slow — and it means a grain pattern's total can go down while it still feels
    // sharper, so the total claim belongs to the shapes that are mostly contact.
    for (const shape of SHAPES) {
      const soft = hapticPattern(shape, 0.2, 0.5) ?? [];
      const hard = hapticPattern(shape, 1, 0.5) ?? [];
      expect(hard.length, shape).toBe(soft.length);
      for (let i = 0; i < soft.length; i += 1) {
        if (i % 2 === 0) {
          expect(hard[i] ?? 0, `${shape} contact ${String(i)}`).toBeGreaterThanOrEqual(
            soft[i] ?? 0,
          );
        } else {
          expect(hard[i] ?? 99, `${shape} gap ${String(i)}`).toBeLessThanOrEqual(soft[i] ?? 0);
        }
      }
    }
    for (const shape of ['spark', 'swell', 'thud', 'settle'] as const) {
      const soft = hapticPattern(shape, 0.2, 0.5);
      const hard = hapticPattern(shape, 1, 0.5);
      expect(TOTAL(hard), `${shape} total`).toBeGreaterThan(TOTAL(soft));
    }
    // …and 细碎 really is the tight one at the top of the slider.
    const fine = hapticPattern('grit', 1, 0.5) ?? [];
    const loose = hapticPattern('grit', 0.2, 0.5) ?? [];
    expect(fine[0] ?? 0).toBeGreaterThan(loose[0] ?? 0);
    expect(fine[1] ?? 99).toBeLessThan(loose[1] ?? 0);
    expect(TOTAL(fine)).toBeLessThan(TOTAL(loose));
  });

  it('off is nothing at all, for every shape', () => {
    for (const shape of SHAPES) {
      expect(hapticPattern(shape, 0, 1), shape).toBeNull();
    }
    // And the two values a slider can hold at either end still behave.
    expect(hapticPattern('spark', -1)).toBeNull();
    expect(hapticPattern('spark', Number.NaN)).toBeNull();
    expect(hapticPattern('spark', 9)).not.toBeNull();
  });

  it('never sends a zero-length pulse, which the browser would refuse whole', () => {
    for (const shape of SHAPES) {
      for (const strength of [0.01, 0.05, 0.5, 1]) {
        for (const level of [0, 0.5, 1]) {
          const pattern = hapticPattern(shape, strength, level) ?? [];
          for (const duration of pattern) {
            expect(Number.isInteger(duration), `${shape} ${String(duration)}`).toBe(true);
            expect(duration).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('the three shape words are in both tiers that say words', () => {
    for (const locale of ['en', 'zh-CN'] as const) {
      for (const key of [
        'settings.haptic.spark',
        'settings.haptic.swell',
        'settings.haptic.grit',
      ]) {
        const value = COPY[locale]?.[key as keyof (typeof COPY)['en']];
        expect(`${locale}:${key}`, value).toBeTypeOf('string');
        expect(value?.trim(), `${locale}:${key} is empty`).not.toBe('');
      }
    }
  });

  it('the sheet drives the level, and the old on/off button is really gone', () => {
    // Structural, because apps/web has no component harness: what this catches is the row quietly
    // going back to a toggle (which would throw away the two middle values) or to writing a boolean
    // into a numeric setting.
    const sheet = readFileSync(new URL('../components/SettingsSheet.vue', import.meta.url), 'utf8');
    const start = sheet.indexOf(':aria-label="copy.say(\'a11y.haptics\')"');
    expect(start, 'the haptics row left the sheet').toBeGreaterThan(-1);
    const row = sheet.slice(sheet.lastIndexOf('<input', start), sheet.indexOf('/>', start) + 2);
    expect(row).toContain('type="range"');
    expect(row).toContain('haptics: Number');
    expect(row).toContain(':value="Math.round(settings.haptics * 100)"');
    expect(sheet).not.toContain('haptics: !settings.haptics');
    expect(sheet).toContain('data-hook="haptic-shapes"');
  });
});

describe('which beat says which shape', () => {
  it('maps the four event beats and nothing else', () => {
    const mapped: string[] = [];
    for (const type of Object.values(SessionEventType)) {
      const shape = shapeForEvent(type);
      if (shape !== null) mapped.push(`${type}=${shape}`);
    }
    console.log(`HAPTIC events=${mapped.join(' ')}`);
    expect(mapped.sort()).toEqual(
      ['ASH=grit', 'ASH_FALL=grit', 'DISCARD=settle', 'EXTINGUISH=thud', 'LIGHT=spark'].sort(),
    );
  });

  it('reaches every shape, and leaves 渐强 to the frame loop', () => {
    const produced = new Set<HapticShape | null>();
    for (const type of Object.values(SessionEventType)) produced.add(shapeForEvent(type));
    for (const shape of SHAPES) {
      // The crescendo is the one shape that is a climb rather than a happening: firing it on the
      // release as well would put a fifth pulse on a four-step draw.
      if (shape === 'swell') {
        expect(produced.has('swell'), 'swell came from an event').toBe(false);
        continue;
      }
      expect(produced.has(shape), `${shape} is unreachable from any event`).toBe(true);
    }
  });

  it('has exactly one hand that touches the motor, and one that reads the table', () => {
    // The floor a structural check has: it reddens when the wiring leaves the shell, not when the
    // pattern it sends is wrong — that part is judged above, on the table itself.
    const source = shellSource();
    expect(source.match(/navigator\.vibrate\(/g) ?? []).toHaveLength(1);
    expect(source.match(/hapticPattern\(/g) ?? []).toHaveLength(1);
    expect(source.match(/shapeForEvent\(/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/rung > lastSwellRung\) feel\('swell'/);
  });
});
