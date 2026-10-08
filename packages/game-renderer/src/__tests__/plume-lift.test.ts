/**
 * 「吐烟的烟羽整体偏亮一档，让用户看清自己造出的形状」 — the deck's fifth cartoon item, and the one
 * the 写实度 row also governs.
 *
 * The reason it needed doing is measurable rather than stylistic. Game Core authors the breath at
 * `0.08 + 0.1 × intensity` and the smouldering thread at a flat `0.18` (`systems/emissions.ts`), so
 * before any lifting the shape the *player* made was the dimmer of the two things on screen — the deck
 * asks for the opposite, because the breath is the one cloud that answers to the hand.
 *
 * The lift lives where a plume's kind is still known: at intake. `drawSmoke` cannot tell a breath from
 * a thread (a particle carries no kind, and adding one would change the field list §15 names), and
 * putting the number in Game Core would let a presentation dial reach the simulation.
 *
 * Three things have to stay true at once, and each fails on its own: the breath gets brighter, nothing
 * else does, and "brighter" is not "opaque" — the fog this file's predecessors removed was made of
 * wide, bright lobes, and a lift is exactly how that comes back.
 */

import { describe, expect, it } from 'vitest';
import type { BurstKind, GameStateView } from '@puffly/game-core';
import { createCanvasRenderer, DECK_SPLIT } from '../renderer';
import { ParticlePool } from '../particles';
import { createFakeCanvas } from './fakeCanvas';
import type { SpriteImage, SpriteProvider } from '../sprites';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const STEP = 1000 / 60;

const sprites: SpriteProvider = {
  size: 64,
  soft: () => ({ width: 64, height: 64 }) as unknown as SpriteImage,
  clear: () => undefined,
};

interface Plume {
  /** The brightest single smoke disc the frame was asked to paint. */
  peak: number;
  /** The mean over every smoke disc drawn. */
  mean: number;
  /** Discs drawn. A cull at `alpha <= 0.004` means this can grow when the air gets brighter. */
  discs: number;
  /** The most air held in the pool at once: the thing the lift must not change. */
  air: number;
}

/**
 * One whole breath, drawn by the renderer with the air it owns handed in, keeping only `only` kind of
 * burst — so every smoke disc in the recording belongs to that kind.
 *
 * A smoke disc is identified by its own call shape, not by its value: every particle's alpha is
 * followed by `save` and a translate onto its centre, which nothing else in the frame does — not the
 * pass-end reset to full opacity, not the char line's grains (`props.ts:613`). Two earlier versions of
 * this ruler were wrong in opposite directions: sorting by value reported the same 0.6876 peak for
 * every kind (that is the char grain), and culling `>= 0.999` threw away the saturated discs a
 * too-strong lift is supposed to be caught by. Reading the next call answers both.
 */
function plume(realism: number, only: BurstKind): Plume {
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
      realism,
      skin: null,
    },
  });
  const h = harness();
  h.engine.on((event) => {
    if (event.kind === 'burst' && event.burst.kind === only) renderer.handleEvent(event);
  });
  lit(h);

  let peak = 0;
  let sum = 0;
  let discs = 0;
  let air = 0;
  const collect = (): void => {
    const before = canvas.calls.length;
    renderer.render(h.state() as GameStateView, STEP);
    const calls = canvas.calls.slice(before);
    for (let index = 0; index < calls.length; index++) {
      const call = calls[index];
      if (call?.name !== 'set:globalAlpha') continue;
      if (calls[index + 1]?.name !== 'save') continue;
      const value = Number(call.args[0]);
      if (value <= 0.004) continue;
      peak = Math.max(peak, value);
      sum += value;
      discs += 1;
    }
    air = Math.max(air, pool.size);
  };

  h.press('cigarette');
  for (let step = 0; step < Math.round(1400 / STEP); step++) {
    h.engine.advance(STEP);
    collect();
  }
  h.release('cigarette');
  for (let step = 0; step < Math.round(2600 / STEP); step++) {
    h.engine.advance(STEP);
    collect();
  }
  renderer.dispose();
  return { peak, mean: discs > 0 ? sum / discs : 0, discs, air };
}

