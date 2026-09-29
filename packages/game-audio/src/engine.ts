/**
 * The audio engine — SPEC.md §26, §27, §45, §54, §63.
 *
 * Two halves, exactly like the rest of the model:
 *  - `handle(event, state)` turns the core's discrete events into synthesised cues, each with
 *    its own pitch spread, timing jitter, gain jitter and a freshly generated noise buffer, so
 *    nothing in the game ever sounds like a mechanical button (§26).
 *  - `sync(state)` runs every animation frame and chases the continuous beds — the draw that
 *    breathes with `puff.intensity`, the flame that follows `lighter.flame`, the crackle whose
 *    density follows `ember.brightness`, the room that follows `world.ambientGain` (§27).
 *
 * Every public entry point is guarded. A context that is missing, blocked, suspended by the
 * autoplay policy or that throws mid-schedule leaves the game running in silence instead of
 * reaching the player as text (§63).
 */

import { clamp, clamp01, createRng, normalizeSeed, type Rng } from '@puffly/shared';
import {
  createDefaultSettings,
  type AudioLayer,
  type AudioVoiceId,
  type EngineEvent,
  type Settings,
} from '@puffly/game-core';
import { BedController, bedTargets } from './beds';
import type { BedBus, BedSource, GrooveHost } from './beds';
import { CUE_MIN_GAP_MS, cueIdsFor, planCues } from './cues';
import type { PlannedCue } from './cues';
import { createProfileStore } from './profiles';
import type { ProfileStore } from './profiles';
import { createSilentAudioEngine } from './silent';
import type {
  AudioBedId,
  AudioBusId,
  AudioCueId,
  AudioEngine,
  AudioEngineOptions,
  AudioProfileRole,
  AudioStateSlice,
} from './types';
import { fireVoice } from './voices';
import type { VoiceHandle } from './voices';
import { CONTEXT_CLOSED, acquireContext, dispatch, isContextRunning } from './web-audio';
import type { AudioContextLike, AudioGainLike, AudioParamLike } from './web-audio';

/** Fixed order, so a cue's seed can be mixed with a voice's index deterministically. */
const VOICE_ORDER: readonly AudioVoiceId[] = [
  'click',
  'flame',
  'draw',
  'crackle',
  'ember',
  'puff',
  'hiss',
  'ash',
  'wind',
  'rain',
  'room',
  'city',
  'chime',
];

/** Which stage a cue belongs to: background swells obey the ambience slider (§27). */
const CUE_BUS: Record<AudioCueId, AudioBusId> = {
  click: 'cue',
  sputter: 'cue',
  ignite: 'cue',
  // On the bed bus it summed with the draw bed itself, so inhaling was twice as loud as
  // the breath that follows it.
  'draw-detail': 'cue',
  release: 'cue',
  ash: 'cue',
  hiss: 'cue',
  impact: 'cue',
  wind: 'ambient',
  rain: 'ambient',
  room: 'ambient',
  chime: 'cue',
};

const BED_ROLE: Record<AudioBedId, AudioProfileRole> = {
  draw: 'draw',
  flame: 'lighter',
  ember: 'draw',
  ambient: 'ambient',
};

/**
 * Which voices may hold a bed. The draw bed takes the cigarette's profile, the flame bed the
 * lighter's, the ember bed the crackle in the profile, the ambient bed whatever the environment
 * points at — so content alone changes how the world sounds (§77).
 */
const BED_VOICES: Record<AudioBedId, readonly AudioVoiceId[]> = {
  draw: ['draw', 'puff'],
  flame: ['flame', 'crackle'],
  ember: ['crackle', 'ember', 'ash'],
  ambient: ['room', 'city', 'wind', 'rain', 'ember', 'click', 'chime', 'hiss'],
};

const DEFAULT_MAX_VOICES = 24;
/** How fast the master and bus gains chase the player's sliders — smooth, never zipper. */
const MASTER_TC = 0.05;
const BUS_TC = 0.08;
/** One frame's worth of lookahead so a cue is never scheduled in the past. */
const LEAD_SEC = 0.004;

const voiceIndex = (voice: AudioVoiceId): number => {
  const found = VOICE_ORDER.indexOf(voice);
  return found < 0 ? VOICE_ORDER.length : found;
};

