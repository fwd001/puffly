/**
 * 吸入时纸面会塌陷 — the third beat of S7's chain that has to work with the sound off
 * (「余烬变亮 → 炭化线推进 → 纸面凹陷」), and the picture S15 says the idle hint strip was replaced by.
 *
 * What is asserted is the geometry the renderer *asks the platform to paint*, read back out of the
 * recorded path. A field being written is not evidence that the paper moved — that lesson is §21's and
 * it was paid for once already in this package. Three things have to hold together: an idle rod is the
 * exact straight band this file drew before, a drawn rod pinches toward its axis near the cherry, and
 * the paper's own details (the seam, the brand band) go down with the tube instead of staying flat on
 * top of a collapsed one — which is measured against the curve that was actually emitted, not against
 * a copy of the formula that produced it.
 */

import { describe, expect, it } from 'vitest';
import type { GameStateView } from '@puffly/game-core';
import { createViewport, type Viewport } from '../viewport';
import { drawCigarette } from '../props';
import { createFakeCanvas, type FakeCall } from './fakeCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const VIEWPORT: Viewport = createViewport({ width: 390, height: 844, dpr: 2 });

interface Curve {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
}

/** The paper's outline: the first filled path, as the curves it was built from. */
function paper(state: GameStateView): { half: number; edges: Curve[]; calls: FakeCall[] } {
  const canvas = createFakeCanvas();
  drawCigarette(canvas.ctx, state, VIEWPORT);
  const fillAt = canvas.calls.findIndex((call) => call.name === 'fill');
  expect(fillAt, 'the rod painted nothing').toBeGreaterThan(-1);
  const body = canvas.calls.slice(0, fillAt);
  const numbers = body
    .filter((call) => ['moveTo', 'lineTo', 'quadraticCurveTo'].includes(call.name))
    .flatMap((call) => (call.args as number[]).filter(Number.isFinite));
  const ys = numbers.filter((_value, index) => index % 2 === 1);
  const half = Math.max(...ys.map((value) => Math.abs(value)));

  // Walk the path in order, keeping each curve with the point it started from.
  const edges: Curve[] = [];
  let at: [number, number] = [0, 0];
  for (const call of body) {
    const args = call.args as number[];
    if (call.name === 'moveTo') at = [Number(args[0]), Number(args[1])];
    if (call.name === 'lineTo') at = [Number(args[0]), Number(args[1])];
    if (call.name === 'quadraticCurveTo') {
      const curve = {
        x0: at[0],
        y0: at[1],
        cx: Number(args[0]),
        cy: Number(args[1]),
        x1: Number(args[2]),
        y1: Number(args[3]),
      };
      at = [curve.x1, curve.y1];
      // The two long edges run between the rod's two ends; the four corner caps start and end at a
      // corner, so their control sits at the corner too.
      if (
        Math.abs(curve.y0) > half * 0.5 &&
        Math.abs(curve.y1) > half * 0.5 &&
        curve.x0 !== curve.x1
      ) {
        edges.push(curve);
      }
    }
  }
  return { half, edges, calls: canvas.calls };
}

/** How far a control point sits inside the flat face it belongs to. */
function bowOf(curve: Curve, half: number): number {
  return half - Math.abs(curve.cy);
}

/** The outline's y at one x, sampled from the emitted curve itself. */
function edgeAt(curve: Curve, x: number): number {
  let best = curve.y0;
  let bestDx = Infinity;
  for (let step = 0; step <= 200; step += 1) {
    const t = step / 200;
    const mt = 1 - t;
    const px = mt * mt * curve.x0 + 2 * mt * t * curve.cx + t * t * curve.x1;
    const py = mt * mt * curve.y0 + 2 * mt * t * curve.cy + t * t * curve.y1;
    if (Math.abs(px - x) < bestDx) {
      bestDx = Math.abs(px - x);
      best = py;
    }
  }
  return best;
}

function drawn(holdMs: number): GameStateView {
  const h = harness();
  lit(h);
  h.press('cigarette');
  h.run(holdMs);
  const state = h.state();
  expect(
    state.cigarette.puff.active,
    `a ${String(holdMs)}ms hold did not leave a draw running`,
  ).toBe(true);
  return state;
}

