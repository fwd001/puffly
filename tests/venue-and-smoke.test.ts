/**
 * 通风系数 — S21 of the deck, and the only thing a venue does that a skin is not allowed to.
 *
 * 「通风系数 0.0（完全密闭·厕所/楼道）— 1.0（强对流·户外墙边）。系数决定烟雾 alpha 衰减速率与扩散
 * 半径 … 同一个烟种在 0.05 与 0.90 的场所里可见度差 4 倍。这是本机制存在的唯一理由——它比换皮肤更能
 * 建立在场感。」
 *
 * Two halves, both measured here: the same rod has to *stay* thicker in a sealed place and it has to
 * be *carried wider* in an open one. The scale is taken from the deck's own pair of endpoints rather
 * than from zero, and the sealed end is deliberately the identity — every plume radius and every
 * plume alpha in this repository was calibrated inside a room, so a venue that is not ventilated must
 * not quietly dim the picture the calibration was made at. That is the claim the last case below is
 * for, and it is the reason `ventDraught` exists as one exported function instead of two formulas
 * that happen to agree.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, DEFAULT_IDS } from '@puffly/game-content';
import { ventDraught, type Burst, type ContentBundle, type Environment } from '@puffly/game-core';
import { createCanvasRenderer } from '../packages/game-renderer/src/renderer';
import { createFakeCanvas, fakeSprite } from '../packages/game-renderer/src/__tests__/fakeCanvas';
import { harness } from '../packages/game-core/src/__tests__/harness';

const STEP = 1000 / 60;
const FRAMES = 75;

/** The shipped ladder with one venue's ventilation rewritten — the real channel, since the core
 *  reads the number off the environment it was handed. */
function bundleWith(venue: Environment, ventilation: number): ContentBundle {
  return {
    ...DEFAULT_CONTENT,
    environments: DEFAULT_CONTENT.environments.map((e) =>
      e.id === venue.id ? { ...e, ventilation } : e,
    ),
  };
}

/** One break, painted. Returns what the core derived and what the renderer asked the canvas for. */
function paint(venue: Environment, ventilation: number) {
  const h = harness({
    content: bundleWith(venue, ventilation),
    environmentId: venue.id,
    cigaretteId: 'classic',
  });
  const pending: Burst[] = [];
  h.engine.on((event) => {
    if (event.kind === 'burst') pending.push(event.burst);
  });
  h.press('cigarette');
  h.run(1400);
  h.release('cigarette');

  const fake = createFakeCanvas();
  const renderer = createCanvasRenderer({
    ctx: fake.ctx,
    width: 390,
    height: 844,
    dpr: 1,
    sprites: {
      size: 64,
      soft: () => fakeSprite() as never,
      clear: () => undefined,
    },
    settings: {
      reducedMotion: false,
      quality: 'high',
      contrast: 'normal',
      visualCues: false,
      skin: null,
    },
  });
  for (let step = 0; step < FRAMES; step++) {
    h.run(STEP);
    for (const burst of pending.splice(0, pending.length)) {
      renderer.handleEvent({ kind: 'burst', atMs: 0, burst });
    }
    renderer.render(h.state(), STEP);
  }
  const field = h.state().smoke;
  renderer.dispose();

  // Each puff's destination width is the radius the venue helped choose; the alpha written just
  // before it is the brightness half of the same coefficient.
  const radii: number[] = [];
  const alphas: number[] = [];
  let alpha = 0;
  for (const call of fake.calls) {
    if (call.name === 'set:globalAlpha') alpha = Number(call.args[0]);
    if (call.name !== 'drawImage') continue;
    const width = Number(call.args[3]);
    if (!Number.isFinite(width) || width <= 0) continue;
    radii.push(width / 2);
    alphas.push(alpha);
  }
  const mean = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    visibility: field.visibility,
    dispersion: field.dispersion,
    drawn: radii.length,
    meanRadius: mean(radii),
    meanAlpha: mean(alphas),
  };
}

const ROOM = DEFAULT_CONTENT.environments.find((e) => e.id === 'quiet-room');
const OPEN = DEFAULT_CONTENT.environments.find((e) => e.id === 'mountain');

