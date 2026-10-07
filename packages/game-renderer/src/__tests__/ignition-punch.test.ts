/**
 * The ignition punch — the deck's 20% side, S7: 「点火瞬间整体画面轻微推近 + 边缘压暗（冲击感）」.
 *
 * Three things had to be true at once, and each is checked separately because each fails on its own:
 * the frame has to actually move at the moment the rod catches, it has to stop moving, and the
 * cherry — the one thing the player is aiming at — must not move at all. That last claim is the
 * reason the camera pivots on the ember instead of on the centre of the frame: the shell hit-tests
 * against anchors the core publishes, so a zoom that slid the ember would slide the tap target with
 * it for the length of the punch (§37).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { GameStateView } from '@puffly/game-core';
import { IGNITION_IMPACT, createCanvasRenderer } from '../renderer';
import { createFakeCanvas } from './fakeCanvas';
import { createViewport } from '../viewport';
import type { SpriteImage, SpriteProvider } from '../sprites';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const W = 195;
const H = 422;
const STEP = 1000 / 60;

interface Frame {
  /** The scale the frame asked for, or 1 when it asked for none. */
  zoom: number;
  /** The translate that precedes that scale, i.e. the camera's fixed point. */
  pivot: { x: number; y: number } | null;
  /** Where the cherry sat in pixels, in the same frame. */
  ember: { x: number; y: number };
  /** Every gradient's outer alpha in the frame, in the order painted. */
  alphas: number[];
}

/** One lit rod, rendered past the catch, with every frame's camera read back off the recorder. */
function run(reducedMotion: boolean): Frame[] {
  const canvas = createFakeCanvas();
  const viewport = createViewport({ width: W, height: H, dpr: 1 });
  const sprites: SpriteProvider = {
    size: 64,
    soft: () => ({ width: 64, height: 64 }) as unknown as SpriteImage,
    clear: () => undefined,
  };
  const renderer = createCanvasRenderer({
    ctx: canvas.ctx,
    width: W,
    height: H,
    dpr: 1,
    sprites,
    settings: {
      reducedMotion,
      quality: 'high',
      contrast: 'normal',
      visualCues: true,
      skin: null,
    },
  });
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
  // The shell forwards every engine event to the renderer. Without that wire there is no moment to
  // punch on — which is how this file first read: zero frames moved, and nothing actually broken.
  h.engine.on((event) => renderer.handleEvent(event));
  lit(h);
  h.press('cigarette');

  const frames: Frame[] = [];
  for (let step = 0; step < 90; step++) {
    h.run(STEP);
    const view = h.state();
    const ember = viewport.px(view.anchors.ember);
    const before = canvas.calls.length;
    const gradientsBefore = canvas.gradients.length;
    renderer.render(view as GameStateView, STEP);
    const calls = canvas.calls.slice(before);
    const scaled = calls.find((call) => call.name === 'scale');
    const alphas = canvas.gradients.slice(gradientsBefore).map((gradient) => {
      const colour = String(gradient.stops.slice(-1)[0]?.color ?? '');
      // An alpha, from a colour that has one: `rgb(37,38,41)` would otherwise report 41.
      return colour.startsWith('rgba') ? Number((colour.match(/([\d.]+)\)$/) ?? ['0'])[1]) : 0;
    });
    const pivot = (() => {
      if (!scaled) return null;
      const back = calls[calls.indexOf(scaled) - 1];
      if (back?.name !== 'translate') return null;
      return { x: Number(back.args[0]), y: Number(back.args[1]) };
    })();
    frames.push({ zoom: scaled ? Number(scaled.args[0]) : 1, pivot, ember, alphas });
  }
  renderer.dispose();
  return frames;
}

/** The alpha the punch's own edge gradient should carry in a frame that zoomed by `zoom`. */
const edgeFor = (zoom: number): number =>
  IGNITION_IMPACT.edge * ((zoom - 1) / IGNITION_IMPACT.zoom);

describe('the ignition pushes the room in and closes the edges (S7)', () => {
  it('lands on the frame the rod catches, and lets go inside its own window', () => {
    const frames = run(false);
    const peak = Math.max(...frames.map((frame) => frame.zoom));
    const lifted = frames.filter((frame) => frame.zoom > 1.0005).length;
    const last = frames[frames.length - 1]!;
    console.log(
      `PUNCH peak=${peak.toFixed(4)} frames=${String(lifted)} of ${String(frames.length)} ` +
        `settled=${last.zoom.toFixed(5)}`,
    );
    // It has to be a push, not a slide: the peak is the constant, and the frame count is the ttl.
    expect(peak).toBeGreaterThan(1 + IGNITION_IMPACT.zoom * 0.8);
    expect(peak).toBeLessThan(1 + IGNITION_IMPACT.zoom * 1.05);
    expect(lifted).toBeGreaterThanOrEqual(Math.round(IGNITION_IMPACT.ttlMs / STEP) - 4);
    expect(lifted).toBeLessThanOrEqual(Math.round(IGNITION_IMPACT.ttlMs / STEP) + 4);
    expect(last.zoom).toBe(1);
  });

  it('leaves the cherry exactly where the player is aiming', () => {
    const frames = run(false);
    const punched = frames.filter((frame) => frame.zoom > 1.0005);
    expect(punched.length, 'no frame was punched at all').toBeGreaterThan(4);
    for (const frame of punched) {
      expect(
        frame.pivot,
        'a scale with no pivot is a camera around the frame centre',
      ).not.toBeNull();
      // translate(a) scale(k) translate(-a) fixes the point a. If a is not the ember's own pixel,
      // then the cherry moved on screen while the head-up row kept pointing at it.
      expect(frame.pivot!.x).toBeCloseTo(frame.ember.x, 6);
      expect(frame.pivot!.y).toBeCloseTo(frame.ember.y, 6);
    }
  });

  it('closes the edges by the same curve it zooms by, and only while it is punching', () => {
    const frames = run(false);
    const atRest = frames.filter((frame) => frame.zoom === 1);
    const atPunch = frames.filter((frame) => frame.zoom > 1);
    // The darkening is identified by tracking the zoom rather than by being "darker than usual":
    // the base vignette sits at 0.748 in this room and the light pools at 0.088 and 0.53, so
    // nothing else in a frame is faint in exactly this way. Counting gradients would not do either
    // — the cherry's own glow and the ignition ring each add one in the same window.
    const tracks = atPunch.every((frame) =>
      frame.alphas.some((alpha) => Math.abs(alpha - edgeFor(frame.zoom)) < 0.012),
    );
    const atRestNearEdge = atRest.filter((frame) =>
      frame.alphas.some((alpha) => alpha > 0.15 && alpha < 0.25),
    );
    console.log(
      `PUNCH tracks=${String(tracks)} over ${String(atPunch.length)} frames, ` +
        `rest frames near the edge alpha=${String(atRestNearEdge.length)}`,
    );
    expect(tracks).toBe(true);
    expect(atRestNearEdge).toEqual([]);
  });

  it('is not offered to a player who asked for no motion', () => {
    const frames = run(true);
    const zoomed = frames.filter((frame) => frame.zoom !== 1).length;
    const pivoted = frames.filter((frame) => frame.pivot !== null).length;
    console.log(`PUNCH reduced-motion zoomed=${String(zoomed)} pivoted=${String(pivoted)}`);
    expect(zoomed).toBe(0);
    expect(pivoted).toBe(0);
    // The edge darkening is painted inside the same `punch > 0` branch as the camera, and that
    // branch is the only thing the reduced-motion gate closes: nothing asked for a camera, so
    // nothing in it ran either.
  });
});
