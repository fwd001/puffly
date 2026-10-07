/**
 * §63: audio is the layer that is allowed to be missing.
 *
 * No AudioContext, a blocked constructor, a Web Audio implementation that throws, or a context
 * the browser keeps suspended for the autoplay policy — in every one of those cases the engine
 * must be silent, must not throw upward, and must not write to the console.
 */

import { describe, expect, it, vi } from 'vitest';
import { createAudioEngine } from '../engine';
import { createSilentAudioEngine } from '../silent';
import { isAudioAvailable } from '../web-audio';
import type { AudioEngine } from '../types';
import { burstEvent, everyEvent, makeBurst, makeSettings, makeState } from './fixture';
import { FakeAudioContext } from './fake-audio';

describe('degrading to silence (§63)', () => {
  it('reports the platform honestly: this Node test environment has no AudioContext', () => {
    expect(isAudioAvailable()).toBe(false);
    expect(typeof (globalThis as { AudioContext?: unknown }).AudioContext).toBe('undefined');
  });

  it('returns a silent engine when the platform has no Web Audio at all', () => {
    const engine = createAudioEngine({ settings: makeSettings() });

    expect(engine.isAvailable()).toBe(false);
    expect(engine.isReady()).toBe(false);

    for (const event of everyEvent()) {
      expect(() => engine.handle(event, makeState())).not.toThrow();
    }
    expect(() => {
      engine.sync(makeState());
      engine.setSettings(makeSettings({ volume: 0.2 }));
      engine.suspend();
      engine.resume();
      engine.dispose();
      engine.dispose();
    }).not.toThrow();

    // The slider still moves the glyph the shell draws, even with nothing behind it.
    expect(engine.masterLevel()).toBe(0.2);
  });

  it('swallows a context factory that throws, which is what a blocked browser does', () => {
    const engine = createAudioEngine({
      contextFactory: () => {
        throw new Error('The AudioContext was not allowed to start');
      },
    });

    expect(engine.isAvailable()).toBe(false);
    for (const event of everyEvent()) expect(() => engine.handle(event, makeState())).not.toThrow();
  });

  it('swallows a Web Audio implementation that refuses to hand out nodes', () => {
    const hostile = new FakeAudioContext({ throwOn: 'createGain' });
    const engine = createAudioEngine({ context: hostile, settings: makeSettings() });

    expect(engine.isAvailable()).toBe(false);
    expect(engine.masterLevel()).toBe(makeSettings().volume);
    expect(() => engine.sync(makeState())).not.toThrow();
    expect(() => engine.handle(burstEvent('lighter', 3), makeState())).not.toThrow();
  });

  it('stays silent until the first user gesture when the context starts suspended', () => {
    const ctx = new FakeAudioContext({ startState: 'suspended' });
    const engine = createAudioEngine({ context: ctx, settings: makeSettings() });

    expect(engine.isReady()).toBe(false);
    expect(() => engine.sync(makeState({ puffActive: true, intensity: 0.8 }))).not.toThrow();
    for (const event of everyEvent()) expect(() => engine.handle(event, makeState())).not.toThrow();

    // Nothing was scheduled: no source exists, so a resume cannot fire a backlog of clicks.
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.oscillators).toHaveLength(0);

    engine.resume();
    expect(engine.isReady()).toBe(true);
    engine.sync(makeState({ puffActive: true, intensity: 0.8 }));
    expect(ctx.sources.length).toBeGreaterThan(0);
  });

  it('drops to silence if the graph explodes mid-frame instead of throwing into the loop', () => {
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({ context: ctx, settings: makeSettings() });
    expect(engine.isReady()).toBe(true);

    // A runtime that starts refusing buffer sources after a couple: hardware that gave up.
    let calls = 0;
    const original = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      calls += 1;
      if (calls > 3) throw new Error('audio renderer died');
      return original();
    };

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let i = 0; i < 10; i += 1) {
      const event = { kind: 'burst', atMs: i * 300, burst: makeBurst('exhale', 400 + i) } as const;
      expect(() => engine.handle(event, makeState({ lit: true, brightness: 0.8 }))).not.toThrow();
      ctx.advance(0.3);
    }

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(engine.isAvailable()).toBe(false);
    expect(engine.isReady()).toBe(false);
    // And the game keeps calling it: a dead engine must stay a no-op, not throw later.
    expect(() => engine.sync(makeState())).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();
  });

  it('a runtime without buffers still plays the oscillator half of a voice', () => {
    const ctx = new FakeAudioContext({ throwOn: 'createBuffer' });
    const engine = createAudioEngine({ context: ctx, settings: makeSettings() });

    expect(() => engine.handle(burstEvent('lighter', 8), makeState())).not.toThrow();
    expect(engine.isReady()).toBe(true);
    expect(ctx.nodesNamed('cue.click').length).toBeGreaterThan(0);
  });

  it('the exported silent engine answers the same contract', () => {
    const engine: AudioEngine = createSilentAudioEngine(makeSettings({ muted: true }));
    expect(engine.isAvailable()).toBe(false);
    expect(engine.masterLevel()).toBe(0);
    expect(engine.cueForEvent({ kind: 'unlock', atMs: 0, category: 'trays', id: 'glass' })).toEqual(
      [],
    );
    // The body first, then the accent the deck pairs with it: the grains and the break are two
    // registers of one happening, and the silent engine still names both.
    expect(engine.cueForEvent(burstEvent('ash', 2))).toEqual(['ash', 'fracture']);
  });
});
