/**
 * Continuous layers — SPEC.md §27, §26, §59.
 *
 * Ambience is the half of the audio model that is *not* an event listener: the draw bed
 * breathes with `puff.intensity`, the flame bed with `lighter.flame`, the crackle density with
 * `ember.brightness`, the room with `world.ambientGain`. A bed is a looping synthesised source
 * whose gain and cutoff the engine writes every frame with `setTargetAtTime`, which is what
 * keeps the movement smooth instead of stepping (§8 of the task, §59 of the spec).
 *
 * A looping layer with a wide timing spread is content asking for something else: sparse
 * repeats (a desk tick, a distant gust). Those become retriggered one-shots whose rate follows
 * the level of the bed they hang off, so the room thins out and fills up instead of looping.
 */

import type { AudioLayer, AudioVoiceId } from '@puffly/game-core';
import { clamp, clamp01, type Rng } from '@puffly/shared';
import { SPARSE_LOOP_MS } from './profiles';
import type { BedHandle } from './voices';
import { buildBed, canBed } from './voices';
import type { AudioBedId, AudioStateSlice } from './types';
import type { AudioContextLike, AudioNodeLike, AudioParamLike } from './web-audio';

/** Who owns a bed's output: the cigarette/lighter layer, or the room around it. */
export type BedBus = 'bed' | 'ambient';

/** How fast a bed is allowed to chase its target, in seconds. */
const TIME_CONSTANT: Record<AudioBedId, number> = {
  draw: 0.045,
  flame: 0.06,
  ember: 0.16,
  ambient: 0.55,
};

/** A bed quieter than this is inaudible, so there is nothing worth re-seeding. */
const AUDIBLE = 0.004;
/** Re-seed horizon: long enough that no two listens are the same bed (§27). */
const RESEED_MIN_SEC = 7;
const RESEED_MAX_SEC = 19;

export interface BedTarget {
  /** 0..1 bed level before the layer's own gain. */
  readonly gain: number;
  /** Cutoff in Hz the bed's shaping filter chases. */
  readonly cutoff: number;
  /** The duct's formant in Hz, for the beds that have a duct. Absent means "do not move it". */
  readonly formant?: number;
}

export interface GrooveHost {
  /** Fire one sparse repeat. Implemented by the engine, which owns the buses. */
  fireGroove(
    voice: AudioVoiceId,
    layer: AudioLayer,
    velocity: number,
    atSec: number,
    bus: BedBus,
  ): void;
}

/** Which of a profile's layers hold a bed, and which ask to be repeated sparsely. */
const loops = (layers: readonly AudioLayer[]): AudioLayer[] =>
  layers.filter((layer) => layer.loop && layer.gain > 0);

/** A voice with no bed recipe (a chime, a click) can only ever be a sparse repeat. */
export const heldLayers = (layers: readonly AudioLayer[]): AudioLayer[] =>
  loops(layers).filter((layer) => canBed(layer.voice) && layer.timingSpreadMs < SPARSE_LOOP_MS);

export const sparseLayers = (layers: readonly AudioLayer[]): AudioLayer[] =>
  loops(layers).filter((layer) => !canBed(layer.voice) || layer.timingSpreadMs >= SPARSE_LOOP_MS);

interface BedEntry {
  readonly voice: AudioVoiceId;
  readonly layer: AudioLayer;
  readonly handle: BedHandle;
  nextReseedSec: number;
}

interface GrooveEntry {
  readonly voice: AudioVoiceId;
  readonly layer: AudioLayer;
  nextAtSec: number;
}

class BedGroup {
  private beds: BedEntry[] = [];
  private grooves: GrooveEntry[] = [];
  private signature = '';
  private level = 0;

  constructor(
    private readonly id: AudioBedId,
    private readonly busKind: BedBus,
    private readonly bus: AudioNodeLike,
    private readonly context: AudioContextLike,
    private readonly rng: Rng,
    private readonly host: GrooveHost,
  ) {}