describe('the paper collapses while it is being drawn (S7, S15)', () => {
  it('keeps the straight band when nothing is being drawn', () => {
    const h = harness();
    lit(h);
    expect(h.state().cigarette.puff.active, 'the fixture was already mid-draw').toBe(false);
    const { half, edges } = paper(h.state());
    expect(edges.length, 'the paper lost its long edges').toBe(2);
    for (const edge of edges) {
      // A control exactly on the face means the quadratic is a straight line: the idle rod has to be
      // the shape this file drew before the dent existed, or the drawn case below proves nothing.
      expect(bowOf(edge, half), `control ${String(edge.cy)}`).toBeCloseTo(0, 10);
    }
    console.log(
      `DIP idle half=${half.toFixed(2)} controls=${edges
        .map((edge) => edge.cy.toFixed(2))
        .join(',')}`,
    );
  });

  it('pinches toward its axis while the draw runs, harder as the draw gets harder', () => {
    const seen: { intensity: number; bow: number; thickness: number }[] = [];
    for (const holdMs of [260, 900]) {
      const state = drawn(holdMs);
      const { half, edges } = paper(state);
      expect(edges.length, 'both faces are drawn').toBe(2);
      const bows = edges.map((edge) => bowOf(edge, half));
      const bow = Math.min(...bows);
      // Both faces bow, and by the same amount — one face alone would be a dent, not a pinch.
      for (const value of bows) expect(value).toBeCloseTo(bow, 6);
      expect(bow, 'the paper did not move at all').toBeGreaterThan(0);
      // Never a whole thickness: a tube pinched shut is a different rod.
      expect(bow).toBeLessThan(half);
      seen.push({ intensity: state.cigarette.puff.intensity, bow, thickness: half * 2 });
      console.log(
        `DIP hold=${String(holdMs)} intensity=${state.cigarette.puff.intensity.toFixed(3)} ` +
          `half=${half.toFixed(2)} bow=${bows.map((v) => v.toFixed(2)).join(',')}`,
      );
    }
    expect(seen[1]!.intensity, 'the two holds drew the same strength').toBeGreaterThan(
      seen[0]!.intensity,
    );
    expect(seen[1]!.bow, 'a harder draw did not deepen the pinch').toBeGreaterThan(seen[0]!.bow);
    for (const one of seen) expect(one.bow).toBeLessThan(one.thickness * 0.5);
  });

  it('takes the seam and the brand band down with the paper', () => {
    const state = drawn(900);
    const { half, edges, calls } = paper(state);
    const top = edges.find((edge) => edge.cy < 0);
    expect(top, 'no top edge was recorded').not.toBeUndefined();
    const bow = bowOf(top!, half);
    expect(bow).toBeGreaterThan(0);

    // The seam is the stroke that starts on the paper's seam line (a fifth of the thickness above the
    // axis, i.e. 0.4 of the half-face). What is checked is that it moved inward by exactly as much as
    // the outline's control did — a seam left flat would sit proud of a collapsed tube.
    const fillAt = calls.findIndex((call) => call.name === 'fill');
    let seamControl: number | undefined;
    let pending: number | undefined;
    for (const call of calls.slice(fillAt)) {
      const args = call.args as number[];
      if (call.name === 'moveTo') pending = Number(args[1]);
      if (call.name === 'quadraticCurveTo' && pending !== undefined) {
        if (Math.abs(Math.abs(pending) - 0.4 * half) < 1e-9) {
          seamControl = Number(args[1]);
          break;
        }
        pending = undefined;
      }
    }
    expect(seamControl, 'the seam stopped following the paper').not.toBeUndefined();
    // Inward means a *larger* y for a point above the axis. The control is allowed to cross the axis
    // (a quadratic only reaches half of its control's offset), so this compares signed positions
    // instead of magnitudes — using `Math.abs` here hid the very movement being asserted.
    expect(seamControl! + 0.4 * half).toBeCloseTo(bow, 6);

    // The brand band is a rectangle, so it is measured against the curve that was actually emitted at
    // its own x — not against a formula this file kept a second copy of. (The first version did exactly
    // that and stood 0.15 px outside its own rod.)
    const band = calls.slice(fillAt).find((call) => call.name === 'fillRect');
    expect(band, 'the brand band vanished').not.toBeUndefined();
    const args = band!.args as number[];
    const bandTop = Number(args[1]);
    const centreX = Number(args[0]) + Number(args[2]) / 2;
    const edgeY = edgeAt(top!, centreX);
    console.log(
      `DIP band y=${bandTop.toFixed(3)} edge at band=${edgeY.toFixed(3)} bow=${bow.toFixed(3)} ` +
        `seamControl=${seamControl!.toFixed(3)}`,
    );
    expect(bandTop, 'the band sticks out above the collapsed paper').toBeGreaterThanOrEqual(
      edgeY - 0.05,
    );
    expect(bandTop).toBeLessThan(0);
  });

  it('draws the same picture twice for the same state, so a dent is not a clock', () => {
    const state = drawn(600);
    const once = createFakeCanvas();
    const twice = createFakeCanvas();
    drawCigarette(once.ctx, state, VIEWPORT);
    drawCigarette(twice.ctx, state, VIEWPORT);
    expect(JSON.stringify(twice.calls)).toBe(JSON.stringify(once.calls));
  });
});
