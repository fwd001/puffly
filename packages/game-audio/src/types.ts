/**
 * Public shapes of `@puffly/game-audio` — SPEC.md §26, §27, §45.
 *
 * The engine consumes the two halves of the core contract: discrete `EngineEvent`s
 * (§45) and a read-only state view (§48). It never writes back and never imports the
 * renderer: audio and visuals are siblings downstream of Game Core.
 */

import type {
  AudioAdapter,
  ContentLookup,
  CigaretteStateId,
  EngineEvent,
  Settings,
  SoundProfileContent,
  TimeOfDayId,
  WeatherId,
} from '@puffly/game-core';
import type { AudioContextLike } from './web-audio';

/** Which piece of content a sound belongs to (§77: content, not code, picks the voice). */
export type AudioProfileRole = 'lighter' | 'draw' | 'tray' | 'extinguish' | 'ambient';

/** Continuous beds: layers that follow state every frame instead of firing on events (§27). */
export type AudioBedId = 'draw' | 'flame' | 'ember' | 'ambient';

/** Gain stages, so a player-facing slider has something to talk to. */
export type AudioBusId = 'cue' | 'bed' | 'ambient';

/** Every discrete happening the engine can turn into sound. */
export type AudioCueId =
  | 'click'
  | 'sputter'
  | 'ignite'
  | 'draw-detail'
  | 'release'
  | 'ash'
  | 'hiss'
  | 'impact'
  | 'wind'
  | 'rain'
  | 'room'
  | 'chime';

/**
 * The slice of `GameStateView` audio listens to (§48: adapters read, never write).
 *
 * Declared as a supertype of the full view on purpose: the engine accepts a real
 * `GameStateView`, and a test (or a future desktop shell) may hand over just these
 * fields. `AudioEngine.sync()` runs every animation frame, which is what §27 asks for —
 * ambience is a state follower, not an event listener.
 */
export interface AudioStateSlice {
  readonly nowMs: number;
  readonly cigarette: {
    readonly state: CigaretteStateId;
    readonly soundProfileId: string;
    readonly rodRemaining: number;
    readonly ember: {
      readonly brightness: number;
      readonly flare: number;
      readonly lit: boolean;
    };
    readonly puff: {
      readonly active: boolean;
      readonly intensity: number;
      readonly progress: number;
      readonly sinceReleaseMs: number;
    };
    readonly ash: { readonly ratio: number; readonly ready: boolean };
    readonly extinguishProgress: number;
    readonly discardProgress: number;
  };
  readonly smoke: {
    readonly density: number;
    readonly turbulence: number;
    readonly riseSpeed: number;
    readonly emissionRate: number;
  };
  readonly world: {
    readonly environmentId: string;
    readonly timeOfDay: TimeOfDayId;
    readonly weather: WeatherId;
    readonly wind: number;
    readonly ambientGain: number;
    readonly light: { readonly ambient: number; readonly flash: number };
  };
  readonly ashtray: {
    readonly typeId: string;
    readonly soundProfileId: string;
    readonly extinguishProfileId: string;
  };
  readonly lighter: {
    readonly typeId: string;
    readonly engaged: boolean;
    readonly flame: number;
    readonly sputter: number;
  };
  readonly ui: { readonly sessionActive: boolean };
  readonly environment: {
    readonly ambientAudio: {
      readonly profileId: string;
      readonly gain: number;
      readonly pan: number;
    };
  };
}

export interface AudioEngineOptions {
  /**
   * A live context to build on. Handy for tests and for a shell that shares one context
   * with the renderer's future audio. Omit it and the engine creates its own.
   */
  context?: AudioContextLike;
  /** Factory used when no `context` was handed over; default is the browser's own. */
  contextFactory?: () => AudioContextLike;
  /** Content: either Game Core's lookup or a flat list of profiles. Never throws (§63). */
  content?: ContentLookup | readonly SoundProfileContent[];
  /** Settings in force at construction; later changes go through `setSettings`. */
  settings?: Settings;
  /** Force a profile per role, bypassing whatever the state points at. */
  profileIds?: Partial<Record<AudioProfileRole, string>>;
  /** Ceiling on simultaneous one-shot voices (§54 budget). */
  maxVoices?: number;
  /** Seed for the variation stream: pitch spread, jitter, buffer contents (§26). */
  variationSeed?: number;
}

/**
 * What the web shell holds. Extends `AudioAdapter`, so it can be handed to anything that
 * only knows the core contract, and adds the frame-rate half audio needs (§27).
 */
export interface AudioEngine extends AudioAdapter {
  /** Discrete cues from the core event stream. Safe on a dead engine (§63). */
  handle(event: EngineEvent, state: AudioStateSlice): void;
  /** Continuous following: call once per animation frame with the live view. */
  sync(state: AudioStateSlice): void;
  setSettings(settings: Settings): void;
  /** Page hidden / tab blurred. Idempotent. */
  suspend(): void;
  /** Must be called from a user gesture the first time (browser autoplay policy). */
  resume(): void;
  dispose(): void;
  /** False when the platform has no usable Web Audio at all (§63). */
  isAvailable(): boolean;
  /** True once the context is running and voices can actually be scheduled. */
  isReady(): boolean;
  /** 0..1 resolved master level, for the shell's speaker glyph (§63: no text needed). */
  masterLevel(): number;
  /** Per-bus trim, multiplied with the player's volume rather than replacing it. */
  setBusGain(bus: AudioBusId, value: number): void;
  busGain(bus: AudioBusId): number;
  /** Currently targeted value of a bed's gain, for debugging and tests. */
  bedLevel(bed: AudioBedId): number;
  /** Cue routing exposed for the shell's own preview buttons; pure, no side effects. */
  cueForEvent(event: EngineEvent): readonly AudioCueId[];
}
