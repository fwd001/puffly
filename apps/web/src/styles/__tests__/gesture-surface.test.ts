/**
 * The gesture surface contract — SPEC.md §66.
 *
 * The CSS half of "the scene owns the gesture" cannot be checked in a browser: Chromium does not
 * implement `-webkit-touch-callout` and drops the declaration while parsing, so the only thing it
 * can prove is that the rule ships. It exists for iPhone and iPad Safari, where a long press
 * otherwise raises "save image / look up" over the game.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../global.css', import.meta.url)), 'utf8');

describe('the page refuses the browser’s own gestures (§66)', () => {
  it('switches the iOS long-press callout off', () => {
    expect(css).toContain('-webkit-touch-callout: none');
  });

  it('takes the whole surface out of the browser’s hands', () => {
    // Without these, a two-finger pinch zooms the scene and a long press selects or scrolls.
    expect(css).toContain('touch-action: none');
    expect(css).toContain('overscroll-behavior: none');
    expect(css).toContain('user-select: none');
  });

  it('leaves the sheet above the bar that opened it', () => {
    // A bottom sheet that reached the bottom of the screen covered all three chrome buttons, so
    // the middle one went dead once it was open. The lift is one fact, named once.
    expect(css).toContain('--sheet-lift: calc(var(--chrome-height) + env(safe-area-inset-bottom))');
    const sheet = css.slice(css.indexOf('.sheet {'), css.indexOf('.sheet[data-open'));
    expect(sheet).toContain('bottom: var(--sheet-lift)');
    expect(sheet).toContain('translateY(calc(100% + var(--sheet-lift)))');
  });
});
