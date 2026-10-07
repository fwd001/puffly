/**
 * The flip-top opens on a hinge — the deck's 80% side, S7: 「打火机：金属拉丝、合页、机身反光都是
 * 物理正确的」, and the player's own 「点火的时候盖子抬起 感觉很奇怪…更接近物理世界一点」.
 *
 * What was wrong: the cap shortened, narrowed and slid its own bottom edge up at the same time,
 * which is what a telescope does. A lid does one thing only — it turns about its hinge — so every
 * number here follows from that: the shell keeps its length, the hinge end never moves, the height
 * it still occupies is `length × cos(angle)`, and the part it uncovers stays uncovered because the
 * shell is drawn *behind* the chimney it has tipped behind.
 *
 * Read off the emitted canvas calls rather than off a picture, because the claim is about geometry
 * and geometry is what the recorder keeps.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { GameStateView } from '@puffly/game-core';
import { LID_THROW_DEG, drawLighter } from '../props';
import { createViewport } from '../viewport';
import { createFakeCanvas, type FakeCall } from './fakeCanvas';
import { harness } from '../../../game-core/src/__tests__/harness';

const VIEW = createViewport({ width: 390, height: 844, dpr: 1 });

function at(lid: number, flame = 0): FakeCall[] {
  const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
  const view = structuredClone(h.state()) as GameStateView;
  const lighter = view.lighter as { lid: number; flame: number };
  lighter.lid = lid;
  lighter.flame = flame;
  const canvas = createFakeCanvas();
  drawLighter(canvas.ctx, view, VIEW);
  return canvas.calls;
}

/** The first path in `drawLighter` is the cap's own outline: one moveTo and the skirt's corners. */
function capOutline(calls: FakeCall[]): {
  bottom: number;
  top: number;
  left: number;
  right: number;
  topWidth: number;
  skirtWidth: number;
} {
  const start = calls.findIndex((call) => call.name === 'moveTo');
  expect(start, 'the lighter drew no path at all').toBeGreaterThan(-1);
  const points = calls
    .slice(start)
    .filter((call) => call.name === 'moveTo' || call.name === 'lineTo')
    .slice(0, 7)
    .map((call) => ({ x: Number(call.args[0]), y: Number(call.args[1]) }));
  expect(points).toHaveLength(7);
  // The outline's corners are rounded, so the top edge is the highest point the path reaches and
  // the skirt's bottom is the lowest — reading index 2 would report a corner blend instead.
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const atTop = points.filter((point) => point.y < top + 0.01);
  return {
    bottom,
    top,
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    topWidth:
      Math.max(...atTop.map((point) => point.x)) - Math.min(...atTop.map((point) => point.x)),
    // The skirt's own span. The path closes back to its start, so of the two bottom corners only
    // one is emitted, and the widest points of the outline are that pair whatever the corner blend.
    skirtWidth:
      Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
  };
}

/** The chimney is the first rectangle filled after that outline. */
function chimney(calls: FakeCall[]): { top: number; bottom: number } {
  const capAt = calls.findIndex((call) => call.name === 'moveTo');
  const rect = calls
    .slice(capAt)
    .find((call) => call.name === 'fillRect' && Number(call.args[3]) > 0)!;
  return { top: Number(rect.args[1]), bottom: Number(rect.args[1]) + Number(rect.args[3]) };
}

