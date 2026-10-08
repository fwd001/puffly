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

/**
 * The two gram figures on this screen, and why they are two.
 *
 * 2026-10-08 拍板 ② moved the deck's S5 reading (灰柱环 + 9mm + 2.1g) onto the tray's own mass, while
 * the desk row keeps the stick's output. One screen, two subjects, two fields, two names — which is
 * exactly the class of thing that silently collapses back into one number. Structural for the usual
 * reason (apps/web has no component harness): these read the wiring, not the rendered text.
 */
function trayCase(): string {
  const start = HUD.indexOf("case 'tray':");
  expect(start, 'HudBar lost the tray reading').toBeGreaterThan(-1);
  const end = HUD.indexOf('default:', start);
  expect(end, 'the tray case runs to the end of the switch').toBeGreaterThan(start);
  return HUD.slice(start, end);
}

describe('the 克 on this screen says two different things (S5, 拍板 ②)', () => {
  it('the ashtray cell reads the tray, and names it as the tray', () => {
    const body = trayCase();
    // The deck pairs a millimetre column with a gram tray on one screen; both have to be there, and
    // the gram one is the tray's accumulation, not the stick's output.
    expect(body).toContain('rod.readouts.ashMm');
    expect(body).toContain('state.ashtray.grams');
    expect(body).toContain("'a11y.hud.trayMass'");
    // A real stick's column is hundredths of a gram, so the reading keeps two decimals — one place.
    expect(body).toMatch(/Math\.round\(state\.ashtray\.grams \* 100\) \/ 100/);
    expect(body, 'the stick figure must not also live in the tray cell').not.toContain(
      'readouts.ashGrams',
    );
  });

  it('the desk figure reads the stick, and is not re-rounded here', () => {
    const desk = deskBody();
    expect(desk).toContain("key: 'a11y.hud.ashMass'");
    expect(desk).toContain('value: `${rod.readouts.ashGrams}g`');
    // Core rounds the rod's figure once (§26: derived once, formatted everywhere); a second rounding
    // here would be a second owner of the same number.
    const ashRow = desk.slice(desk.indexOf("key: 'a11y.hud.ashMass'"));
    expect(ashRow.slice(0, 120), 'the desk re-rounds the stick figure').not.toContain('Math.round');
  });

  it('the two names are two names, in both languages that say words', () => {
    const stick = COPY['en']?.['a11y.hud.ashMass' as CopyKey];
    const tray = COPY['en']?.['a11y.hud.trayMass' as CopyKey];
    const stickZh = COPY['zh-CN']?.['a11y.hud.ashMass' as CopyKey];
    const trayZh = COPY['zh-CN']?.['a11y.hud.trayMass' as CopyKey];
    expect([stick, tray, stickZh, trayZh].every((word) => typeof word === 'string')).toBe(true);
    expect(stick).not.toBe(tray);
    expect(stickZh).not.toBe(trayZh);
    // And each names its own subject, so neither row can be read as the other's number.
    expect(trayZh).toContain('缸');
    expect(stickZh).toContain('这一支');
  });
});