class LiveAudioEngine implements AudioEngine, GrooveHost {
  private readonly context: AudioContextLike;
  private readonly owned: boolean;
  private readonly store: ProfileStore;
  private readonly stream: Rng;
  private readonly master: AudioGainLike;
  private readonly buses: Record<AudioBusId, AudioGainLike>;
  private readonly beds: BedController;
  private readonly active: VoiceHandle[] = [];
  private readonly lastCueAt = new Map<AudioCueId, number>();
  private readonly trims: Record<AudioBusId, number> = { cue: 1, bed: 1, ambient: 1 };
  private readonly maxVoices: number;
  private settings: Settings;
  private lastState: AudioStateSlice | null = null;
  private running: boolean;
  private disposed = false;
  private dead = false;
  private triggers = 0;
  private masterTarget = 0;

  constructor(context: AudioContextLike, owned: boolean, options: AudioEngineOptions) {
    this.context = context;
    this.owned = owned;
    this.settings = options.settings ?? createDefaultSettings(Date.now());
    this.store = createProfileStore(options.content, options.profileIds ?? {});
    this.stream = createRng(normalizeSeed(options.variationSeed ?? 0x9e3779b9));
    this.maxVoices = Math.round(clamp(options.maxVoices ?? DEFAULT_MAX_VOICES, 4, 96));

    this.master = this.gain('bus:master', 0);
    this.master.connect(context.destination);
    this.buses = {
      cue: this.gain('bus:cue', 1),
      bed: this.gain('bus:bed', 1),
      ambient: this.gain('bus:ambient', 1),
    };
    for (const bus of Object.values(this.buses)) bus.connect(this.master);

    this.beds = new BedController({
      context,
      bedBus: this.buses.bed,
      ambientBus: this.buses.ambient,
      rng: this.stream,
      host: this,
    });

    this.running = isContextRunning(context);
    this.applySettings(false);
  }

  // ---------------------------------------------------------------- AudioAdapter

  handle(event: EngineEvent, state: AudioStateSlice): void {
    if (!this.usable()) return;
    this.lastState = state;
    this.guard(() => {
      this.followUp();
      if (!this.running) {
        // The tap that unlocks the context is also the event that should be heard. `resume()`
        // is async, so keep the last few and play them the moment the context is really up.
        if (this.pending.length < MAX_PENDING_EVENTS) this.pending.push({ event, state });
        return;
      }
      // Refresh the continuous half first: a cue's loudness is judged against what is
      // already sounding, not against whatever the previous frame saw.
      this.updateContinuous(state);
      this.drainPending();
      this.planAndFire(event, state);
    });
  }

  sync(state: AudioStateSlice): void {
    if (!this.usable()) return;
    this.lastState = state;
    this.guard(() => {
      this.followUp();
      if (!this.running) return;
      this.updateContinuous(state);
    });
  }

  setSettings(settings: Settings): void {
    if (this.disposed) return;
    this.settings = settings;
    if (!this.usable()) return;
    this.guard(() => {
      this.applySettings(true);
      if (this.running && this.lastState) this.updateContinuous(this.lastState);
    });
  }

  suspend(): void {
    if (!this.usable() || !this.running) return;
    this.guard(() => {
      dispatch(this.context.suspend());
      this.running = false;
    });
  }

