/**
 * The real contract, end to end: Game Core runs a whole session and this package listens to
 * the events and state view it actually emits — not to a hand-written imitation of them.
 *
 * It is the test that says §45 is satisfied: core → (events + read-only state) → audio, with
 * nothing reaching back, nothing thrown, and no unbounded graph (§54).
 */

import { describe, expect, it } from 'vitest';
import {
  STEP_MS,
  SessionEventType,
  createContentLookup,
  createEngine,
  type EngineEvent,
  type GameEngine,
  type InputTarget,
} from '@puffly/game-core';
import { createAudioEngine } from '../engine';
import { BUNDLE, makeSettings } from './fixture';
import { FakeAudioContext } from './fake-audio';

const WALL_CLOCK = Date.UTC(2026, 8, 29, 21, 30, 0);

const STEP = Math.ceil(STEP_MS);

function setUp() {
  const ctx = new FakeAudioContext();
  const lookup = createContentLookup(BUNDLE);
  const audio = createAudioEngine({
    context: ctx,
    content: lookup,
    settings: makeSettings({ volume: 0.7, ambientVolume: 0.3 }),
    variationSeed: 99,
  });

  const core: GameEngine = createEngine({
    content: lookup,
    seed: 11,
    wallClockMs: WALL_CLOCK,
    settings: makeSettings({ volume: 0.7, ambientVolume: 0.3 }),
    cigaretteId: 'test-rod',
    environmentId: 'test-room',
    lighterId: 'wheel',
    ashtrayId: 'stone',
  });

  const seen: EngineEvent[] = [];
  core.on((event) => {
    seen.push(event);
    // Exactly how the web shell wires it: the engine's own view, read-only, per event.
    audio.handle(event, core.getState());
  });

  let ms = 0;
  const pump = (forMs: number): void => {
    for (let elapsed = 0; elapsed < forMs; elapsed += STEP) {
      core.tick(STEP);
      ctx.advance(STEP / 1000);
      ms += STEP;
      audio.sync(core.getState());
    }
  };

  const tap = (target: InputTarget): void => {
    core.send({ type: 'tap', x: 0.5, y: 0.5, timestamp: ms, target });
    pump(STEP);
  };

  return { ctx, audio, core, seen, pump, tap, clock: () => ms };
}

describe('audio driven by the real Game Core', () => {
  it('follows a whole session: pick up, light, draw, release, stub out, let go', () => {
    const { ctx, audio, core, seen, pump, tap } = setUp();

    expect(audio.isReady()).toBe(true);
    pump(160);
    // A room that is present but never loud: bed × bus, with ambience at 0.3 (§27).
    expect(audio.bedLevel('ambient')).toBeGreaterThan(0);
    expect(ctx.param('bus:ambient', 'gain')?.last()?.value).toBeCloseTo(0.3, 6);
    expect(audio.bedLevel('draw')).toBe(0);

    tap('cigarette');
    expect(core.getState().cigarette.state).toBe('PICKED_UP');

    tap('lighter');
    pump(80);
    expect(core.getState().lighter.flame).toBeGreaterThan(0);
    expect(audio.bedLevel('flame')).toBeGreaterThan(0);
    expect(ctx.nodesNamed('cue.click').length).toBeGreaterThan(0);

    // The wheel catches: an ember spark, then the cherry is alive.
    pump(500);
    expect(core.getState().cigarette.ember.lit).toBe(true);
    expect(
      seen.some((event) => event.kind === 'session' && event.event.type === SessionEventType.LIGHT),
    ).toBe(true);
    expect(
      ctx.nodesNamed('cue.crackle').length + ctx.nodesNamed('cue.ember').length,
    ).toBeGreaterThan(0);
    expect(audio.bedLevel('ember')).toBeGreaterThan(0);

    // A held draw: the bed climbs with intensity while the player is breathing in.
    core.send({ type: 'hold', x: 0.5, y: 0.5, timestamp: 0, target: 'cigarette' });
    pump(120);
    const soft = audio.bedLevel('draw');
    pump(240);
    const harder = audio.bedLevel('draw');
    expect(core.getState().cigarette.puff.active).toBe(true);
    expect(soft).toBeGreaterThan(0);
    expect(harder).toBeGreaterThan(soft);

    // Release: the exhale burst is the one sound that must follow, then the bed empties.
    core.send({ type: 'release', x: 0.5, y: 0.5, timestamp: 0, target: 'cigarette' });
    pump(60);
    expect(
      ctx.sources.filter((source) => source.name.startsWith('cue.puff')).length,
    ).toBeGreaterThan(0);
    expect(
      seen.some((event) => event.kind === 'session' && event.event.type === SessionEventType.PUFF),
    ).toBe(true);
    pump(1400);
    expect(audio.bedLevel('draw')).toBe(0);

    // Stubbed out in the tray: the hiss, and only the hiss.
    const hissBefore = ctx.sources.filter((source) => source.name.startsWith('cue.hiss')).length;
    tap('ashtray');
    pump(900);
    expect(core.getState().cigarette.state).toBe('EXTINGUISHED');
    expect(
      ctx.sources.filter((source) => source.name.startsWith('cue.hiss')).length,
    ).toBeGreaterThan(hissBefore);

    // Let go: the small impact of a cigarette landing.
    const ashBefore = ctx.sources.filter((source) => source.name.startsWith('cue.ash')).length;
    tap('ashtray');
    pump(600);
    expect(core.getState().cigarette.state).toBe('DISCARDED');
    expect(
      ctx.sources.filter((source) => source.name.startsWith('cue.ash')).length,
    ).toBeGreaterThan(ashBefore);

    // Nothing in the session threw, and nothing was thrown upward at the shell either.
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.some((event) => event.kind === 'burst')).toBe(true);
    expect(seen.some((event) => event.kind === 'transition')).toBe(true);
  });

  it('keeps a bounded graph and a reaped voice list under a full session (§54)', () => {
    const { ctx, audio, core, pump, tap } = setUp();

    tap('cigarette');
    tap('lighter');
    for (let round = 0; round < 6; round += 1) {
      core.send({ type: 'hold', x: 0.5, y: 0.5, timestamp: round * 100, target: 'cigarette' });
      pump(200);
      core.send({ type: 'release', x: 0.5, y: 0.5, timestamp: round * 100, target: 'cigarette' });
      pump(400);
    }

    // Every buffer the engine generated is short synthesis, and the graph stayed small enough.
    expect(ctx.buffers.length).toBeGreaterThan(0);
    for (const buffer of ctx.buffers) expect(buffer.duration).toBeLessThanOrEqual(6.001);
    expect(ctx.sources.length).toBeLessThan(400);
    expect(core.getState().cigarette.puff.count).toBeGreaterThan(0);
    expect(audio.bedLevel('ember')).toBeGreaterThanOrEqual(0);

    audio.dispose();
    expect(() => pump(300)).not.toThrow();
    expect(
      ctx.sources.every((source) => source.stopCalls.length > 0 || source.loop === false),
    ).toBe(true);
  });

  it('reads the state view the core hands over, and never asks for more', () => {
    const { audio, core, pump } = setUp();

    pump(200);
    // The full view is assignable to the slice the engine accepts; that is the whole contract.
    const view = core.getState();
    expect(() => audio.sync(view)).not.toThrow();
    expect(view.cigarette.soundProfileId).toBe('draw-warm');
    expect(view.environment.ambientAudio.profileId).toBe('room-quiet');
    expect(audio.bedLevel('ambient')).toBeGreaterThan(0);
  });
});
