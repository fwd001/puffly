/**
 * 「还没有」 has to be a colour, never a dim (S15 图鉴, S19 白字对深底按 AA).
 *
 * The shell used to say "not yet" by putting `opacity` on the whole cell. Measured against the floor
 * the sheet paints, that took a room's name and its 差几支 digit from 16.99 down to **4.02**, and an
 * achievement row from 11.59 to **1.98** — and a locked cell is a focusable button with `aria-pressed`,
 * so WCAG's exemption for inactive components does not reach it. The number was nobody's judgement
 * call, which is the whole problem: `text-contrast.test.ts` could only judge colours it could see, and
 * an opacity is not a colour.
 *
 * So this file keeps the two halves apart: a locked look may dim **decoration** (a colour chip, the
 * palette bars), and where a cell carries words or digits it goes to a declared colour instead — one
 * that the contrast guard can actually measure.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** What a visible word or digit looks like in this shell's markup. */
const TEXT_IN_CELL = /\{\{|\bclass="[^"]*\b(?:name|rung|digits|count|label|kind|value)\b/;

/** Decoration only — these carry no letters, so dimming them cannot cost anybody a word. */
const DECORATION = /(?:^|\s)\.(chip|layers)(?![\w-])/;

/**
 * The markup of one cell: from the tag wearing `class="… <cls> …"` to the element that closes it.
 *
 * Buttons and rows are what the locked look is put on, and neither nests, so the first closing tag of
 * the same kind is the right end. Returns '' when the class is not in the template at all, which the
 * caller treats as "I do not know this cell" rather than as a pass.
 */
function cellMarkup(source: string, cls: string): string {
  const pattern = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`);
  const match = pattern.exec(source);
  if (match === null) return '';
  const open = source.lastIndexOf('<', match.index);
  const tag = /^<\/?([a-z0-9-]+)/i.exec(source.slice(open))?.[1] ?? 'div';
  const end = source.indexOf(`</${tag}>`, match.index);
  return source.slice(open, end < 0 ? undefined : end + tag.length + 3);
}

/** Every rule that dims a locked/not-yet selector, as `[selector, body]`, style blocks only. */
function dims(source: string): [string, string][] {
  const style = source.slice(source.indexOf('<style'));
  const found: [string, string][] = [];
  for (const match of style.matchAll(/([^\n{}]+)\{([^{}]*)\}/g)) {
    const selector = String(match[1]).trim();
    const body = String(match[2]);
    if (/\[data-(?:locked|reached)/.test(selector) && /\bopacity:/.test(body)) {
      found.push([selector, body]);
    }
  }
  return found;
}

const COMPONENTS = ['CollectionSheet.vue', 'SessionSheet.vue'] as const;

describe('a locked look dims the chip, never the words (S15, S19)', () => {
  for (const file of COMPONENTS) {
    it(`${file} dims nothing that carries words or digits`, () => {
      const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
      const dimmed = dims(source);
      for (const [selector] of dimmed) {
        if (DECORATION.test(selector)) continue;
        const cls = String(/\.([a-z][a-z-]*)/.exec(selector)?.[1] ?? '');
        const markup = cellMarkup(source, cls);
        expect(markup, `${selector} dims a class this file does not render`).not.toBe('');
        expect(
          TEXT_IN_CELL.test(markup),
          `${selector} puts opacity on a cell that shows words or digits`,
        ).toBe(false);
      }
    });
  }

  it('keeps the 图鉴 cells dimmable where they are only colour', () => {
    // The positive control, so the case above cannot pass by matching nothing: the skins and the
    // swatches are dimmed by an explicit rule today, and they must stay that way — they are palettes,
    // not words.
    const sheet = readFileSync(
      new URL('../components/CollectionSheet.vue', import.meta.url),
      'utf8',
    );
    const dimmed = dims(sheet).map(([selector]) => selector);
    expect(
      dimmed.some((selector) => /\.skin\[data-locked/.test(selector)),
      'skins stopped dimming',
    ).toBe(true);
    expect(
      dimmed.some((selector) => /\.room\[data-locked[^\]]*\]\s+\.chip/.test(selector)),
      'the room chip lost its dim while the name did not',
    ).toBe(true);
    expect(
      dimmed.filter((selector) => /\.room\[data-locked(?![^\n{]*\.chip)/.test(selector)).length,
      'the room cell is dimmed as a whole again',
    ).toBe(0);
  });

  it('gives the two word-bearing locked states a colour the contrast guard can measure', () => {
    const cabinet = readFileSync(
      new URL('../components/CollectionSheet.vue', import.meta.url),
      'utf8',
    );
    const sheet = readFileSync(new URL('../components/SessionSheet.vue', import.meta.url), 'utf8');
    for (const [name, source, selector] of [
      ['图鉴 room', cabinet, ".room[data-locked='true'] :is(.room-name, .rung)"],
      ['成就阶梯', sheet, ".line.moment:not([data-reached='true']) .name"],
    ] as const) {
      expect(source, `${name} lost its 还没有 state rule`).toContain(selector);
    }
  });
});