  /** Rebuild only when content actually changed — a new cigarette, a new room (§77). */
  ensure(
    profileId: string,
    layers: readonly AudioLayer[],
    args: { pan: number; pitch: number },
  ): void {
    const held = heldLayers(layers);
    const repeats = sparseLayers(layers);
    const signature = [
      profileId,
      held.map((layer) => `${layer.voice}:${layer.gain.toFixed(3)}`).join(','),
      repeats.map((layer) => `${layer.voice}:${layer.gain.toFixed(3)}`).join(','),
    ].join('|');
    if (signature === this.signature) return;

    const nowSec = this.context.currentTime;
    for (const entry of this.beds) entry.handle.dispose(nowSec);
    this.beds = [];
    this.grooves = [];

    for (const layer of held) {
      const handle = buildBed(
        this.context,
        this.bus,
        layer.voice,
        {
          rng: this.rng,
          atSec: nowSec,
          // The bed's own level is written per frame; start from silence so nothing pops.
          gain: 0,
          pitch: args.pitch,
          pan: clamp(layer.pan + args.pan, -1, 1),
          velocity: 1,
          durationSec: 0,
          seed: this.rng.int(1, 0x7ffffffe),
        },
        // The bed id is in the node name: `bed.ember.crackle:level`. Diagnosing a sound in a
        // live browser then needs no logging, and a test can ask for exactly one node.
        `bed.${this.id}.${layer.voice}`,
      );
      if (!handle) continue;
      this.beds.push({
        voice: layer.voice,
        layer,
        handle,
        nextReseedSec: this.reseedHorizon(nowSec),
      });
    }

    for (const layer of repeats) {
      this.grooves.push({ voice: layer.voice, layer, nextAtSec: nowSec + this.gap(layer, 1) });
    }

    this.signature = signature;
  }

  apply(target: BedTarget, nowSec: number): void {
    this.level = clamp01(target.gain);
    for (const entry of this.beds) {
      this.ramp(entry.handle.gain, nowSec, this.level * entry.layer.gain * 0.85);
      entry.handle.cutoff.setTargetAtTime(
        clamp(target.cutoff, 24, 18000),
        nowSec,
        TIME_CONSTANT[this.id],
      );
      // Both halves have to agree: a voice built without a duct is not moved, and a target that
      // names no formant leaves the duct where its recipe put it.
      if (entry.handle.formant !== undefined && target.formant !== undefined) {
        entry.handle.formant.setTargetAtTime(
          clamp(target.formant, 24, 18000),
          nowSec,
          TIME_CONSTANT[this.id],
        );
      }
    }
  }

  /** Advance the sparse repeats; called from the engine's per-frame pass. */
  tick(nowSec: number): void {
    if (this.level <= AUDIBLE) return;
    for (const entry of this.beds) {
      if (nowSec >= entry.nextReseedSec) {
        entry.handle.reseed(this.rng);
        entry.nextReseedSec = this.reseedHorizon(nowSec);
      }
    }
    for (const groove of this.grooves) {
      if (nowSec < groove.nextAtSec) continue;
      const velocity = clamp01(this.level * groove.layer.gain * 1.4);
      this.host.fireGroove(groove.voice, groove.layer, velocity, nowSec, this.busKind);
      groove.nextAtSec = nowSec + this.gap(groove.layer, this.level);
    }
  }

  dispose(nowSec: number): void {
    for (const entry of this.beds) entry.handle.dispose(nowSec);
    this.beds = [];
    this.grooves = [];
    this.signature = '';
  }

  currentLevel(): number {
    return this.level;
  }

  private ramp(param: AudioParamLike, nowSec: number, value: number): void {
    param.setTargetAtTime(Math.max(0, value), nowSec, TIME_CONSTANT[this.id]);
  }

  /** Higher level → shorter wait: density follows the state, not a clock (§81 (8)). */
  private gap(layer: AudioLayer, level: number): number {
    const spread = Math.max(120, layer.timingSpreadMs);
    const base = (spread * 2) / Math.max(0.12, level);
    const seconds = clamp(base / 1000, 0.35, 24) * this.rng.range(0.6, 1.5);
    return seconds;
  }

  private reseedHorizon(nowSec: number): number {
    return nowSec + this.rng.range(RESEED_MIN_SEC, RESEED_MAX_SEC);
  }
}

export interface BedControllerOptions {
  readonly context: AudioContextLike;
  readonly bedBus: AudioNodeLike;
  readonly ambientBus: AudioNodeLike;
  readonly rng: Rng;
  readonly host: GrooveHost;
}

