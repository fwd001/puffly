/**
 * The plume's focus — SPEC.md §15, §58.
 *
 * The complaint was that the smoke reads as fog and is not in focus (像雾, 没对上焦). A wisp
 * looks sharp when its own falloff is steeper than the blob it is drawn from, and the smoke
 * style's `blur` is the authored knob for that. Both halves are checked: the curve the sprite
 * bakes, and the fact that the renderer actually asks for the style's setting rather than a
 * default.
 */

import { describe, expect, it } from 'vitest';
import type { Rgb } from '@puffly/shared';
import { createDefaultSettings, createEngine, type GameStateView } from '@puffly/game-core';
import { createCanvasRenderer } from '../renderer';
import { createSpriteProvider, type SpriteContext2D, type SpriteImage } from '../sprites';
import { createFakeCanvas, fakeSprite } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

const TINT: Rgb = [210, 208, 205];

/** A sprite tile that records the gradient stops it was baked with. */
function recordingTile(stops: { offset: number; alpha: number }[]): SpriteImage {
  const gradient = {
    addColorStop(offset: number, colour: string) {
      const match = /rgba\([^)]*,\s*([\d.]+)\)/.exec(colour);
      stops.push({ offset, alpha: Number(match?.[1] ?? '0') });
    },
  };
  const context: SpriteContext2D = {
    createRadialGradient: () => gradient as unknown as CanvasGradient,
    fillStyle: '',
    fillRect: () => {},
    clearRect: () => {},
  };
  return {
    width: 64,
    height: 64,
    getContext: () => context,
  } as unknown as SpriteImage;
}

function bakedAt(blur: number): { offset: number; alpha: number }[] {
  const stops: { offset: number; alpha: number }[] = [];
  const provider = createSpriteProvider(() => recordingTile(stops), 64);
  provider.soft(TINT, blur);
  return stops;
}

/** How much of the sprite's light sits in its outer half. High means haze, low means filament. */
function outerShare(stops: { offset: number; alpha: number }[]): number {
  const total = stops.reduce((sum, stop) => sum + stop.alpha, 0);
  expect(total, 'the sprite carries light').toBeGreaterThan(0);
  const outer = stops.filter((stop) => stop.offset >= 0.6).reduce((s, stop) => s + stop.alpha, 0);
  return outer / total;
}

describe('the plume is in focus (§15)', () => {
  it('is baked with a monotone falloff, brightest at its middle', () => {
    for (const blur of [0.9, 1, 1.5]) {
      const alphas = bakedAt(blur).map((stop) => stop.alpha);
      expect(alphas.length).toBe(4);
      for (let i = 1; i < alphas.length; i++) {
        expect(
          alphas[i] ?? 0,
          `blur ${String(blur)} goes outwards and never brightens`,
        ).toBeLessThanOrEqual(alphas[i - 1] ?? 0);
      }
    }
  });

  it('a softer style puts measurably more of its light in the outer half', () => {
    const crisp = outerShare(bakedAt(0.9));
    const defaultShare = outerShare(bakedAt(1));
    const hazy = outerShare(bakedAt(1.5));
    expect(crisp).toBeLessThan(defaultShare);
    expect(defaultShare).toBeLessThan(hazy);
    // The authored range has to be visible, not a rounding error: the styles sit between 0.9 and
    // 1.5, so a spread this small would leave every rod looking the same.
    expect(hazy - crisp).toBeGreaterThan(0.05);
  });

  it('is tighter than the profile this shipped before, which is what fog was', () => {
    // The four stops the sprite used to hard-code: 0.95 / 0.5 / 0.12 / 0.
    const before = outerShare([
      { offset: 0, alpha: 0.95 },
      { offset: 0.45, alpha: 0.5 },
      { offset: 0.78, alpha: 0.12 },
      { offset: 1, alpha: 0 },
    ]);
    expect(outerShare(bakedAt(1))).toBeLessThan(before);
  });

  it('the renderer asks for the style’s own blur, not a default', () => {
    const asked: number[] = [];
    const provider = {
      size: 64,
      soft: (_tint: Rgb, blur?: number) => {
        asked.push(blur ?? -1);
        return fakeSprite(64) as never;
      },
      clear: () => {},
    };
    const view = stateWithBlur(1.37);
    const fake = createFakeCanvas();
    const renderer = createCanvasRenderer({
      ctx: fake.ctx,
      width: 390,
      height: 844,
      dpr: 2,
      sprites: provider,
      settings: {
        reducedMotion: false,
        quality: 'high',
        contrast: 'normal',
        visualCues: false,
        skin: null,
      },
    });
    renderer.handleEvent({
      kind: 'burst',
      atMs: 0,
      burst: {
        id: 'b1',
        kind: 'exhale',
        seed: 7,
        origin: { x: 0.5, y: 0.42 },
        count: 40,
        directionDeg: -90,
        spreadDeg: 24,
        speed: { min: 0.02, max: 0.06 },
        radius: { min: 0.008, max: 0.02 },
        lifeMs: { min: 2000, max: 4000 },
        alphaPeak: 0.16,
        alphaDecay: 0.7,
        rise: 0.3,
        turbulence: 0.8,
        scaleGrowth: 1.4,
        gravity: 0,
        tint: [210, 208, 205],
        heat: 0,
      },
    });
    renderer.render(view, 1000 / 60);
    renderer.dispose();

    expect(asked.length, 'the plume asked for sprites').toBeGreaterThan(0);
    for (const blur of asked) expect(blur).toBe(1.37);
  });
});

function stateWithBlur(blur: number): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 5,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  for (let frame = 0; frame < 20; frame++) engine.advance(1000 / 60);
  const copy = JSON.parse(JSON.stringify(engine.getState())) as GameStateView & {
    style: { smoke: { opacity: number; blur: number; swirl: number } };
  };
  copy.style.smoke.blur = blur;
  return copy;
}
