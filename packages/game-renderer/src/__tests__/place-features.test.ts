/**
 * A place has to be somewhere specific — the deck's 「场所不是背景板」 (S21, slide 24).
 *
 * Why this file exists: a contact sheet of all twenty-one shipped places, painted from one scripted
 * break, put every indoor place within three luminance points of every other (L 32.0..35.3). Palette
 * and light pool alone make a net café, a toilet cubicle, an office landing and a desk read as one
 * dark room in four colour grades — which is the complaint 「场景的皮肤感觉很单调」 in numbers. So a
 * place now carries `background.features`, and the renderer draws them.
 *
 * Three claims, because a field nobody paints and a field every place copies would both pass the
 * other two: the vocabulary reaches pixels, the places are told apart by it, and every id in the
 * vocabulary is standing in some place.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { createDefaultSettings, createEngine, type SceneFeatureId } from '@puffly/game-core';
import { drawBackground } from '../background';
import { createViewport } from '../viewport';
import { createPixelCanvas } from './pixelCanvas';
import type { PixelCanvas } from './pixelCanvas';

const W = 195;
const H = 422;
const VIEW = createViewport({ width: W, height: H, dpr: 1 });

const FEATURE_IDS: readonly SceneFeatureId[] = [
  'screens',
  'partitions',
  'extractor',
  'roof',
  'clothesline',
  'counter',
  'hearth',
  'low-tables',
  'parasol',
  'elevator',
  'pumps',
  'bins',
  'glass-box',
  'shutters',
];

function bareState() {
  const engine = createEngine({
    content: DEFAULT_CONTENT,
    seed: 909,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  for (let frame = 0; frame < 60; frame++) engine.advance(1000 / 60);
  const view = JSON.parse(JSON.stringify(engine.getState())) as never as Record<string, unknown>;
  return view;
}

/** One painted background, with the furniture optionally swapped for someone else's. */
function paint(features: readonly SceneFeatureId[] | undefined): PixelCanvas {
  const view = bareState();
  const background = (view.environment as { background: Record<string, unknown> }).background;
  background.features = features ? [...features] : undefined;
  const canvas = createPixelCanvas(W, H);
  drawBackground(canvas.ctx, view as never, VIEW);
  return canvas;
}

const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let moved = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (
      Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) >
      2
    ) {
      moved++;
    }
  }
  return moved;
};

const LIT_FEATURES: readonly SceneFeatureId[] = ['screens', 'hearth', 'pumps'];

const maxLuminance = (canvas: PixelCanvas): number => {
  let peak = 0;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) peak = Math.max(peak, canvas.luminance(x, y));
  }
  return peak;
};

describe('a place carries the shapes that stand in it (S21)', () => {
  it('paints every feature id, one at a time, onto the same room', () => {
    const plain = paint(undefined);
    const plainPeak = maxLuminance(plain);
    const floor = plain.pixels.slice();
    const report: string[] = [];
    for (const feature of FEATURE_IDS) {
      const withFeature = paint([feature]);
      const moved = differing(withFeature.pixels, floor);
      // Not "a call was made": the frame has to be a different picture. Measured spread across the
      // vocabulary is 897 px (the extractor's slats, the smallest thing here) to 20,708 px (the glass
      // box, which is most of a frontage), so the line sits well under the low end.
      expect(moved, `${feature} painted nothing`).toBeGreaterThan(500);
      const peak = maxLuminance(withFeature);
      const share = peak / plainPeak;
      report.push(`${feature}=${String(moved)}px ${((share - 1) * 100).toFixed(0)}%`);
      // Furniture is dark: it is seen, not read, and §57 wants the cherry to stay the light thing in
      // the room. Measured, eleven of the fourteen ids sit at or below the room's own peak (the glass
      // box even pulls it down to 63% by covering the light pool). The three allowed to be brighter
      // than the room are the three that would be brighter in life — a wall of screens (+49%), a
      // hearth (+34%) and a lit pump (+33%) — and none of them gets to be a light source the eye
      // reads before the ember, which is what the 1.6 ceiling holds.
      if (LIT_FEATURES.includes(feature)) {
        expect(share, `${feature} is lit and should read as lit`).toBeGreaterThan(1.05);
      }
      expect(share, `${feature} out-lights the room`).toBeLessThanOrEqual(1.6);
    }
    console.log(`FEATURES peak delta: ${report.join(' ')}`);
  });

  it('tells apart every pair of places that shares a backdrop shape', () => {
    const byKind = new Map<string, { id: string; features: string }[]>();
    for (const place of DEFAULT_CONTENT.environments) {
      const list = byKind.get(place.background.kind) ?? [];
      list.push({
        id: place.id,
        features: [...(place.background.features ?? [])].sort().join('+'),
      });
      byKind.set(place.background.kind, list);
    }
    const report: string[] = [];
    for (const [kind, places] of byKind) {
      const seen = new Map<string, string>();
      for (const place of places) {
        const clash = seen.get(place.features);
        report.push(`${kind}:${place.id}[${place.features || 'bare'}]`);
        expect(clash, `${place.id} furnishes ${kind} exactly like ${clash}`).toBeUndefined();
        seen.set(place.features, place.id);
      }
    }
    console.log(`FEATURES by kind ${report.join(' ')}`);
  });

  it('uses every id the vocabulary offers, so the list is not half furniture', () => {
    const used = new Set(DEFAULT_CONTENT.environments.flatMap((p) => p.background.features ?? []));
    const unused = FEATURE_IDS.filter((feature) => !used.has(feature));
    console.log(
      `FEATURES used=${String(used.size)} of ${String(FEATURE_IDS.length)} unused=${unused.join(',')}`,
    );
    expect(unused).toEqual([]);
  });

  it('leaves the places that were already somewhere specific bare, on purpose', () => {
    // The starting room is deliberately an empty wall: it is the picture every plume calibration was
    // made at, and furniture in it would move the measurements other files pin. The stairwell, the
    // window, the street and the ridge each already carry a shape of their own in `kind`.
    const bare = DEFAULT_CONTENT.environments.filter((p) => !p.background.features?.length);
    expect(bare.length).toBeGreaterThanOrEqual(7);
    expect(bare.map((p) => p.id)).toContain('quiet-room');
  });
});