export interface BedSource {
  readonly profileId: string;
  readonly layers: readonly AudioLayer[];
  /** Bed-wide trim: an environment's own ambient gain, for instance (§23). */
  readonly trim: number;
  readonly pan: number;
}

/** The four continuous layers §27 asks for. */
const BED_IDS: readonly AudioBedId[] = ['draw', 'flame', 'ember', 'ambient'];

export class BedController {
  private readonly groups: Record<AudioBedId, BedGroup>;

  constructor(private readonly options: BedControllerOptions) {
    this.groups = {
      draw: new BedGroup('draw', 'bed', options.bedBus, options.context, options.rng, options.host),
      flame: new BedGroup(
        'flame',
        'bed',
        options.bedBus,
        options.context,
        options.rng,
        options.host,
      ),
      ember: new BedGroup(
        'ember',
        'bed',
        options.bedBus,
        options.context,
        options.rng,
        options.host,
      ),
      ambient: new BedGroup(
        'ambient',
        'ambient',
        options.ambientBus,
        options.context,
        options.rng,
        options.host,
      ),
    };
  }

  /** Rebuild a bed's graph when its content source changed, then chase the target. */
  sync(bed: AudioBedId, source: BedSource, targets: Record<AudioBedId, BedTarget>): void {
    const group = this.groups[bed];
    group.ensure(source.profileId, source.layers, { pan: source.pan, pitch: 0 });
    const target = targets[bed];
    // Spread, then override the one field the trim touches. Re-listing these fields by hand is how
    // `formant` was built, wired and then quietly dropped on its way to the graph.
    group.apply({ ...target, gain: target.gain * source.trim }, this.options.context.currentTime);
  }

  tick(): void {
    const nowSec = this.options.context.currentTime;
    for (const bed of BED_IDS) this.groups[bed].tick(nowSec);
  }

  level(bed: AudioBedId): number {
    return this.groups[bed].currentLevel();
  }

  dispose(): void {
    const nowSec = this.options.context.currentTime;
    for (const bed of BED_IDS) this.groups[bed].dispose(nowSec);
  }
}

/**
 * The state → target mapping, kept pure so a test can assert "a harder draw opens the bed"
 * without a graph. Only the *world's* own level lives here: the player's ambience slider is
 * applied to the ambient bus by the engine, so the two multiply instead of fighting.
 *
 * `reducedMotion` (§64) trims the layers a player never notices, never the cues that tell them
 * something happened.
 */
export function bedTargets(
  state: AudioStateSlice,
  reducedMotion: boolean,
): Record<AudioBedId, BedTarget> {
  const puff = state.cigarette.puff;
  const intensity = clamp01(puff.intensity);
  const flame = clamp01(state.lighter.flame);
  const ember = clamp01(state.cigarette.ember.brightness + state.cigarette.ember.flare * 0.5);
  const density = clamp01(state.smoke.density);
  const detail = reducedMotion ? 0.5 : 1;
  const ambientTrim = reducedMotion ? 0.6 : 1;

  // Release is not silence: the drawn smoke keeps moving, so the bed decays instead of stopping.
  const tail = puff.active ? 1 : clamp01(1 - puff.sinceReleaseMs / 900) * 0.45;

  return {
    draw: {
      gain: intensity * tail,
      // A deep draw is brighter air: the cutoff tracks intensity, never a fixed number.
      cutoff: 300 + intensity * 1500 + density * 260,
      // And the rod has a voice of its own above that body: the formant climbs as the pull hardens,
      // so a sip and a real draw are two different tubes rather than one tube at two volumes.
      formant: 1450 + intensity * 820 + density * 150,
    },
    flame: {
      gain: flame * (0.35 + flame * 0.65),
      cutoff: 420 + flame * 1600,
    },
    ember: {
      // The cherry does not go out when the player exhales, so this bed keeps its level and
      // only loses the *extra* air noise: `detail` is the reduced-motion trim.
      gain: ember * detail,
      cutoff: 300 + ember * 1200,
    },
    ambient: {
      gain: clamp01(state.world.ambientGain) * ambientTrim,
      cutoff: 700 + clamp01(state.world.wind) * 900 + state.world.light.ambient * 240,
    },
  };
}