describe('the breath is the thing you are meant to see (S7: 吐烟的烟羽整体偏亮一档)', () => {
  const shippedBreath = plume(DECK_SPLIT, 'exhale');
  const shippedThread = plume(DECK_SPLIT, 'drift');
  const realBreath = plume(1, 'exhale');
  const realThread = plume(1, 'drift');

  it("lifts the player's own cloud above the rod's thread, and leaves it alone at 写实", () => {
    expect(shippedBreath.discs, 'no breath was ever drawn').toBeGreaterThan(0);
    // The defect this file exists for: at the physical end the breath is still the dimmer of the two,
    // which is exactly what the core's two authored numbers make it.
    expect(realBreath.peak, 'the lift was already in the core').toBeLessThanOrEqual(
      realThread.peak,
    );
    expect(shippedBreath.peak, 'the breath never got its step').toBeGreaterThan(shippedThread.peak);
    // The step is the dial's doing, and only the breath's.
    expect(shippedBreath.peak / realBreath.peak).toBeGreaterThan(1.2);
    expect(shippedThread.peak).toBe(realThread.peak);
  });

  it('lifts by a step, not by a flood', () => {
    // Measured at the shipped detent: the breath's brightest disc goes from 0.0758 to 0.1137 — half a
    // step of light. The band is what makes this a claim rather than a tautology: a lift of 0 leaves
    // the ratio at 1 and a lift of 6 pushes it to 7, and both are red here. (A cap on one disc's alpha
    // would not have caught the second: even at that runaway value the brightest disc measured 0.53,
    // because `PUFF_ALPHA` 0.62 and the visibility term multiply before anyone can see it.)
    expect(shippedBreath.peak / realBreath.peak).toBeLessThan(2);
    // And the cartoon end is bounded by the same arithmetic: twice the physical brightness at the row's
    // lowest setting, never a third of a white wall.
    const cartoon = plume(0, 'exhale');
    expect(cartoon.peak / realBreath.peak).toBeGreaterThan(1.5);
    expect(cartoon.peak / realBreath.peak).toBeLessThan(2.5);
  });

  it('lifts the breath and nothing else', () => {
    // 吐烟 is the player's cloud. The thread, the cherry's ribbon and the material bursts keep the
    // brightness Game Core gave them — otherwise the row would be a global exposure slider and the
    // rod's own picture would change with it.
    //
    // The budget is stated because the four kinds are four full plume simulations: alone this case
    // runs in 925 ms, and in a whole-suite run — where every worker is busy at once — the 5 s default
    // has been measured past. A green build that turns red because the machine is loaded is a red
    // nobody can read.
    for (const kind of ['drift', 'puff', 'ash', 'extinguish'] as const) {
      const real = plume(1, kind);
      const shipped = plume(DECK_SPLIT, kind);
      expect(shipped.peak, `${kind} peak`).toBe(real.peak);
      expect(Number(shipped.mean.toFixed(8)), `${kind} mean`).toBe(Number(real.mean.toFixed(8)));
      expect(shipped.discs, `${kind} discs`).toBe(real.discs);
    }
  }, 20_000);

  it('buys visibility with alpha only — the same air, not more of it', () => {
    expect(shippedBreath.air, 'the lift also spawned particles').toBe(realBreath.air);
    // A cull at `alpha <= 0.004` is the one legitimate way the drawn count can grow, and it is worth
    // naming rather than hiding: a lift that doubled the discs would be denser smoke, not brighter
    // smoke. Measured: the step adds a few per cent of already-born air to the visible set.
    expect(shippedBreath.discs).toBeGreaterThanOrEqual(realBreath.discs);
    expect(shippedBreath.discs / realBreath.discs).toBeLessThan(1.1);
  });
});
