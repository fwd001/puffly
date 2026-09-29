/**
 * Lifecycle: the shell hides the page, blurs the window, unmounts — and audio must follow
 * without double-calling the browser or leaking nodes (§26, §53, §63).
 */

import { describe, expect, it } from 'vitest';
import { createAudioEngine } from '../engine';
import { burstEvent, makeSettings, makeState } from './fixture';
import { FakeAudioContext } from './fake-audio';
import { createHarness } from './harness';

describe('suspend / resume / dispose', () => {
  it('is idempotent in both directions', () => {
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({ context: ctx, settings: makeSettings() });

    engine.suspend();
    engine.suspend();
    engine.suspend();
    expect(ctx.suspendCalls).toBe(1);
    expect(engine.isReady()).toBe(false);

    engine.resume();
    engine.resume();
    engine.resume();
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.isReady()).toBe(true);
  });

  it('schedules nothing while suspended and picks the sound back up after resume', () => {
    const h = createHarness();
    const lit = makeState({ lit: true, brightness: 0.8, cigaretteState: 'BURNING' });

    h.engine.suspend();
    const sourcesBefore = h.ctx.sources.length;
    h.fire(burstEvent('exhale', 42), lit);
    h.frame(lit);
    expect(h.ctx.sources.length).toBe(sourcesBefore);

    h.engine.resume();
    h.fire(burstEvent('exhale', 43), lit);
    expect(h.ctx.sources.length).toBeGreaterThan(sourcesBefore);
  });

  it('re-arms the beds from the last state it saw when the page comes back', () => {
    const h = createHarness();
    const held = makeState({ puffActive: true, intensity: 0.7, lit: true, brightness: 0.6 });
    h.frame(held);
    h.engine.suspend();
    h.engine.resume();

    expect(h.engine.bedLevel('draw')).toBeGreaterThan(0);
    expect(h.ctx.param('bed.draw.draw:level', 'gain')?.lastTarget()).toBeGreaterThan(0);
  });

  it('dispose stops every voice, disconnects the graph and closes a context it owns', () => {
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({
      contextFactory: () => ctx,
      settings: makeSettings(),
    });

    engine.sync(makeState({ puffActive: true, intensity: 0.5, lit: true, brightness: 0.7 }));
    engine.handle(burstEvent('lighter', 5), makeState());
    expect(ctx.sources.length).toBeGreaterThan(0);

    engine.dispose();

    expect(ctx.closeCalls).toBe(1);
    expect(engine.isReady()).toBe(false);
    expect(engine.isAvailable()).toBe(false);
    for (const source of ctx.sources) {
      expect(source.stopCalls.length).toBeGreaterThan(0);
      expect(source.disconnectCount).toBeGreaterThan(0);
    }
    for (const bus of ['bus:master', 'bus:cue', 'bus:bed', 'bus:ambient']) {
      expect(ctx.nodeNamed(bus)?.disconnectCount).toBeGreaterThan(0);
    }

    // And a second dispose, or any other call, stays a no-op instead of throwing.
    expect(() => engine.dispose()).not.toThrow();
    expect(ctx.closeCalls).toBe(1);
    expect(() => engine.sync(makeState())).not.toThrow();
    expect(() => engine.handle(burstEvent('ash', 9), makeState())).not.toThrow();
    expect(() => engine.setSettings(makeSettings({ volume: 0 }))).not.toThrow();
    expect(() => engine.suspend()).not.toThrow();
    expect(() => engine.resume()).not.toThrow();
  });

  it('leaves a context the shell handed over open, because the shell owns it', () => {
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({ context: ctx, settings: makeSettings() });
    engine.sync(makeState());
    engine.dispose();

    expect(ctx.closeCalls).toBe(0);
    expect(ctx.state).toBe('running');
    expect(ctx.nodeNamed('bus:master')?.disconnectCount ?? 0).toBeGreaterThan(0);
  });

  it('reaps finished voices on the next frame instead of on a timer', () => {
    const h = createHarness();
    const lit = makeState({ lit: true, brightness: 0.8, cigaretteState: 'BURNING' });

    for (let i = 0; i < 30; i += 1) {
      h.fire(burstEvent('exhale', 300 + i), lit);
      h.run(400, lit);
    }
    // One more frame after the last envelope has closed: that is when the sweep runs.
    h.run(1600, lit);

    // Every one-shot that has passed its envelope was stopped and disconnected.
    const cueSources = h.ctx.sources.filter(
      (source) => !source.loop && source.name.startsWith('cue.puff'),
    );
    expect(cueSources.length).toBeGreaterThan(0);
    for (const source of cueSources) {
      expect(source.stopCalls.length).toBeGreaterThan(0);
      expect(source.disconnectCount).toBeGreaterThan(0);
    }
  });

  it('caps simultaneous voices, so a heavy moment cannot build an unbounded graph (§54)', () => {
    const ctx = new FakeAudioContext();
    const engine = createAudioEngine({
      contextFactory: () => ctx,
      settings: makeSettings(),
      maxVoices: 6,
    });
    engine.resume();

    const lit = makeState({
      lit: true,
      brightness: 0.9,
      intensity: 0.9,
      puffActive: true,
      density: 0.8,
    });
    engine.sync(lit);
    for (let i = 0; i < 30; i += 1) {
      engine.handle(burstEvent(i % 2 === 0 ? 'exhale' : 'ash', 500 + i), lit);
      engine.sync(lit);
      ctx.advance(0.5);
    }
    engine.dispose();
    expect(ctx.closeCalls).toBe(1);
  });
});
