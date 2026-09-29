/**
 * `@puffly/game-audio` — the Web Audio adapter — SPEC.md §26, §27, §45, §63, §75, §86.
 *
 * Nothing here loads a file: a lighter click, a draw, an ember crackle, a gust of wind and the
 * room itself are synthesised at runtime from filtered noise and oscillators, each trigger
 * varied in pitch, timing, level and buffer contents. The ambient beds are quiet and follow
 * state, so the player feels the room instead of hearing a loop (§27, §87).
 *
 * Like every adapter package it sits downstream of Game Core: it reads `EngineEvent`s and a
 * `GameStateView`, and knows nothing about Vue, the renderer, storage or the DOM beyond the
 * Web Audio seam in `web-audio.ts` (§45, §81 (9/10/11)).
 */

export { createAudioEngine } from './engine';

export { createSilentAudioEngine } from './silent';
export { isAudioAvailable } from './web-audio';

export type {
  AcquiredContext,
  AudioBufferLike,
  AudioBufferSourceLike,
  AudioContextLike,
  AudioFilterLike,
  AudioGainLike,
  AudioNodeLike,
  AudioOscillatorLike,
  AudioParamLike,
  AudioPannerLike,
  AudioScheduledSourceLike,
} from './web-audio';

export type {
  AudioBedId,
  AudioBusId,
  AudioCueId,
  AudioEngine,
  AudioEngineOptions,
  AudioProfileRole,
  AudioStateSlice,
} from './types';

export { CUE_MIN_GAP_MS, cueIdsFor, planCues } from './cues';
export type { PlannedCue } from './cues';

export { VOICE_DEFAULTS, SPARSE_LOOP_MS, createProfileStore, selectLayers } from './profiles';
export type { ProfileStore, ResolvedProfile } from './profiles';

export { BedController, bedTargets } from './beds';
export type { BedBus, BedSource, BedTarget, GrooveHost } from './beds';

export { canBed, fireVoice, buildBed, semitone } from './voices';
export type { BedHandle, VoiceArgs, VoiceHandle } from './voices';

export { createNoiseBuffer } from './noise';
export type { NoiseFlavor, NoiseSpec } from './noise';