describe('the flip-top turns about its hinge (S7)', () => {
  it('keeps one end of the shell exactly where the hinge is', () => {
    const closed = capOutline(at(0));
    const half = capOutline(at(0.5));
    const open = capOutline(at(1));
    console.log(
      `HINGE skirt bottom ${closed.bottom.toFixed(2)} / ${half.bottom.toFixed(2)} / ` +
        `${open.bottom.toFixed(2)}`,
    );
    // A lid that slides is a lid with no hinge. This is the number the old drawing got wrong.
    expect(half.bottom).toBeCloseTo(closed.bottom, 6);
    expect(open.bottom).toBeCloseTo(closed.bottom, 6);
  });

  it('shortens only the way a rigid length in projection shortens', () => {
    const heights = [0, 0.25, 0.5, 0.75, 1].map((lid) => {
      const cap = capOutline(at(lid));
      return cap.bottom - cap.top;
    });
    const cosines = [0, 0.25, 0.5, 0.75, 1].map(
      (lid) => Math.cos((lid * LID_THROW_DEG * Math.PI) / 180) * heights[0]!,
    );
    const ratios = heights.map((height, index) => height / cosines[index]!);
    console.log(
      `RIGID heights=${heights.map((h) => h.toFixed(1)).join(',')} ` +
        `spread=${(Math.max(...ratios) / Math.min(...ratios)).toFixed(4)}`,
    );
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]!, `lid ${String(i / 4)}`).toBeLessThan(heights[i - 1]!);
    }
    // The throw itself is bounded in pixels rather than by the exported constant, or the case
    // above would hold for any angle at all: at full open the shell has to be down near edge-on
    // (a fifth of its standing height) without lying flat on the tank.
    expect(heights[4]!).toBeLessThan(heights[0]! * 0.25);
    expect(heights[4]!).toBeGreaterThan(heights[0]! * 0.12);
    // One constant of proportionality across the whole throw is the whole claim: the shell has one
    // length and only the angle changes.
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.02);
  });

  it('uncovers the chimney, and does it from behind', () => {
    const openCalls = at(1, 0.9);
    const cap = capOutline(openCalls);
    const stack = chimney(openCalls);
    const capPath = openCalls.findIndex((call) => call.name === 'moveTo');
    const capFill = openCalls.findIndex((call, index) => index > capPath && call.name === 'fill');
    const chimneyRect = openCalls.findIndex(
      (call, index) => index > capFill && call.name === 'fillRect',
    );
    console.log(
      `CHIMNEY capTop=${cap.top.toFixed(2)} stackTop=${stack.top.toFixed(2)} ` +
        `stackBottom=${stack.bottom.toFixed(2)} order=${String(capFill)}<${String(chimneyRect)}`,
    );
    // Closed, the cap's top sits above the chimney; thrown back it has to be below it, or the
    // gesture uncovers nothing.
    expect(cap.top).toBeGreaterThan(stack.top);
    expect(cap.top).toBeLessThan(stack.bottom);
    // And the shell is painted before the chimney, because a lid tipped past the hinge line is
    // behind it — drawing it in front would hide the one part worth showing.
    expect(chimneyRect).toBeGreaterThan(capFill);
  });

  it('keeps its own width where it is wide and recedes only at the far end', () => {
    const shapes = [0, 0.5, 1].map((lid) => capOutline(at(lid)));
    console.log(
      `WIDTHS skirt=${shapes.map((s) => s.skirtWidth.toFixed(2)).join(',')} ` +
        `top=${shapes.map((s) => s.topWidth.toFixed(2)).join(',')}`,
    );
    // The skirt is the widest part of the shell and it does not move: that overhang is the
    // silhouette cue that says "this part comes off", and it is what the previous drawing threw
    // away by pinching the whole cap inward as it lifted.
    expect(shapes[1]!.skirtWidth).toBeCloseTo(shapes[0]!.skirtWidth, 6);
    expect(shapes[2]!.skirtWidth).toBeCloseTo(shapes[0]!.skirtWidth, 6);
    // The far end recedes against its own shut width — 8% here — rather than against the skirt,
    // whose corner blends already take a slice off it. A little narrower is perspective; a lot is a
    // squeezed tube, which is the thing this whole rewrite is not.
    const recession = shapes[2]!.topWidth / shapes[0]!.topWidth;
    console.log(`WIDTHS recession=${recession.toFixed(3)}`);
    expect(recession).toBeLessThan(0.99);
    expect(recession).toBeGreaterThan(0.88);
  });
});