describe('the venue’s draught is what the smoke is made of (S21)', () => {
  it('is measured from the deck’s own endpoints, not from zero', () => {
    expect(ventDraught(0.05)).toBe(0);
    expect(ventDraught(0.9)).toBe(1);
    expect(ventDraught(0.475)).toBeCloseTo(0.5, 10);
    // Outside the scale the two ends are what they already are: no venue may push the smoke
    // brighter than a sealed room, or spread it past a forecourt.
    expect(ventDraught(0)).toBe(0);
    expect(ventDraught(1)).toBe(1);
    for (const venue of DEFAULT_CONTENT.environments) {
      const value = ventDraught(venue.ventilation);
      expect(value, `${venue.id} ventilation`).toBeGreaterThanOrEqual(0);
      expect(value, `${venue.id} ventilation`).toBeLessThanOrEqual(1);
    }
  });

  it('leaves a sealed room exactly as calibrated, and thins an open one to a quarter', () => {
    expect(ROOM, 'quiet-room is in the shipped content').toBeTruthy();
    expect(OPEN, 'mountain is in the shipped content').toBeTruthy();
    const sealed = paint(ROOM!, 0.05);
    const open = paint(OPEN!, 0.9);
    const openInSameRoom = paint(ROOM!, 0.9);
    console.log(
      `VENT sealed vis=${sealed.visibility.toFixed(4)} disp=${sealed.dispersion.toFixed(4)} ` +
        `r=${sealed.meanRadius.toFixed(2)} | open vis=${openInSameRoom.visibility.toFixed(4)} ` +
        `disp=${openInSameRoom.dispersion.toFixed(4)} r=${openInSameRoom.meanRadius.toFixed(2)} ` +
        `| shipped-top vis=${open.visibility.toFixed(4)}`,
    );
    // 4:1 is the deck's own sentence. Same venue, same rod, same seed — the only difference is the
    // one number, so the ratio is the coefficient and nothing else.
    expect(sealed.visibility / openInSameRoom.visibility).toBeGreaterThanOrEqual(3.9);
    expect(sealed.visibility / openInSameRoom.visibility).toBeLessThanOrEqual(4.1);
    // The other half of the deck's sentence, 扩散半径, is deliberately not in the simulation: it is
    // spent in the renderer, where a radius becomes pixels. `smoke.dispersion` stays what the rod
    // authored. Asserted so the split is a decision on the record and not an accident of wiring.
    expect(openInSameRoom.dispersion).toBeCloseTo(sealed.dispersion, 6);
    // The shipped ladder reaches both ends, so the mechanic is something a player can stand in.
    expect(ROOM!.ventilation).toBe(0.05);
    expect(OPEN!.ventilation).toBe(0.9);
  });

  it('spreads the puff wider in pixels, and never narrower than the room it was calibrated in', () => {
    expect(ROOM, 'quiet-room is in the shipped content').toBeTruthy();
    const sealed = paint(ROOM!, 0.05);
    expect(sealed.drawn, 'the plume was painted at all').toBeGreaterThan(100);
    // One room, one seed, one number moved. Comparing across venues would be comparing their wind
    // and their lighting too, and those change how many puffs exist and how big each one is.
    const belowScale = paint(ROOM!, 0);
    const open = paint(ROOM!, 0.9);
    const aboveScale = paint(ROOM!, 1);
    console.log(
      `VENT widths ${String(sealed.drawn)} puffs r=${sealed.meanRadius.toFixed(2)} -> ` +
        `${open.meanRadius.toFixed(2)}px, alpha=${sealed.meanAlpha.toFixed(4)} -> ` +
        `${open.meanAlpha.toFixed(4)}`,
    );
    // Below the deck's sealed floor and above its open ceiling the picture stops moving: a place
    // may not be made to draw narrower than the calibration, and no venue is a hurricane.
    expect(belowScale.meanRadius).toBeCloseTo(sealed.meanRadius, 6);
    expect(belowScale.meanAlpha).toBeCloseTo(sealed.meanAlpha, 6);
    expect(aboveScale.meanRadius).toBeCloseTo(open.meanRadius, 6);
    // 1.45:1 is the renderer's share of the coefficient, and it is the only half of S21 that pixels
    // can see — the alpha half is already in the field above.
    expect(open.meanRadius / sealed.meanRadius).toBeGreaterThanOrEqual(1.4);
    expect(open.meanRadius / sealed.meanRadius).toBeLessThanOrEqual(1.5);
    expect(open.meanAlpha).toBeLessThan(sealed.meanAlpha * 0.65);
  });

  it('is a number on the place, not a second copy of the look', () => {
    const values = DEFAULT_CONTENT.environments.map((venue) => venue.ventilation);
    // §77: a new place is one entry in this table. A table where every row says the same thing is
    // the failure mode — it would read as nine skins, which is precisely what the deck rules out.
    expect(new Set(values).size).toBeGreaterThanOrEqual(12);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(0.7);
    // The one row this whole file's numbers are measured against: every plume radius and alpha in
    // the repository was calibrated inside the room a new player is dropped into, so that room has
    // to sit on the sealed end. Move it and the picture moves with it, quietly.
    const start = DEFAULT_CONTENT.environments.find(
      (venue) => venue.id === DEFAULT_IDS.environment,
    );
    expect(start, `${DEFAULT_IDS.environment} is in the shipped content`).toBeTruthy();
    expect(ventDraught(start!.ventilation), 'the starting room is the sealed anchor').toBe(0);
  });
});
