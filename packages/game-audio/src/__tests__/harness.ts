/**
 * Wiring for the audio tests: a recording fake context plus an engine pointed at fixture
 * content. Nothing here reaches for a browser — `AudioContext` does not exist in this
 * environment, which is exactly the case the fake exists for (§72).
 */

import { createAudioEngine } from '../engine';
import { PROFILES, makeSettings, makeState } from './fixture';
import type { AudioStateSlice } from '../types';
import type { EngineEvent, Settings, SoundProfileContent } from '@puffly/game-core';
import { FakeAudioContext } from './fake-audio';
import type { FakeContextOptions } from './fake-audio';

export interface AudioHarness {
  readonly ctx: FakeAudioContext;
  readonly engine: ReturnType<typeof createAudioEngine>;
  readonly settings: Settings;
  /** One animation frame of the continuous half. */
  frame: (state?: AudioStateSlice) => void;
  /** One discrete event, with the state that was live when it happened. */
  fire: (event: EngineEvent, state?: AudioStateSlice) => void;
  /** Move the clock the engine schedules against. */
  advance: (ms: number) => void;
  /** Advance and sync in one step, which is what a real frame does. */
  run: (ms: number, state?: AudioStateSlice) => void;
}

export interface HarnessOptions {
  readonly context?: FakeAudioContext;
  readonly contextOptions?: FakeContextOptions;
  readonly profiles?: readonly SoundProfileContent[];
  readonly settings?: Partial<Settings>;
  readonly state?: AudioStateSlice;
  readonly variationSeed?: number;
}

export function createHarness(options: HarnessOptions = {}): AudioHarness {
  const ctx = options.context ?? new FakeAudioContext(options.contextOptions);
  const settings = makeSettings(options.settings);
  const engine = createAudioEngine({
    context: ctx,
    content: options.profiles ?? PROFILES,
    settings,
    variationSeed: options.variationSeed ?? 4242,
  });

  let current = options.state ?? makeState();

  return {
    ctx,
    engine,
    settings,
    frame: (state) => {
      current = state ?? current;
      engine.sync(current);
    },
    fire: (event, state) => {
      current = state ?? current;
      engine.handle(event, current);
    },
    advance: (ms) => ctx.advance(ms / 1000),
    run: (ms, state) => {
      ctx.advance(ms / 1000);
      current = state ?? current;
      engine.sync(current);
    },
  };
}
