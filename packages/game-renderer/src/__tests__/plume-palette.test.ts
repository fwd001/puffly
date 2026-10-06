/**
 * §6.1: a skin is four colour layers, and 烟羽 is one of them — "烟雾颜色与浓度".
 *
 * These tests watch the sprites the renderer actually asks for, so they measure the plume
 * rather than the prose about it. The palette handed to the renderer changes *only* the smoke
 * layer: the other three are copied from the unskinned view, which is what makes a difference
 * here attributable to 烟羽 and not to the ember or the light pool.
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  createEngine,
  type Burst,
  type GameStateView,
  type SkinPalette,
} from '@puffly/game-core';
import type { Rgb } from '@puffly/shared';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';
import { createCanvasRenderer } from '../renderer';
import type { SpriteImage, SpriteProvider } from '../sprites';
import { createFakeCanvas, deepFreeze, fakeSprite } from './fakeCanvas';

/** 雪夜's 烟羽 from the design's skin table. */
const SNOW_PLUME: Rgb = [224, 234, 247];
const STEP_MS = 1000 / 60;

function state(): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 4242,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  for (let frame = 0; frame < 30; frame++) engine.advance(STEP_MS);
  return deepFreeze(JSON.parse(JSON.stringify(engine.getState())) as GameStateView);
}

/** A palette whose only layer worth a different name is the plume. */
function plumeOnlyPalette(view: GameStateView, plume: Rgb): SkinPalette {
  return {
    paper: view.style.cigarette.paper,
    ember: view.style.scene.ember,
    pool: view.style.scene.pool,
    smoke: plume,
  };
}

function recipe(view: GameStateView, overrides: Partial<Burst> = {}): Burst {
  return {
    id: 'burst-plume',
    kind: 'exhale',
    seed: 20260929,
    origin: { x: 0.5, y: 0.42 },
    count: 60,
    directionDeg: -90,
    spreadDeg: 60,
    speed: { min: 0.02, max: 0.09 },
    radius: { min: 0.01, max: 0.04 },
    lifeMs: { min: 2000, max: 5000 },
    alphaPeak: 0.4,
    alphaDecay: 0.7,
    rise: 0.2,
    turbulence: 1.1,
    scaleGrowth: 2.5,
    gravity: 0,
    // What the core really hands over for a breath: the smoke style's own tint.
    tint: [...view.smoke.tint] as Rgb,
    // The cherry's afterglow mixes every particle toward orange, which would be the thing
    // under measurement instead of the palette. A breathed cloud is not hot.
    heat: 0,
    ...overrides,
  };
}

/** Every colour the renderer asked a sprite for, in draw order. */
function spriteTints(view: GameStateView, palette: SkinPalette | null, burst: Burst): Rgb[] {
  const tints: Rgb[] = [];
  const provider: SpriteProvider = {
    size: 64,
    soft: (tint: Rgb) => {
      tints.push([tint[0], tint[1], tint[2]]);
      return fakeSprite(64) as unknown as SpriteImage;
    },
    clear: () => {},
  };
  const fake = createFakeCanvas();
  const renderer = createCanvasRenderer({
    ctx: fake.ctx,
    width: 390,
    height: 844,
    dpr: 1,
    sprites: provider,
    settings: {
      reducedMotion: false,
      quality: 'high',
      contrast: 'normal',
      visualCues: false,
      skin: palette,
    },
  });
  renderer.handleEvent({ kind: 'burst', atMs: 0, burst });
  renderer.render(view, STEP_MS);
  renderer.dispose();
  return tints;
}

const distance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Index-aligned because the same seed and the same state put the same particle at the same slot. */
function differences(before: Rgb[], after: Rgb[]): { index: number; from: Rgb; to: Rgb }[] {
  expect(after.length).toBe(before.length);
  const changed: { index: number; from: Rgb; to: Rgb }[] = [];
  before.forEach((tint, index) => {
    const next = after[index];
    if (!next) return;
    if (distance(tint, next) > 0.5) changed.push({ index, from: tint, to: next });
  });
  return changed;
}

describe('the 烟羽 layer (§6.1)', () => {
  it('sees the plume as a colour worth changing', () => {
    const view = state();
    // A gate that cannot fail is not a gate: the two candidate colours have to be far apart.
    expect(distance(SNOW_PLUME, view.smoke.tint)).toBeGreaterThan(30);
  });

  it('repaints the plume when the smoke layer of a skin changes', () => {
    const view = state();
    const burst = recipe(view);
    const plain = spriteTints(view, null, burst);
    const skinned = spriteTints(view, plumeOnlyPalette(view, SNOW_PLUME), burst);

    const changed = differences(plain, skinned);
    expect(changed.length).toBeGreaterThanOrEqual(20);
    // Every colour that moved, moved toward 烟羽 — a repaint, not a replacement with white.
    for (const entry of changed) {
      expect(distance(entry.to, SNOW_PLUME)).toBeLessThan(distance(entry.from, SNOW_PLUME));
    }
  });

  it('leaves the ash its own material colour', () => {
    const view = state();
    const grit = recipe(view, {
      kind: 'ash',
      id: 'burst-ash',
      count: 40,
      tint: [150, 148, 142],
    });
    const plain = spriteTints(view, null, grit);
    const skinned = spriteTints(view, plumeOnlyPalette(view, SNOW_PLUME), grit);

    // Material keeps its material: a skin may recolour the plume without turning grit blue.
    expect(plain.length).toBeGreaterThan(20);
    expect(differences(plain, skinned)).toEqual([]);
  });

  it('draws the same picture twice, so a difference above is not noise', () => {
    const view = state();
    const palette = plumeOnlyPalette(view, SNOW_PLUME);
    const burst = recipe(view);
    const first = spriteTints(view, palette, burst);
    const second = spriteTints(view, palette, burst);
    expect(differences(first, second)).toEqual([]);
  });
});
