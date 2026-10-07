/**
 * The smoke has to stand out from the room it is drawn in — SPEC.md §57, §58.
 *
 * Every other plume test measures the smoke alone: its shape, its travel, its continuity. None of
 * those can see the failure this one exists for, because the complaint was never "the cloud is the
 * wrong shape" on its own — it was that the smoke did not read like the picture. A perfectly
 * columnar plume in a room that renders mid-grey reads as fog, and the numbers would all still
 * pass. So this renders a real frame — background gradients, light pools, vignette, then the
 * particles over the top — and asks the only question the eye asks: how much brighter is the smoke
 * than the air behind it.
 *
 * Fidelity, stated rather than implied: this is a software canvas (`pixelCanvas.ts`), not
 * Chromium. It implements solid and gradient rect fills, the soft-disc sprite falloff the renderer
 * bakes, `lighter` compositing and a full save/restore state stack; it does not draw paths, so the
 * rod, the tray and the props are absent from the frame. The skipped calls are counted below and
 * asserted to be the expected kinds, so the day someone adds a path fill here and this stops being
 * a background-plus-smoke measurement, the file says so.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { Burst } from '@puffly/game-core';
import { createCanvasRenderer } from '../renderer';
import type { SpriteImage, SpriteProvider } from '../sprites';
import { createPixelCanvas, pixelSprite } from './pixelCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const WIDTH = 195;
const HEIGHT = 422;
const STEP = 1000 / 60;
const FRAMES = 75;

function frame(): {
  canvas: ReturnType<typeof createPixelCanvas>;
  tip: { x: number; y: number };
  corner: string[];
} {
  const canvas = createPixelCanvas(WIDTH, HEIGHT);
  // Watch one pixel from the first frame on: the trace is what proves the compositor below is
  // blending the way canvas does, rather than accumulating everything the way a leaked
  // `lighter` state does.
  const corner = canvas.traceAt(2, 2);
  const provider: SpriteProvider = {
    size: 64,
    soft: (tint: readonly number[], blur = 1) => pixelSprite(tint, blur) as unknown as SpriteImage,
    clear: () => undefined,
  };
  const renderer = createCanvasRenderer({
    ctx: canvas.ctx,
    width: WIDTH,
    height: HEIGHT,
    dpr: 1,
    sprites: provider,
    settings: {
      reducedMotion: false,
      quality: 'high',
      contrast: 'normal',
      visualCues: false,
      realism: 0.8,
      skin: null,
    },
  });
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
  lit(h);
  const pending: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') pending.push(event.burst);
  });
  h.press('cigarette');
  h.run(1400);
  h.release('cigarette');
  for (let step = 0; step < FRAMES; step++) {
    h.run(STEP);
    for (const burst of pending.splice(0, pending.length)) {
      renderer.handleEvent({ kind: 'burst', atMs: 0, burst });
    }
    renderer.render(h.state(), STEP);
  }
  const ember = h.state().anchors.ember;
  renderer.dispose();
  return { canvas, tip: { x: ember.x * WIDTH, y: ember.y * HEIGHT }, corner };
}

const contrast = (light: number, dark: number): number => (light + 0.05) / (dark + 0.05);

describe('the smoke is the light thing in the room (§57)', () => {
  const scene = frame();
  const above = Math.max(0, Math.round(scene.tip.y - HEIGHT * 0.32));
  const left = Math.max(0, Math.round(scene.tip.x - WIDTH * 0.18));
  const right = Math.min(WIDTH, Math.round(scene.tip.x + WIDTH * 0.18));
  const plume = scene.canvas.peakIn(left, above, right, Math.round(scene.tip.y));
  // The air beside the plume, at the same heights: the same room, minus the smoke.
  const ground = scene.canvas.meanIn(
    2,
    above,
    Math.max(3, Math.round(WIDTH * 0.12)),
    Math.round(scene.tip.y),
  );
  const ratio = contrast(plume.L, ground);

  it('reads the room as dark, not as a lit wall', () => {
    console.log(
      `ROOM groundL=${ground.toFixed(4)} plumeL=${plume.L.toFixed(4)} ratio=${ratio.toFixed(2)}`,
    );
    // Measured 0.0124 at this size — about rgb(21,20,20), where the sky hands over rgb(37,37,39)
    // and the vignette takes half of what is left. How this number was reached matters as much:
    // the first version of the software canvas left `globalCompositeOperation` on `lighter` after
    // the glow layers, because its `restore()` only put the translation back. The same room then
    // measured 0.0724 and the smoke 4.96:1 — the tool was wrong, not the app, and only a trace of
    // one pixel proved it. That trace is the fourth case in this file.
    expect(ground).toBeLessThan(0.05);
  });

  it('lifts the smoke well clear of that room', () => {
    // The floor is 5 because below that a soft-edged cloud stops reading as a body at phone size —
    // it is not where the build sits, and the gap is now only 1.8%. Measured series for this number,
    // from the `ROOM` line above: 9.73 when this file was written (`3b5af51`), 6.44 after `197b89b`
    // spread a breath over a second instead of an instant, 5.09 after `57dfac6` hung the places on a
    // level and seeded clutter into the background. Each of those steps was absorbed by the floor
    // without going red, which is how a guard meant for 「烟看不清」 ended up 46% dimmer than the day
    // it was born. The ventilation coefficient (S21) is deliberately measured from its sealed end so
    // it cannot add a fourth step: `tests/venue-and-smoke.test.ts` is what keeps that honest.
    expect(ratio).toBeGreaterThanOrEqual(5);
    expect(plume.L).toBeGreaterThan(ground * 4);
  });

  it('blends the room instead of piling it up', () => {
    // The self-check. A first version of this canvas left `globalCompositeOperation` set to
    // `lighter` after the glow layers, because `restore()` only put the translation back — and it
    // painted a room the renderer had asked for at rgb(37,37,39) as rgb(75,74,76), which made the
    // smoke look 2x less contrasty than it is. Every op touching this pixel must therefore be a
    // plain blend, and the last one must be the vignette darkening it, not a glow brightening it.
    const modes = new Set(scene.corner.map((line) => line.split(' ')[0]));
    console.log(`CORNER ops=${String(scene.corner.length)} modes=${JSON.stringify([...modes])}`);
    expect(modes.has('lighter')).toBe(false);
    expect(scene.corner.length).toBeGreaterThan(2);
    // The vignette is part of the room's own darkness; if it ever stops reaching this pixel, the
    // ground measurement above is no longer measuring the picture a player sees.
    expect(scene.corner.some((line) => /rgb\(0,0,0\) a=0\.[2-9]/.test(line))).toBe(true);
  });

  it('is still a background-plus-smoke measurement', () => {
    // Paths are not drawn by this canvas, so the rod and props are absent. If that stops being
    // true, the two numbers above are measuring a different picture and this file must be re-read.
    const skipped = scene.canvas.skipped();
    expect(Object.keys(skipped).sort()).toEqual([
      'arc',
      'ellipse',
      'fill:path',
      'path',
      'rotate',
      'stroke:path',
    ]);
  });
});
