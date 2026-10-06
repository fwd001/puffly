/**
 * The choices on the table are checked at both ends of their chain — SPEC.md §21, §57.
 *
 * A 烟羽 colour layer turned out to reach the state and not the picture, so "the field was
 * written" stopped counting as evidence here. Each choice below is measured twice: the selection
 * has to change the assembled style, and the object drawn from that style has to come out in
 * colours the old choice never used. Both links are asserted; neither is inferred from the other.
 *
 * The fixture carries two rods and two lighters but a single ashtray, so the tray's own chain is
 * not exercised here — only its drawing is covered elsewhere.
 */

import { describe, expect, it } from 'vitest';
import { rgbToCss } from '@puffly/shared';
import { createDefaultSettings, createEngine, type GameStateView } from '@puffly/game-core';
import { createViewport, type Viewport } from '../viewport';
import { drawCigarette, drawLighter } from '../props';
import { createFakeCanvas } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

const STEP_MS = 1000 / 60;

function running(select?: (engine: ReturnType<typeof createEngine>) => void): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 2026,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  select?.(engine);
  for (let frame = 0; frame < 30; frame++) engine.advance(STEP_MS);
  return engine.getState();
}

/** Every colour one draw call asked to paint with. */
function paintedBy(
  draw: (ctx: CanvasRenderingContext2D, state: GameStateView, viewport: Viewport) => void,
  state: GameStateView,
): string[] {
  const canvas = createFakeCanvas();
  const viewport = createViewport({ width: 390, height: 844, dpr: 2 });
  draw(canvas.ctx, state, viewport);
  const colours = canvas.calls
    .filter((call) => call.name === 'set:fillStyle' || call.name === 'set:strokeStyle')
    .map((call) => String((call.args as string[])[0]));
  for (const gradient of canvas.gradients) {
    for (const stop of gradient.stops) colours.push(stop.color);
  }
  return colours.filter((colour) => colour.includes('rgb'));
}

/** Colours the new choice paints with that the old one never did — order and length proof. */
function novel(before: string[], after: string[]): string[] {
  return after.filter((colour, index) => colour !== before[index] && !before.includes(colour));
}

describe('a choice on the table reaches the pixels (§21)', () => {
  it('a different lighter changes the style the lighter is drawn from', () => {
    const before = running();
    const after = running((engine) => engine.selectLighter('test-flaky'));
    expect(JSON.stringify(after.style.lighter)).not.toBe(JSON.stringify(before.style.lighter));
  });

  it('a different lighter is drawn in colours the first one never used', () => {
    const before = paintedBy(drawLighter, running());
    const after = paintedBy(
      drawLighter,
      running((engine) => engine.selectLighter('test-flaky')),
    );
    expect(before.length, 'the lighter emits colours').toBeGreaterThan(2);
    expect(
      novel(before, after).length,
      'the lighter was drawn identically both ways',
    ).toBeGreaterThan(0);
  });

  it('a different rod changes the style the rod is drawn from', () => {
    const before = running();
    const after = running((engine) => engine.selectCigarette('test-long'));
    expect(JSON.stringify(after.style.cigarette)).not.toBe(JSON.stringify(before.style.cigarette));
  });

  it('a different rod is drawn in its own paper colour', () => {
    // "Some colour differs" was not enough: pinning the paper to a constant left that version
    // passing, because other parts of the rod differ between the two fixtures anyway. So this
    // asserts the specific fact — the paper the chosen rod is described by is on screen.
    const before = running();
    const after = running((engine) => engine.selectCigarette('test-long'));
    expect(JSON.stringify(before.style.cigarette.paper)).not.toBe(
      JSON.stringify(after.style.cigarette.paper),
    );
    expect(paintedBy(drawCigarette, after)).toContain(rgbToCss(after.style.cigarette.paper));
    expect(paintedBy(drawCigarette, before)).toContain(rgbToCss(before.style.cigarette.paper));
  });

  it('measures the same picture twice to zero difference, so a colour above is signal', () => {
    const first = paintedBy(drawLighter, running());
    const second = paintedBy(drawLighter, running());
    expect(novel(first, second)).toEqual([]);
    const rodA = paintedBy(drawCigarette, running());
    const rodB = paintedBy(drawCigarette, running());
    expect(novel(rodA, rodB)).toEqual([]);
  });
});
