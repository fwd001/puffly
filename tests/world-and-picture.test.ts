/**
 * Two of the five world events used to be a sound with no picture — SPEC.md §22, §26, and the
 * brief's 「声音是一定要跟画面连接的」.
 *
 * `SHADOW_CHANGE` wrote `world.shadow` and `SMOKE_SWIRL` wrote `smoke.turbulence`. Neither field
 * was read by the renderer, the audio engine, the HUD or the statistics: the event fired, the room
 * swell sounded, and not one pixel changed. Measuring the fields out of a running break showed they
 * are not small either — `shadow` reaches 0.30..0.77 on the shipped rods.
 *
 * A shadow now takes light away the way rain already does, folded into `world.light.ambient` in
 * the core, so the eight readers of that field (sky, windows, floor pool, bokeh, the props' key
 * light, the dust) dim together instead of each being handed a ninth subtraction to remember. The
 * dust swings wider with `smoke.turbulence`, which is what dust does when the air starts turning;
 * the plume itself is left alone, because its shape is guarded elsewhere and that field spans
 * 0.01..4.94 across the twelve rods, so folding it into the flow field would be a re-tune.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { WorldEventId, type GameStateView } from '@puffly/game-core';
import { drawBackground, drawDust } from '@puffly/game-renderer';
import { resolveLighting, SHADOW_SHARE } from '../packages/game-core/src/systems/world';
import { createViewport } from '../packages/game-renderer/src/viewport';
import { createFakeCanvas } from '../packages/game-renderer/src/__tests__/fakeCanvas';
import { harness } from '../packages/game-core/src/__tests__/harness';

const STEP = 1000 / 60;
const VIEW = createViewport({ width: 390, height: 844, dpr: 1 });
const ROOM = DEFAULT_CONTENT.environments.find((e) => e.id === 'quiet-room');

function viewWith(mutate: (view: GameStateView) => void): GameStateView {
  const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
  const view = structuredClone(h.state()) as GameStateView;
  mutate(view);
  return view;
}

/** The sky's first stop and the vignette's outer alpha, read off one painted frame. */
function readFrame(view: GameStateView): { sky: number[]; vignette: number } {
  const fake = createFakeCanvas();
  drawBackground(fake.ctx, view, VIEW);
  expect(fake.gradients.length, 'the room is painted from several gradients').toBeGreaterThan(2);
  const sky = (String(fake.gradients[0]!.stops[0]!.color).match(/\d+/g) ?? [])
    .slice(0, 3)
    .map(Number);
  const outer = String(fake.gradients[fake.gradients.length - 1]!.stops.slice(-1)[0]!.color);
  const alpha = Number((outer.match(/([\d.]+)\)$/) ?? ['', '0'])[1]);
  return { sky, vignette: alpha };
}

/** The mote centres `drawDust` asked for, in the order it draws them. */
function moteCentres(view: GameStateView): number[] {
  const fake = createFakeCanvas();
  drawDust(fake.ctx, view, VIEW, false);
  return fake.calls
    .filter((call) => call.name === 'arc')
    .flatMap((call) => [Number(call.args[0]), Number(call.args[1])]);
}

describe('a shadow passing outside takes light off the room (§22)', () => {
  it('depresses the room light only while the event is live', () => {
    expect(ROOM, 'quiet-room is in the shipped content').toBeTruthy();
    const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
    let clear: { ambient: number; base: number } | null = null;
    let shadowed: { ambient: number; base: number; shadow: number } | null = null;
    for (let i = 0; i < 60 * 200 && (!clear || !shadowed); i++) {
      h.run(STEP);
      const s = h.state();
      const base = resolveLighting(ROOM!, s.world.timeOfDay).ambient;
      if (s.world.activeEvents.length === 0 && s.world.shadow < 0.01) {
        clear = { ambient: s.world.light.ambient, base };
      }
      if (
        !shadowed &&
        s.world.activeEvents.some((e) => e.type === WorldEventId.SHADOW_CHANGE) &&
        s.world.shadow > 0.2
      ) {
        shadowed = { ambient: s.world.light.ambient, base, shadow: s.world.shadow };
      }
    }
    expect(shadowed, 'no shadow_change came live in 200 s of the shipped room').not.toBeNull();
    expect(clear, 'no quiet frame was found').not.toBeNull();
    console.log(
      `SHADOW clear ${clear!.ambient.toFixed(3)}/${clear!.base.toFixed(3)} ` +
        `shadowed ${shadowed!.ambient.toFixed(3)}/${shadowed!.base.toFixed(3)} ` +
        `at shadow=${shadowed!.shadow.toFixed(3)}`,
    );
    // Both halves, or the claim is only that one number is smaller than another.
    expect(clear!.ambient).toBeCloseTo(clear!.base, 6);
    expect(shadowed!.ambient).toBeLessThan(shadowed!.base - 0.02);
    expect(shadowed!.ambient).toBeCloseTo(
      shadowed!.base * (1 - shadowed!.shadow * SHADOW_SHARE),
      3,
    );
  });

  it('so the frame the player is actually shown closes in around the cherry', () => {
    const lit = readFrame(viewWith(() => undefined));
    const dark = readFrame(
      viewWith((v) => {
        const world = v.world as unknown as { light: { ambient: number } };
        world.light.ambient = world.light.ambient * (1 - SHADOW_SHARE);
      }),
    );
    console.log(
      `SHADOW sky ${lit.sky.join(',')} -> ${dark.sky.join(',')} ` +
        `vignette ${lit.vignette.toFixed(3)} -> ${dark.vignette.toFixed(3)}`,
    );
    // The design's frames are near-black and the exposure has a deliberate floor, so a shadow
    // barely moves the sky — the visible half of it is the vignette closing in while the cherry
    // stays lit. Measuring the sky alone would have looked like a bug in the fold.
    expect(dark.sky[0]).toBeLessThanOrEqual(lit.sky[0]);
    expect(dark.vignette).toBeGreaterThan(lit.vignette + 0.05);
  });
});

describe('a swirl of air moves the dust (§22)', () => {
  it('swings the motes further when the field says the air is turning', () => {
    const calm = viewWith((v) => {
      (v as unknown as { smoke: { turbulence: number } }).smoke.turbulence = 0;
    });
    const turning = viewWith((v) => {
      (v as unknown as { smoke: { turbulence: number } }).smoke.turbulence = 1;
    });
    // `drawDust` is a function of the state and nothing else, so the travel below cannot be a
    // dice that happened to land differently.
    expect(moteCentres(calm)).toEqual(moteCentres(calm));
    const still = moteCentres(calm);
    const churned = moteCentres(turning);
    expect(still.length).toBe(churned.length);
    expect(still.length / 2).toBeGreaterThan(8);
    let moved = 0;
    for (let i = 0; i < still.length; i += 2) {
      moved += Math.hypot(churned[i]! - still[i]!, churned[i + 1]! - still[i + 1]!);
    }
    console.log(`SWIRL mote travel=${moved.toFixed(1)}px n=${String(still.length / 2)}`);
    expect(moved).toBeGreaterThan(20);
  });
});
