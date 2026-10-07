/**
 * 「余烬按真实温度映射颜色：暗红 → 橙 → 白芯 → 熄灭」 — the first item on the deck's 写实 side (S7), and
 * a four-stage claim that was only ever a two-stage one.
 *
 * Two separate defects were in the way, and each needed its own half of the fix:
 *
 * 1. **the ramp's domain was wrong.** `temperature` is written into 0.4..1 (`EMBER.temperatureFloor`),
 *    so a colour mix taken on the raw number never reached its cool end: measured on a rod sitting at
 *    the mouth, the cherry's own rim was `rgb(216, 174, 126)` — pale tan, not the 橙 a 780 °C cherry
 *    is, and 暗红 was reserved for a temperature the simulation cannot write.
 * 2. **the death was a cut, not a stage.** The put-out transition zeroed `brightness`, `flare` and
 *    `glowRadius` outright, so the frame went from the extinguish flare to nothing in one step: the
 *    last colour a player ever saw was a bright orange, and 熄灭 was the absence of a cherry rather
 *    than the cooling of one.
 *
 * The fix is one shared anchor (`emberHeat`, in Core, next to `emberPresence`, because the *band* is
 * the simulation's and only the colours are the renderer's) and one deleted line in the transition.
 * What is checked here is the *sequence on the frame*, because each of the four stages is a different
 * claim and none of them implies the others.
 */

import { describe, expect, it } from 'vitest';
import type { GameStateView } from '@puffly/game-core';
import { createCanvasRenderer } from '../renderer';
import { ParticlePool } from '../particles';
import { createFakeCanvas, type FakeGradient } from './fakeCanvas';
import type { SpriteImage, SpriteProvider } from '../sprites';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

const sprites: SpriteProvider = {
  size: 64,
  soft: () => ({ width: 64, height: 64 }) as unknown as SpriteImage,
  clear: () => undefined,
};

