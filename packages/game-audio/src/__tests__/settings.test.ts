/**
 * Settings — §8 of the contract, §26, §64: every player knob takes effect through
 * `setSettings`, and it takes effect as a ramp rather than a jump.
 */

import { describe, expect, it } from 'vitest';
import { makeSettings, makeState } from './fixture';
import { createHarness } from './harness';

const master = (h: ReturnType<typeof createHarness>) => h.ctx.param('bus:master', 'gain');

describe('settings and mixer (§26, §64)', () => {
  it('starts at the volume it was given, without ramping down from the default', () => {
    const h = createHarness({ settings: { volume: 0.42 } });
    const calls = master(h)?.calls ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('setValueAtTime');
    expect(calls[0]?.value).toBeCloseTo(0.42, 6);
    expect(h.engine.masterLevel()).toBeCloseTo(0.42, 6);
  });

  it('mutes to a genuine zero master gain', () => {
    const h = createHarness();
    h.engine.setSettings(makeSettings({ muted: true }));
    const last = master(h)?.last();
    expect(last?.value).toBe(0);
    expect(h.engine.masterLevel()).toBe(0);

    h.engine.setSettings(makeSettings({ muted: false }));
    expect(master(h)?.last()?.value).toBeCloseTo(makeSettings().volume, 6);
    expect(h.engine.masterLevel()).toBeCloseTo(makeSettings().volume, 6);
  });

  it('treats volume 0 as silence, not as "very quiet"', () => {
    const h = createHarness();
    h.engine.setSettings(makeSettings({ volume: 0 }));
    expect(master(h)?.last()?.value).toBe(0);
    expect(h.engine.masterLevel()).toBe(0);
  });

  it('ramps every change instead of stepping it (no zipper noise)', () => {
    const h = createHarness();
    for (const volume of [0.5, 0.35, 0.8, 0.1, 0.65]) {
      h.engine.setSettings(makeSettings({ volume }));
      const last = master(h)?.last();
      expect(last?.kind).toBe('setTarget');
      expect(last?.value).toBeCloseTo(volume, 6);
      expect(last?.timeConstant ?? 0).toBeGreaterThan(0.01);
    }
  });

  it('puts the ambience slider on the ambient bus, so the room obeys the player', () => {
    const h = createHarness({ settings: { ambientVolume: 0 } });
    h.frame(makeState({ ambientGain: 0.9 }));
    expect(h.ctx.param('bus:ambient', 'gain')?.last()?.value).toBe(0);
    // The bed still follows the world; it is the bus that is closed.
    expect(h.engine.bedLevel('ambient')).toBeGreaterThan(0);

    h.engine.setSettings(makeSettings({ ambientVolume: 0.6 }));
    const call = h.ctx.param('bus:ambient', 'gain')?.last();
    expect(call?.kind).toBe('setTarget');
    expect(call?.value).toBeCloseTo(0.6, 6);
  });

  it('reduced motion quietly dims detail without muting the game', () => {
    const h = createHarness();
    h.engine.setSettings(makeSettings({ reducedMotion: true }));
    expect(h.ctx.param('bus:cue', 'gain')?.last()?.value).toBeCloseTo(0.8, 6);

    h.frame(makeState({ ambientGain: 1, lit: true, brightness: 1 }));
    const ambient = h.engine.bedLevel('ambient');
    const ember = h.engine.bedLevel('ember');
    expect(ambient).toBeGreaterThan(0);
    expect(ambient).toBeLessThan(1);
    expect(ember).toBeGreaterThan(0);
    expect(ember).toBeLessThan(1);

    h.engine.setSettings(makeSettings({ reducedMotion: false }));
    h.frame(makeState({ ambientGain: 1, lit: true, brightness: 1 }));
    expect(h.engine.bedLevel('ambient')).toBeGreaterThan(ambient);
    expect(h.engine.bedLevel('ember')).toBeGreaterThan(ember);
  });

  it('exposes per-bus trims that multiply with the player volume', () => {
    const h = createHarness();
    h.engine.setBusGain('cue', 0.5);
    h.engine.setSettings(makeSettings({ volume: 0.8 }));

    expect(h.engine.busGain('cue')).toBe(0.5);
    expect(h.ctx.param('bus:cue', 'gain')?.last()?.value).toBeCloseTo(0.5, 6);
    expect(h.ctx.param('bus:master', 'gain')?.last()?.value).toBeCloseTo(0.8, 6);
    expect(h.engine.masterLevel()).toBeCloseTo(0.8, 6);
  });

  it('keeps working when settings arrive before the first gesture', () => {
    const h = createHarness({ contextOptions: { startState: 'suspended' } });
    h.engine.setSettings(makeSettings({ volume: 0.25, ambientVolume: 0.1 }));
    expect(h.engine.masterLevel()).toBeCloseTo(0.25, 6);

    h.engine.resume();
    // On the gesture the engine re-arms from the settings it was given, not from defaults.
    expect(h.ctx.param('bus:master', 'gain')?.last()?.value).toBeCloseTo(0.25, 6);
    expect(h.ctx.param('bus:ambient', 'gain')?.last()?.value).toBeCloseTo(0.1, 6);
  });
});
