/**
 * The silent engine — SPEC.md §63.
 *
 * When the platform has no Web Audio, blocks it, or throws while we are building the graph,
 * the shell gets this instead: the same interface, every method a no-op, no console output and
 * no exception reaching the game. The player still sees and feels the whole world; audio simply
 * is not part of this particular runtime.
 */

import { clamp, clamp01 } from '@puffly/shared';
import type { Settings } from '@puffly/game-core';
import { cueIdsFor } from './cues';
import type { AudioBedId, AudioBusId, AudioEngine } from './types';

const noop = (): void => undefined;

export function createSilentAudioEngine(settings?: Settings): AudioEngine {
  let current = settings;
  const trims: Record<AudioBusId, number> = { cue: 1, bed: 1, ambient: 1 };

  return {
    handle: noop,
    sync: noop,
    setSettings: (next: Settings): void => {
      current = next;
    },
    suspend: noop,
    resume: noop,
    dispose: noop,
    isAvailable: () => false,
    isReady: () => false,
    // The glyph the shell draws still has to agree with the slider the player moved.
    masterLevel: () => (current === undefined ? 0 : current.muted ? 0 : clamp01(current.volume)),
    setBusGain: (bus: AudioBusId, value: number): void => {
      trims[bus] = clamp(value, 0, 1.5);
    },
    busGain: (bus: AudioBusId): number => trims[bus],
    bedLevel: (_bed: AudioBedId): number => 0,
    cueForEvent: (event) => cueIdsFor(event),
  };
}