interface Painted {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The cherry's own rim: the third stop of its core gradient, which is the pure heat colour. */
const parseColour = (value: string): Painted | null => {
  const found = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(value);
  if (!found) return null;
  return {
    r: Number(found[1]),
    g: Number(found[2]),
    b: Number(found[3]),
    a: found[4] === undefined ? 1 : Number(found[4]),
  };
};

interface Sample {
  state: string;
  temperature: number;
  lit: boolean;
  /** The cherry's heat colour as it was painted this frame, or null when nothing was drawn. */
  colour: Painted | null;
}

/** One whole break, put out on purpose, with the cherry read back off the recorder every frame. */
function walkTheCherry(): Sample[] {
  const pool = new ParticlePool(1400);
  const canvas = createFakeCanvas();
  const renderer = createCanvasRenderer({
    ctx: canvas.ctx,
    width: 390,
    height: 844,
    dpr: 1,
    sprites,
    particles: pool,
    settings: {
      reducedMotion: false,
      quality: 'high',
      contrast: 'normal',
      visualCues: false,
      realism: 0.8,
      skin: null,
    },
  });
  const h = harness();
  h.engine.on((event) => renderer.handleEvent(event));
  lit(h);

  const samples: Sample[] = [];
  const frame = (): void => {
    h.engine.advance(STEP);
    const before = canvas.gradients.length;
    const state = h.state() as GameStateView;
    renderer.render(state, STEP);
    // The core of the cherry is the three-stop gradient whose middle stop sits at 0.7; the glow's
    // stops are at 0 / 0.4 / 1 and the light pool is elsewhere again. Identified by shape, because
    // "the brightest thing in the frame" is not the cherry.
    const core: FakeGradient | undefined = canvas.gradients
      .slice(before)
      .find((gradient) => gradient.stops.length === 3 && gradient.stops[1]?.offset === 0.7);
    samples.push({
      state: state.cigarette.state,
      temperature: state.cigarette.ember.temperature,
      lit: state.cigarette.ember.lit,
      colour: parseColour(String(core?.stops[2]?.color ?? '')),
    });
  };

  h.press('cigarette');
  for (let step = 0; step < 30; step++) frame();
  h.release('cigarette');
  for (let step = 0; step < 90; step++) frame();
  h.tap('ashtray');
  // Long enough for the press, the flare, the transition and the whole fade.
  for (let step = 0; step < 200; step++) frame();

  renderer.dispose();
  return samples;
}

describe('the cherry is drawn at its temperature (S7 写实 1: 暗红 → 橙 → 白芯 → 熄灭)', () => {
  const samples = walkTheCherry();
  const drawn = samples.filter((sample) => sample.colour !== null);
  const during = (state: string): Sample[] =>
    samples.filter((sample) => sample.state === state && sample.colour !== null);

  it('reaches a white core only on the breath, and orange at rest', () => {
    const puffing = during('PUFFING');
    const resting = during('RESTING');
    expect(puffing.length, 'the session never drew an inhale').toBeGreaterThan(0);
    expect(resting.length, 'the session never drew a resting rod').toBeGreaterThan(0);
    const hottest = Math.max(...puffing.map((s) => s.colour?.g ?? 0));
    // The last frame of the rest, not the first: the moment the breath lets go the cherry is still
    // wearing its draw peak, and calling that "a resting rod" would be asking the cooling rate to be
    // instant. 90 frames of rest is long enough for the 2.4/s cool to have settled it.
    const restGreen = resting[resting.length - 1]?.colour?.g ?? 0;
    // 白芯: the green channel comes up near the red one only under the breath.
    expect(hottest, 'an inhale never reached the white core').toBeGreaterThan(180);
    // 橙: a resting cherry is orange, not the pale tan a raw-temperature mix produced (174).
    expect(restGreen, 'a resting cherry is not orange').toBeLessThan(150);
    expect(restGreen).toBeGreaterThan(60);
  });

  it('cools through 暗红 instead of switching off', () => {
    const out = during('EXTINGUISHED');
    expect(out.length, 'a put-out cherry stopped being drawn immediately').toBeGreaterThan(3);
    const coolest = Math.max(...out.map((s) => 255 - (s.colour?.g ?? 255)));
    const reddest = Math.min(...out.map((s) => s.colour?.g ?? 255));
    // 暗红 is [120, 40, 24]: a green channel down in the forties is what that looks like on a frame.
    expect(reddest, 'the death never reached dark red').toBeLessThan(70);
    expect(coolest, 'the death is not redder than the living cherry').toBeGreaterThan(120);
    // And the fade ends: the last drawn frame is dimmer than the first one after the put-out, so the
    // cherry leaves the table rather than parking a dull red dot on it.
    const firstAfter = out[0]?.colour?.a ?? 0;
    const lastOne = out[out.length - 1]?.colour?.a ?? 1;
    expect(lastOne, 'the ember never went out').toBeLessThan(firstAfter);
  });

  it('turns the same way all the way across, so a temperature between the ends means what it says', () => {
    // Sorted by the number the simulation wrote, the colour must get less red monotonically. A ramp
    // that doubled back would pass both cases above and still lie about everything between them.
    const seen: Sample[] = [];
    for (const sample of drawn) {
      if (seen.some((other) => Math.abs(other.temperature - sample.temperature) < 1e-6)) continue;
      seen.push(sample);
    }
    const byTemp = [...seen].sort((a, b) => a.temperature - b.temperature);
    for (let index = 1; index < byTemp.length; index++) {
      const before = byTemp[index - 1];
      const now = byTemp[index];
      if (!before?.colour || !now?.colour) continue;
      expect(
        now.colour.g,
        `${String(now.temperature.toFixed(3))} is hotter than ${String(
          before.temperature.toFixed(3),
        )} but redder`,
      ).toBeGreaterThanOrEqual(before.colour.g - 1);
    }
    expect(byTemp.length, 'the walk never varied the temperature').toBeGreaterThan(20);
  });

  it('is allowed to glow without being allowed to burn', () => {
    // The half that keeps the new fade inside the Frozen Core rule: the state machine, the sound of a
    // catch, and the pill's verb all read `lit`, and a dying cherry must not answer them with 点燃.
    const out = samples.filter((sample) => sample.state === 'EXTINGUISHED');
    expect(out.length).toBeGreaterThan(10);
    expect(
      out.every((sample) => sample.lit === false),
      'a put-out rod still reported itself lit',
    ).toBe(true);
    // And it was visibly there while it said that — otherwise this is the same claim as the case above
    // wearing a different hat.
    expect(out.filter((sample) => sample.colour !== null).length).toBeGreaterThan(3);
  });

  it('leaves within a breath, not within a minute', () => {
    const out = samples.findIndex((sample) => sample.state === 'EXTINGUISHED');
    expect(out, 'the rod was never put out').toBeGreaterThan(-1);
    let lastGlow = out;
    for (let index = out; index < samples.length; index++) {
      const colour = samples[index]?.colour;
      if (colour !== null && colour !== undefined && colour.a > 0.05) lastGlow = index;
    }
    const fadeMs = (lastGlow - out) * STEP;
    // Measured ~750 ms at EMBER.deathCoolRate. The bound is the failure this is guarding against:
    // a cooling rate borrowed from a resting rod (2.4/s) keeps a red dot on the table for seconds,
    // which reads as "it is still lit" to both the eye and the next feature that asks.
    expect(fadeMs, `the fade took ${String(Math.round(fadeMs))} ms`).toBeLessThan(1100);
    expect(fadeMs, 'the fade had no dark-red stage worth the name').toBeGreaterThan(200);
  });
});