  /**
   * Safe to call from every pointer-down the shell forwards. The first call is the one the
   * browser's autoplay policy has been waiting for; the rest are no-ops (§6 of the contract).
   */
  resume(): void {
    if (!this.usable()) return;
    this.guard(() => {
      if (this.context.state === CONTEXT_CLOSED) {
        this.dead = true;
        return;
      }
      if (!this.running) dispatch(this.context.resume());
      this.followUp();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.guard(() => {
      const nowSec = this.context.currentTime;
      this.beds.dispose();
      for (const handle of this.active.splice(0)) this.reap(handle, nowSec);
      for (const bus of Object.values(this.buses)) bus.disconnect();
      this.master.disconnect();
      if (
        this.owned &&
        typeof this.context.close === 'function' &&
        this.context.state !== CONTEXT_CLOSED
      ) {
        dispatch(this.context.close());
      }
      this.running = false;
    });
  }

  // ---------------------------------------------------------------- introspection

  isAvailable(): boolean {
    return !this.dead && !this.disposed && this.context.state !== CONTEXT_CLOSED;
  }

  isReady(): boolean {
    return this.running && !this.disposed && !this.dead;
  }

  masterLevel(): number {
    return this.masterTarget;
  }

  setBusGain(bus: AudioBusId, value: number): void {
    this.trims[bus] = clamp(value, 0, 1.5);
    if (!this.usable() || !this.running) return;
    this.guard(() => this.applyBuses());
  }

  busGain(bus: AudioBusId): number {
    return this.trims[bus];
  }

  bedLevel(bed: AudioBedId): number {
    return this.beds.level(bed);
  }

  cueForEvent(event: EngineEvent): readonly AudioCueId[] {
    return cueIdsFor(event);
  }

  // ---------------------------------------------------------------- GrooveHost

  /** A sparse repeat from a looping layer (a desk tick, a distant gust) — §27, not a loop. */
  fireGroove(
    voice: AudioVoiceId,
    layer: AudioLayer,
    velocity: number,
    atSec: number,
    bus: BedBus,
  ): void {
    if (!this.running || this.disposed) return;
    this.fire(voice, layer, velocity, atSec, bus === 'ambient' ? 'ambient' : 'bed');
  }

  // ---------------------------------------------------------------- internals

  private usable(): boolean {
    return !this.disposed && !this.dead && this.context.state !== CONTEXT_CLOSED;
  }

  /** Pick up the moment the browser lets us run, then re-arm everything the state implies. */
  private followUp(): void {
    const running = isContextRunning(this.context);
    if (running && !this.running) {
      this.running = true;
      this.applySettings(false);
      if (this.lastState) this.updateContinuous(this.lastState);
      this.drainPending();
      return;
    }
    this.running = running;
  }

  /** Events that arrived while the context was still suspended, oldest first. */
  private pending: { event: EngineEvent; state: AudioStateSlice }[] = [];

  private drainPending(): void {
    if (this.pending.length === 0) return;
    const queued = this.pending;
    this.pending = [];
    for (const item of queued) this.planAndFire(item.event, item.state);
  }

  private planAndFire(event: EngineEvent, state: AudioStateSlice): void {
    const cues = planCues(event, state, this.store, {
      ambientScale: clamp01(this.settings.ambientVolume),
    });
    for (const cue of cues) this.fireCue(cue);
  }

  private guard(work: () => void): void {
    try {
      work();
    } catch {
      // §63: audio is disposable, the game is not. No console spam, no exception upward.
      this.dead = true;
      this.running = false;
    }
  }

  private gain(name: string, value: number): AudioGainLike {
    const node = this.context.createGain();
    node.name = name;
    node.gain.value = value;
    return node;
  }

  private now(): number {
    return this.context.currentTime;
  }

  /**
   * `reducedMotion` (§64) is an audio setting too: fewer details, softer tails, and a lower
   * ceiling on simultaneous voices. Mute and volume both land on the master, so a muted game is
   * genuinely silent rather than merely quiet.
   */
  private applySettings(smooth: boolean): void {
    const target = this.settings.muted ? 0 : clamp01(this.settings.volume);
    this.masterTarget = target;
    if (smooth) {
      this.chase(this.master.gain, target, MASTER_TC);
    } else {
      this.master.gain.setValueAtTime(target, this.now());
    }
    this.applyBuses(smooth ? BUS_TC : 0);
  }

  private applyBuses(timeConstant = BUS_TC): void {
    const ambient = clamp01(this.settings.ambientVolume) * this.trims.ambient;
    const cue = this.trims.cue * (this.settings.reducedMotion ? 0.8 : 1);
    const bed = this.trims.bed;
    if (timeConstant > 0) {
      this.chase(this.buses.cue.gain, cue, timeConstant);
      this.chase(this.buses.bed.gain, bed, timeConstant);
      this.chase(this.buses.ambient.gain, ambient, timeConstant);
      return;
    }
    const now = this.now();
    this.buses.cue.gain.setValueAtTime(cue, now);
    this.buses.bed.gain.setValueAtTime(bed, now);
    this.buses.ambient.gain.setValueAtTime(ambient, now);
  }

  private chase(param: AudioParamLike, value: number, timeConstant: number): void {
    param.setTargetAtTime(value, this.now(), Math.max(0.01, timeConstant));
  }

  /** The frame-rate half: four beds, each with its own driver from the live state. */
  private updateContinuous(state: AudioStateSlice): void {
    const targets = bedTargets(state, this.settings.reducedMotion);
    const now = this.now();
    this.reapExpired(now);

    for (const bed of Object.keys(BED_ROLE) as AudioBedId[]) {
      const profile = this.store.resolve(BED_ROLE[bed], state);
      const layers = profile.layers.filter((layer) => BED_VOICES[bed].includes(layer.voice));
      const source: BedSource = {
        profileId: profile.id,
        layers,
        trim: bed === 'ambient' ? clamp01(state.environment.ambientAudio.gain) : 1,
        pan: bed === 'ambient' ? clamp(state.environment.ambientAudio.pan, -1, 1) : 0,
      };
      this.beds.sync(bed, source, targets);
    }
    this.beds.tick();
  }

  /**
   * One cue, all of its layers. Rate-limited per cue id so a storm of bursts — a heavy puff
   * leaking, a big ash drop — thins out instead of turning into noise (§54, §26).
   */
  private fireCue(cue: PlannedCue): void {
    const now = this.now();
    const gap = CUE_MIN_GAP_MS[cue.cue] / 1000;
    const previous = this.lastCueAt.get(cue.cue);
    if (previous !== undefined && now - previous < gap) return;
    this.lastCueAt.set(cue.cue, now);

    const bus = CUE_BUS[cue.cue];
    const durationSec = Math.max(0.02, cue.durationMs / 1000);
    for (const layer of cue.layers) {
      this.fire(layer.voice, layer, cue.velocity, now, bus, cue.seed, durationSec);
    }
  }

  private fire(
    voice: AudioVoiceId,
    layer: AudioLayer,
    velocity: number,
    atSec: number,
    bus: AudioBusId,
    seed = this.triggers,
    durationSec = 0.4,
  ): void {
    if (layer.gain <= 0) return;
    this.triggers += 1;
    // A fresh stream per trigger: the same event twice must not produce the same sound twice,
    // and the same seed must produce the same sound again when a session is replayed (§26, §71).
    const rng = this.stream.fork(
      (seed ^ Math.imul(this.triggers, 2654435761) ^ Math.imul(voiceIndex(voice) + 1, 40503)) >>> 0,
    );

    const spread = clamp(layer.pitchSpread, 0, 12);
    const pitch = rng.range(-spread, spread);
    // Jitter is forward-only: a cue never arrives before the thing that caused it.
    const startAt =
      Math.max(atSec, this.now() + LEAD_SEC) + (layer.timingSpreadMs / 1000) * rng.next();
    const gainJitter = rng.range(0.78, 1.08);
    const loudness = clamp01(0.35 + velocity * 0.65);

    const handle = fireVoice(this.context, this.buses[bus], voice, {
      rng,
      atSec: startAt,
      gain: layer.gain * gainJitter * loudness,
      pitch,
      pan: clamp(layer.pan + rng.range(-0.12, 0.12), -1, 1),
      velocity,
      durationSec,
      seed: (seed + voiceIndex(voice)) >>> 0,
    });
    if (!handle) return;

    this.active.push(handle);
    if (this.active.length > this.maxVoices) {
      const oldest = this.active.shift();
      if (oldest) this.reap(oldest, this.now());
    }
  }

  /** No timers: voices are reaped on the next frame once their envelope has finished. */
  private reapExpired(nowSec: number): void {
    let write = 0;
    for (let read = 0; read < this.active.length; read += 1) {
      const handle = this.active[read];
      if (!handle) continue;
      if (handle.endsAtSec > nowSec) {
        this.active[write] = handle;
        write += 1;
        continue;
      }
      this.reap(handle, nowSec);
    }
    this.active.length = write;
  }

  private reap(handle: VoiceHandle, nowSec: number): void {
    for (const source of handle.sources) {
      try {
        source.stop(nowSec);
      } catch {
        /* already ended on its own */
      }
    }
    for (const node of handle.nodes) node.disconnect();
  }
}

/**
 * The only entry point the shell needs. Never throws: when the platform cannot give us audio
 * — no constructor, a blocked factory, a context that dies on construction — the caller gets
 * `createSilentAudioEngine()` and the game continues without a word (§63).
 */
/** A handful of events survives the gap between the unlocking tap and the context running. */
const MAX_PENDING_EVENTS = 3;

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const acquired = acquireContext(options.context, options.contextFactory);
  if (!acquired.context) return createSilentAudioEngine(options.settings);

  try {
    return new LiveAudioEngine(acquired.context, acquired.owned, options);
  } catch {
    return createSilentAudioEngine(options.settings);
  }
}
