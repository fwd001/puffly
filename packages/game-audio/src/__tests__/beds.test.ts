/**
 * §27: the continuous half. Beds follow state, not events, and they chase their targets with
 * ramps instead of steps.
 */

import { describe, expect, it } from 'vitest';
import { burstEvent, makeState } from './fixture';
import { FakeBuffer } from './fake-audio';
import { createHarness } from './harness';
import { bedTargets } from '../beds';

const target = (h: ReturnType<typeof createHarness>, name: string): number | undefined =>
  h.ctx.param(name, 'gain')?.lastTarget();

describe('continuous beds (§27)', () => {
  it('raises the draw bed while the puff is held and drops it after release', () => {
    const h = createHarness();
    const lit = { lit: true, brightness: 0.7, cigaretteState: 'PUFFING' } as const;

    h.frame(makeState({ ...lit, puffActive: true, intensity: 0.2 }));
    const soft = target(h, 'bed.draw.draw:level');
    expect(soft).toBeGreaterThan(0);

    h.run(120, makeState({ ...lit, puffActive: true, intensity: 0.55 }));
    const middle = target(h, 'bed.draw.draw:level');
    expect(middle).toBeGreaterThan(soft ?? 0);

    h.run(120, makeState({ ...lit, puffActive: true, intensity: 0.95 }));
    const hard = target(h, 'bed.draw.draw:level');
    expect(hard).toBeGreaterThan(middle ?? 0);

    // The filter opens with the draw as well: it is breath, not a switch.
    const cutoff = h.ctx.param('bed.draw.draw:shape', 'frequency')?.lastTarget() ?? 0;
    expect(cutoff).toBeGreaterThan(900);

    // Released: the smoke keeps moving for a moment, then the bed is gone.
    h.run(120, makeState({ ...lit, puffActive: false, intensity: 0.95, sinceReleaseMs: 200 }));
    const fading = h.ctx.param('bed.draw.draw:level', 'gain')?.lastTarget() ?? 0;
    expect(fading).toBeLessThan(hard ?? 1);
    expect(fading).toBeGreaterThan(0);

    h.run(1200, makeState({ ...lit, puffActive: false, intensity: 0.2, sinceReleaseMs: 2000 }));
    expect(target(h, 'bed.draw.draw:level')).toBe(0);
  });

  it('writes smooth ramps, never jumps, while following state', () => {
    const h = createHarness();
    for (let i = 1; i <= 6; i += 1) {
      h.run(60, makeState({ puffActive: true, intensity: i / 10, lit: true, brightness: 0.7 }));
    }
    const calls = h.ctx.param('bed.draw.draw:level', 'gain')?.calls ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const call of calls) {
      expect(call.kind).toBe('setTarget');
      expect(call.timeConstant).toBeGreaterThan(0);
    }
  });

  it('follows the flame slider of the lighter into the flame bed', () => {
    const h = createHarness();
    h.frame(makeState({ lighterEngaged: true, flame: 0 }));
    expect(target(h, 'bed.flame.flame:level')).toBe(0);

    h.run(100, makeState({ lighterEngaged: true, flame: 0.4 }));
    const low = target(h, 'bed.flame.flame:level') ?? 0;
    expect(low).toBeGreaterThan(0);

    h.run(100, makeState({ lighterEngaged: true, flame: 1 }));
    expect(target(h, 'bed.flame.flame:level') ?? 0).toBeGreaterThan(low);
  });

  it('densifies the ember bed with the cherry brightness', () => {
    const h = createHarness();
    h.frame(makeState({ lit: true, brightness: 0.15 }));
    const dim = target(h, 'bed.ember.crackle:level') ?? 0;
    expect(dim).toBeGreaterThan(0);

    h.run(150, makeState({ lit: true, brightness: 0.9, flare: 0.4 }));
    expect(target(h, 'bed.ember.crackle:level') ?? 0).toBeGreaterThan(dim);
  });

  it('keeps the room quiet: ambience is state × slider, and the bed is the state part', () => {
    const h = createHarness();
    h.frame(makeState({ ambientGain: 0.5 }));
    expect(target(h, 'bed.ambient.room:level')).toBeGreaterThan(0);

    h.run(200, makeState({ ambientGain: 1 }));
    const loud = h.ctx.param('bed.ambient.room:level', 'gain')?.lastTarget() ?? 0;
    h.run(200, makeState({ ambientGain: 0 }));
    expect(target(h, 'bed.ambient.room:level')).toBe(0);

    // The player's ambience slider lands on the ambient bus, not on the bed.
    h.engine.setSettings(h.settings);
    expect(h.ctx.param('bus:ambient', 'gain')?.lastTarget()).toBeCloseTo(
      h.settings.ambientVolume,
      6,
    );
    expect(loud).toBeGreaterThan(0);
  });

  it('re-seeds a bed instead of looping it, once it has been audible for a while', () => {
    const h = createHarness();
    // All four beds audible: draw held, flame up, cherry lit, room present.
    const state = makeState({
      puffActive: true,
      intensity: 0.5,
      lighterEngaged: true,
      flame: 0.6,
      lit: true,
      brightness: 0.6,
      ambientGain: 0.6,
    });
    h.frame(state);
    const before = h.ctx.buffers.length;
    const loopsBefore = h.ctx.sources.filter((source) => source.loop).length;
    expect(loopsBefore).toBe(4);

    // Twenty seconds of quiet frames: past the longest re-seed horizon, so every bed must move.
    for (let i = 0; i < 20; i += 1) h.run(1000, state);

    const loops = h.ctx.sources.filter((source) => source.loop);
    expect(loops.length).toBeGreaterThanOrEqual(loopsBefore + 4);
    // And the swapped-in buffers are different audio, not the same loop started again.
    const prints = loops.map((source) =>
      source.buffer instanceof FakeBuffer ? source.buffer.fingerprint() : 0,
    );
    expect(new Set(prints).size).toBe(prints.length);
    expect(h.ctx.buffers.length).toBeGreaterThan(before);
  });

  it('turns a wide timing spread into sparse repeats rather than a held loop', () => {
    const h = createHarness();
    // `room-quiet` carries an ember layer at 900ms spread: that is "a tick now and then".
    h.frame(makeState({ ambientGain: 0.8, lit: true, brightness: 0.5 }));
    expect(h.ctx.nodesNamed('cue.ember')).toHaveLength(0);

    for (let i = 0; i < 12; i += 1)
      h.run(1500, makeState({ ambientGain: 0.8, lit: true, brightness: 0.5 }));

    expect(h.ctx.nodesNamed('cue.ember').length).toBeGreaterThan(0);
  });

  it('maps state to bed levels in one pure function a test can read', () => {
    const held = bedTargets(
      makeState({ puffActive: true, intensity: 0.8, lit: true, brightness: 0.6 }),
      false,
    );
    const resting = bedTargets(
      makeState({ puffActive: false, sinceReleaseMs: 4000, lit: true, brightness: 0.6 }),
      false,
    );
    expect(held.draw.gain).toBeGreaterThan(resting.draw.gain);
    expect(held.ember.gain).toBeGreaterThan(0);

    const calm = bedTargets(makeState({ ambientGain: 0.9, lit: true, brightness: 0.8 }), true);
    expect(calm.ambient.gain).toBeLessThan(0.9);
    expect(calm.ember.gain).toBeLessThan(held.ember.gain);
  });

  it('does not let a cue storm shove the beds around', () => {
    const h = createHarness();
    const lit = makeState({ puffActive: true, intensity: 0.6, lit: true, brightness: 0.7 });
    h.frame(lit);
    const level = target(h, 'bed.draw.draw:level');

    for (let i = 0; i < 10; i += 1) {
      h.fire(burstEvent('puff', 70 + i), lit);
      h.advance(30);
    }
    h.frame(lit);
    expect(target(h, 'bed.draw.draw:level')).toBe(level);
  });
});
