/**
 * S11's desk row: five figures standing at once on a width that has room for them.
 *
 * Structural for the usual reason (no component harness), and lazy on purpose: the last file added
 * here asserted at module scope, so a broken block turned into a file that could not be collected
 * and the run printed `no tests` instead of the fault.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, type CopyKey } from '../i18n';

const HUD = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');

/** The body of the `desk` computed. */
function deskBody(): string {
  const start = HUD.indexOf('const desk = computed');
  expect(start, 'HudBar lost the desk row').toBeGreaterThan(-1);
  const end = HUD.indexOf('</script>', start);
  return HUD.slice(start, end);
}

/** The `{ … }` that starts after `selector`, matched by braces rather than by a guessed length. */
function cssBlock(selector: string): string {
  const at = HUD.indexOf(selector);
  expect(at, `HudBar no longer has ${selector}`).toBeGreaterThan(-1);
  const open = HUD.indexOf('{', at);
  let depth = 0;
  for (let index = open; index < HUD.length; index += 1) {
    if (HUD[index] === '{') depth += 1;
    else if (HUD[index] === '}' && --depth === 0) return HUD.slice(open, index + 1);
  }
  throw new Error('unbalanced braces');
}

describe('the desk HUD keeps all five (S11)', () => {
  it('lists them in the deck’s own order, each named for a screen reader', () => {
    const keys = [...deskBody().matchAll(/key: '(a11y\.hud\.[a-zA-Z]+)'/g)].map((m) => m[1] ?? '');
    expect(keys).toEqual([
      'a11y.hud.clock',
      'a11y.hud.puffs',
      'a11y.hud.remaining',
      'a11y.hud.ashMass',
      'a11y.hud.category',
    ]);
    for (const key of keys) {
      expect(COPY['en']?.[key as CopyKey], key).toBeTypeOf('string');
      expect(COPY['zh-CN']?.[key as CopyKey], key).toBeTypeOf('string');
    }
  });

  it('prints only numbers the simulation already measures', () => {
    const values = [...deskBody().matchAll(/value: ([^,\n]+),/g)].map((m) => (m[1] ?? '').trim());
    expect(values.length).toBeGreaterThanOrEqual(5);
    const fromState =
      /^(summary\.value\.clock|rod\.puff\.count|rod\.readouts\.[a-zA-Z]+|Math\.round\(rod\.rodRemaining \* 100\)|`[^`]*\$\{[^`]*`|name|facts\.name)$/;
    for (const value of values) {
      expect(value, `${value} is not the simulation's own number`).toMatch(fromState);
    }
    // No literal digit: `03:12` in the deck is a reading, not a string to ship.
    for (const value of values) expect(value).not.toMatch(/^\d/);
  });

  it('the rod’s name is the one word, and it goes with the hint words', () => {
    const body = deskBody();
    expect(body).toContain('settings.value.hints');
    // A word is not a number: the row that carries it is a label, not another button into the sheet.
    expect(body).toMatch(/key: 'a11y\.hud\.category', value: name, press: false/);
  });

  it('hides the phone pair at the desk width, so nothing is said twice', () => {
    const media = cssBlock('@media (min-width: 860px)');
    expect(media).toContain('.desk');
    expect(media).toContain('display: flex');
    expect(media).toContain('.hud > .num');
    expect(media).toMatch(/\.hud > \.num \{\s*display: none;/);
    // And the row itself is gone below the breakpoint, in the layout and for a reader alike.
    expect(HUD).toMatch(/\.desk \{\s*display: none;/);
  });

  it('each figure is a way into the break, and none is dead text', () => {
    const start = HUD.indexOf('data-hook="hud-desk"');
    expect(start, 'the desk row is not in the template').toBeGreaterThan(-1);
    const markup = HUD.slice(start, HUD.indexOf('</div>', start));
    expect(markup).toContain('@click="emit(\'break\')"');
    expect(markup).toContain(':aria-label="copy.say(row.key)"');
    expect(markup.match(/<button/g) ?? []).toHaveLength(1);
  });
});
