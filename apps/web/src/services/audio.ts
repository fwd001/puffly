/**
 * Audio wiring for the web shell — SPEC.md §26, §27, §63.
 *
 * A thin, defensive bridge: the shell must never fail because sound failed. If the platform
 * has no usable Web Audio, if construction throws, or if a call dies mid-frame, the silent
 * engine takes over and the game stays complete. No dialog, no console noise, no broken start.
 */

import type { ContentLookup, EngineEvent, GameStateView, Settings } from '@puffly/game-core';
import { createAudioEngine, createSilentAudioEngine, type AudioEngine } from '@puffly/game-audio';

export interface AudioBridge {
  /** Must be called from inside a user gesture; safe to call repeatedly. */
  unlock(): void;
  setSettings(settings: Settings): void;
  handle(event: EngineEvent, state: GameStateView): void;
  sync(state: GameStateView): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
  available(): boolean;
  /**
   * Whether anything will actually be *heard*: Web Audio exists, the browser has let the context
   * run, and the master is up (mute lands there, §63). False is not an error state — autoplay
   * policy keeps it false until the first tap — but it is the state where the picture has to say
   * what the mix would have said.
   */
  audible(): boolean;
}

export function createAudioBridge(content: ContentLookup, settings: Settings): AudioBridge {
  let engine: AudioEngine;
  try {
    engine = createAudioEngine({ content, settings });
  } catch {
    engine = createSilentAudioEngine(settings);
  }

  /**
   * §63 in one line: sound is allowed to be absent, never to be fatal. A throw inside a frame
   * must not take the simulation or the canvas down with it.
   */
  const guard = (run: (target: AudioEngine) => void): void => {
    try {
      run(engine);
    } catch {
      try {
        engine = createSilentAudioEngine(settings);
      } catch {
        /* nothing left to do quietly */
      }
    }
  };

  return {
    unlock() {
      guard((target) => target.resume());
    },
    setSettings(next) {
      guard((target) => target.setSettings(next));
    },
    handle(event, state) {
      guard((target) => target.handle(event, state));
    },
    sync(state) {
      guard((target) => target.sync(state));
    },
    suspend() {
      guard((target) => target.suspend());
    },
    resume() {
      guard((target) => target.resume());
    },
    dispose() {
      guard((target) => target.dispose());
    },
    available() {
      try {
        return engine.isAvailable();
      } catch {
        return false;
      }
    },
    audible() {
      try {
        return engine.isAvailable() && engine.isReady() && engine.masterLevel() > 0.001;
      } catch {
        return false;
      }
    },
  };
}
