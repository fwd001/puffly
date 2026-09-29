/**
 * Voice synthesis — SPEC.md §26, §75, §87.
 *
 * Each `AudioVoiceId` in a `SoundProfileContent` layer is a *recipe*, not a sample: filtered
 * noise plus oscillators shaped by an envelope, built fresh for every trigger. Pitch spread,
 * timing jitter and a different noise buffer each time are what stop the game sounding like
 * a mechanical button (§26), and beds can be re-seeded under the player's ears so a room is
 * never a loop (§27).
 *
 * Two entry points share everything below:
 *  - `fireVoice()` — a one-shot cue (a click, a puff, a falling piece of ash)
 *  - `buildBed()`  — a looping bed whose gain/cutoff the engine follows from state
 */

import { clamp, type Rng } from '@puffly/shared';
import type { AudioVoiceId } from '@puffly/game-core';
import { createNoiseBuffer, type NoiseFlavor, type NoiseSpec } from './noise';
import type {
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

/** Everything a single trigger needs; derived from content + state, never hardcoded. */
export interface VoiceArgs {
  readonly rng: Rng;
  /** Context time to start at, after the layer's timing jitter (§26). */
  readonly atSec: number;
  /** 0..1, already multiplied through layer gain and cue velocity. */
  readonly gain: number;
  /** Semitone offset sampled from `layer.pitchSpread`. */
  readonly pitch: number;
  /** -1..1. */
  readonly pan: number;
  /** 0..1 how strongly the happening was. */
  readonly velocity: number;
  /** Requested length; swell recipes stretch with it, one-shots ignore it. */
  readonly durationSec: number;
  readonly seed: number;
}

export interface VoiceHandle {
  readonly endsAtSec: number;
  readonly nodes: readonly AudioNodeLike[];
  readonly sources: readonly AudioScheduledSourceLike[];
}

export interface BedHandle {
  /** Bed level: the engine writes the state-derived target here, per frame. */
  readonly gain: AudioParamLike;
  /** Tone openness in Hz: a harder draw breathes brighter. */
  readonly cutoff: AudioParamLike;
  /** Swaps the looped buffer for a freshly seeded one so an ambience never loops audibly. */
  reseed(rng: Rng): void;
  dispose(nowSec: number): void;
}

/** Envelope floor: `exponentialRampToValueAtTime` may never be given zero. */
const SILENT = 0.0008;
/** A hair of lookahead so a scheduled start is never already in the past. */
const LEAD = 0.004;
const MIN_RATE = 0.24;
const MAX_RATE = 4;
const MIN_HZ = 12;
const MAX_HZ = 20000;

export const semitone = (cents: number): number => Math.pow(2, cents / 12);

const specOf = (
  flavor: NoiseFlavor,
  seconds: number,
  density?: number,
  channels?: number,
): NoiseSpec => ({
  flavor,
  seconds,
  ...(density === undefined ? {} : { density }),
  ...(channels === undefined ? {} : { channels }),
});

/** One trigger's worth of nodes, tracked so the engine can tear the whole thing down. */
class VoiceGraph {
  private readonly nodes: AudioNodeLike[] = [];
  private readonly oneShots: AudioBufferSourceLike[] = [];
  private readonly loops: AudioBufferSourceLike[] = [];
  private readonly oscillators: AudioOscillatorLike[] = [];

  constructor(
    private readonly context: AudioContextLike,
    private readonly out: AudioNodeLike,
    readonly args: VoiceArgs,
    private readonly label: string,
  ) {}

  readonly pitched = (hz: number): number =>
    clamp(this.args.pitch !== 0 ? hz * semitone(this.args.pitch) : hz, MIN_HZ, MAX_HZ);

  /** Every frequency is nudged off-axis as well as pitched, so nothing rings pure. */
  readonly jittered = (hz: number, spread: number): number =>
    this.pitched(hz * this.args.rng.range(1 - spread, 1 + spread));

  private readonly tagged = <T extends AudioNodeLike>(node: T, suffix: string): T => {
    node.name = `${this.label}:${suffix}`;
    this.nodes.push(node);
    return node;
  };

  gain(suffix: string, value: number): AudioGainLike {
    const node = this.context.createGain();
    node.gain.value = value;
    return this.tagged(node, suffix);
  }

  filter(suffix: string, type: string, hz: number, q: number): AudioFilterLike {
    const node = this.context.createBiquadFilter();
    node.type = type;
    node.frequency.value = this.jittered(hz, 0.04);
    node.Q.value = q;
    return this.tagged(node, suffix);
  }

  /** Stereo placement, skipped on the (rare) runtime with no usable `StereoPannerNode`. */
  stage(suffix: string): AudioNodeLike {
    if (typeof this.context.createStereoPanner !== 'function') return this.out;
    let node: AudioPannerLike;
    try {
      node = this.context.createStereoPanner();
    } catch {
      // A runtime that refuses panning still gets the sound: mono is better than silence (§63).
      return this.out;
    }
    node.pan.value = clamp(this.args.pan, -1, 1);
    node.connect(this.out);
    return this.tagged(node, suffix);
  }

  /** A noise source from a buffer generated right now. `null` when the runtime refuses. */
  noise(
    suffix: string,
    spec: NoiseSpec,
    rate: number,
    loop: boolean,
  ): AudioBufferSourceLike | null {
    const buffer: AudioBufferLike | null = createNoiseBuffer(this.context, spec, this.args.rng);
    if (!buffer) return null;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    // Pitching noise through `playbackRate` is the cheapest way to make a puff or a click
    // differ in body, not just in filter colour.
    source.playbackRate.value = clamp(
      rate * semitone(this.args.pitch * (loop ? 0.4 : 1)),
      MIN_RATE,
      MAX_RATE,
    );
    this.tagged(source, suffix);
    (loop ? this.loops : this.oneShots).push(source);
    return source;
  }

  /**
   * Oscillators start the moment they are built. Their own envelope is silent until the
   * recipe opens it, which means a bed's LFO is running without the bed having to schedule
   * anything, and a cue's tone never double-starts.
   */
  tone(suffix: string, type: string, hz: number): AudioOscillatorLike | null {
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.value = this.jittered(hz, 0.03);
    this.tagged(osc, suffix);
    this.oscillators.push(osc);
    try {
      osc.start(this.context.currentTime + LEAD);
    } catch {
      /* ignore: a refused start leaves this voice silent, not broken */
    }
    return osc;
  }

  /** Low-frequency modulation written into a param: nothing here holds still (§59). */
  lfo(suffix: string, hz: number, depth: number, target: AudioParamLike): void {
    const osc = this.tone(`${suffix}.lfo`, 'sine', hz);
    if (!osc) return;
    const amount = this.gain(`${suffix}.depth`, depth);
    osc.connect(amount);
    amount.connect(target);
  }

  /** Percussive envelope: silence → peak → silence, with the attack kept audible. */
  punch(param: AudioParamLike, at: number, peak: number, attack: number, decay: number): number {
    const safePeak = Math.max(SILENT * 2, peak);
    const rise = Math.max(0.0006, attack);
    const fall = Math.max(0.004, decay);
    param.setValueAtTime(SILENT, at);
    param.linearRampToValueAtTime(safePeak, at + rise);
    param.exponentialRampToValueAtTime(SILENT, at + rise + fall);
    return at + rise + fall;
  }

  /** Slow in-out swell for wind and rain: a gust must not switch on like a light (§59). */
  swell(param: AudioParamLike, at: number, peak: number, duration: number): number {
    const safePeak = Math.max(SILENT * 2, peak);
    const length = Math.max(0.12, duration);
    param.setValueAtTime(SILENT, at);
    param.linearRampToValueAtTime(safePeak, at + length * 0.38);
    param.linearRampToValueAtTime(safePeak * 0.72, at + length * 0.66);
    param.exponentialRampToValueAtTime(SILENT, at + length);
    return at + length;
  }

  /** A looping source that plugs straight into a node the caller already wired up. */
  loopInto(
    input: AudioNodeLike,
    suffix: string,
    spec: NoiseSpec,
    rate: number,
  ): AudioBufferSourceLike | null {
    const source = this.noise(suffix, spec, rate, true);
    if (!source) return null;
    source.connect(input);
    try {
      source.start(this.context.currentTime + LEAD);
    } catch {
      /* a refused start leaves the bed silent, which is survivable (§63) */
    }
    return source;
  }

  /** One-shots are started by the recipe owner, so they can be given the cue's own start time. */
  startAll(at: number): void {
    for (const source of this.oneShots) {
      try {
        source.start(at + LEAD);
      } catch {
        /* already started or already gone */
      }
    }
  }

  /** Everything the graph started is stopped, including a bed's loop and its LFO. */
  stopAll(at: number): void {
    const stop = (source: AudioScheduledSourceLike): void => {
      try {
        source.stop(at + LEAD);
      } catch {
        /* a source that refuses to be scheduled is already finished */
      }
    };
    for (const source of this.oneShots) stop(source);
    for (const source of this.loops) stop(source);
    for (const osc of this.oscillators) stop(osc);
  }

  view(): { nodes: readonly AudioNodeLike[]; sources: readonly AudioScheduledSourceLike[] } {
    const sources: AudioScheduledSourceLike[] = [];
    for (const source of this.oneShots) sources.push(source);
    for (const osc of this.oscillators) sources.push(osc);
    return { nodes: this.nodes, sources };
  }
}

interface OneShotRecipe {
  /** Default length in seconds; some recipes stretch it with `args.durationSec`. */
  readonly seconds: number;
  readonly build: (graph: VoiceGraph, into: AudioNodeLike, peak: number, at: number) => number;
}

/**
 * One-shot recipes. Each one generates its own noise buffer through `graph.noise()`, so two
 * identical triggers are two genuinely different sounds (§26, §87).
 */
const ONE_SHOTS: Record<AudioVoiceId, OneShotRecipe> = {
  click: {
    seconds: 0.06,
    build: (graph, into, peak, at) => {
      const band = graph.filter('band', 'bandpass', graph.jittered(2600, 0.16), 1.5);
      const body = graph.filter('body', 'highpass', graph.jittered(950, 0.1), 0.7);
      const env = graph.gain('env', SILENT);
      band.connect(body);
      body.connect(env);
      env.connect(into);
      const grit = graph.noise('grit', specOf('ring', 0.05, undefined, 1), 1, false);
      if (grit) grit.connect(band);
      const tick = graph.tone('tick', 'triangle', graph.jittered(1850, 0.12));
      if (tick) {
        const tickGain = graph.gain('tick.env', SILENT);
        tick.connect(tickGain);
        tickGain.connect(into);
        graph.punch(tickGain.gain, at, peak * 0.34, 0.0008, 0.022);
      }
      return Math.max(graph.punch(env.gain, at, peak, 0.0009, 0.045), at + 0.06);
    },
  },
  flame: {
    seconds: 0.28,
    build: (graph, into, peak, at) => {
      const low = graph.filter('low', 'lowpass', graph.jittered(760, 0.2), 0.6);
      const hiss = graph.filter('hiss', 'highpass', graph.jittered(2400, 0.2), 0.5);
      const mix = graph.gain('mix', 1);
      const env = graph.gain('env', SILENT);
      low.connect(mix);
      hiss.connect(mix);
      mix.connect(env);
      env.connect(into);
      const air = graph.noise('air', specOf('white', 0.3, undefined, 1), 1, false);
      if (air) air.connect(low);
      const gas = graph.noise('gas', specOf('white', 0.22, undefined, 1), 1.4, false);
      if (gas) gas.connect(hiss);
      return Math.max(graph.punch(env.gain, at, peak, 0.014, 0.2), at + 0.24);
    },
  },
  draw: {
    seconds: 0.5,
    build: (graph, into, peak, at) => {
      const band = graph.filter('band', 'bandpass', graph.jittered(430, 0.2), 0.85);
      const air = graph.filter('air', 'highpass', graph.jittered(1500, 0.15), 0.5);
      const env = graph.gain('env', SILENT);
      band.connect(env);
      air.connect(env);
      env.connect(into);
      const breath = graph.noise('breath', specOf('pink', 0.5, undefined, 1), 1, false);
      if (breath) breath.connect(band);
      const leak = graph.noise('leak', specOf('white', 0.4, undefined, 1), 1.2, false);
      if (leak) leak.connect(air);
      return Math.max(graph.punch(env.gain, at, peak, 0.05, 0.4), at + 0.46);
    },
  },
  crackle: {
    seconds: 0.32,
    build: (graph, into, peak, at) => {
      const high = graph.filter('high', 'highpass', graph.jittered(1150, 0.2), 0.7);
      const pinch = graph.filter('pinch', 'bandpass', graph.jittered(3400, 0.2), 1.8);
      const env = graph.gain('env', SILENT);
      high.connect(env);
      pinch.connect(env);
      env.connect(into);
      const grains = graph.noise(
        'grains',
        specOf('grain', 0.3, 0.4 + graph.args.velocity * 0.5, 1),
        1,
        false,
      );
      if (grains) grains.connect(high);
      const spark = graph.noise('spark', specOf('grain', 0.2, 0.2, 1), 1.8, false);
      if (spark) spark.connect(pinch);
      return Math.max(graph.punch(env.gain, at, peak, 0.006, 0.26), at + 0.3);
    },
  },
  ember: {
    seconds: 0.2,
    build: (graph, into, peak, at) => {
      const warm = graph.filter('warm', 'lowpass', graph.jittered(520, 0.25), 0.9);
      const env = graph.gain('env', SILENT);
      warm.connect(env);
      env.connect(into);
      const rumble = graph.noise('rumble', specOf('brown', 0.22, undefined, 1), 1, false);
      if (rumble) rumble.connect(warm);
      const tick = graph.noise('tick', specOf('grain', 0.12, 0.25, 1), 2.2, false);
      if (tick) {
        const band = graph.filter('tick.band', 'bandpass', graph.jittered(2100, 0.25), 1.2);
        const tickGain = graph.gain('tick.env', SILENT);
        tick.connect(band);
        band.connect(tickGain);
        tickGain.connect(into);
        graph.punch(tickGain.gain, at, peak * 0.5, 0.001, 0.05);
      }
      return Math.max(graph.punch(env.gain, at, peak, 0.02, 0.16), at + 0.2);
    },
  },
  puff: {
    seconds: 0.42,
    build: (graph, into, peak, at) => {
      const sweep = graph.filter('sweep', 'lowpass', graph.jittered(520, 0.1), 0.8);
      const air = graph.filter('air', 'bandpass', graph.jittered(900, 0.1), 0.7);
      const env = graph.gain('env', SILENT);
      sweep.connect(env);
      air.connect(env);
      env.connect(into);
      const body = graph.noise('body', specOf('pink', 0.46, undefined, 2), 1, false);
      if (body) body.connect(sweep);
      const top = graph.noise('top', specOf('white', 0.4, undefined, 2), 1.15, false);
      if (top) top.connect(air);
      // The whoosh opens as it leaves the mouth: the cutoff rises across the envelope (§14).
      sweep.frequency.setValueAtTime(graph.jittered(320, 0.05), at + LEAD);
      sweep.frequency.linearRampToValueAtTime(graph.jittered(1450, 0.05), at + 0.3);
      return Math.max(graph.punch(env.gain, at, peak, 0.02, 0.36), at + 0.4);
    },
  },
  hiss: {
    seconds: 0.8,
    build: (graph, into, peak, at) => {
      const high = graph.filter('high', 'highpass', graph.jittered(2300, 0.15), 0.6);
      const shine = graph.filter('shine', 'bandpass', graph.jittered(5200, 0.15), 1.1);
      const env = graph.gain('env', SILENT);
      high.connect(env);
      shine.connect(env);
      env.connect(into);
      const steam = graph.noise('steam', specOf('white', 0.85, undefined, 2), 1, false);
      if (steam) steam.connect(high);
      const thin = graph.noise('thin', specOf('pink', 0.7, undefined, 1), 1.3, false);
      if (thin) thin.connect(shine);
      high.frequency.setValueAtTime(graph.jittered(2400, 0.04), at + LEAD);
      high.frequency.exponentialRampToValueAtTime(graph.jittered(900, 0.04), at + 0.8);
      return Math.max(graph.punch(env.gain, at, peak, 0.01, 0.7), at + 0.82);
    },
  },
  ash: {
    seconds: 0.14,
    build: (graph, into, peak, at) => {
      const grit = graph.filter('grit', 'lowpass', graph.jittered(760, 0.25), 0.9);
      const env = graph.gain('env', SILENT);
      grit.connect(env);
      env.connect(into);
      const dust = graph.noise(
        'dust',
        specOf('grain', 0.14, 0.55 + graph.args.velocity * 0.3, 1),
        1,
        false,
      );
      if (dust) dust.connect(grit);
      return Math.max(graph.punch(env.gain, at, peak, 0.002, 0.1), at + 0.14);
    },
  },
  wind: {
    seconds: 1.2,
    build: (graph, into, peak, at) => {
      const band = graph.filter('band', 'bandpass', graph.jittered(520, 0.2), 0.7);
      const low = graph.filter('low', 'lowpass', graph.jittered(1300, 0.2), 0.6);
      const env = graph.gain('env', SILENT);
      band.connect(env);
      low.connect(env);
      env.connect(into);
      const gust = graph.noise('gust', specOf('pink', 1.3, undefined, 2), 1, false);
      if (gust) gust.connect(band);
      const hush = graph.noise('hush', specOf('brown', 1.2, undefined, 1), 1, false);
      if (hush) hush.connect(low);
      graph.lfo('gust', 0.42, 180, band.frequency);
      return Math.max(
        graph.swell(env.gain, at, peak, Math.max(0.4, graph.args.durationSec)),
        at + 0.5,
      );
    },
  },
  rain: {
    seconds: 0.9,
    build: (graph, into, peak, at) => {
      const high = graph.filter('high', 'highpass', graph.jittered(1500, 0.2), 0.6);
      const patter = graph.filter('patter', 'bandpass', graph.jittered(3600, 0.25), 1.3);
      const env = graph.gain('env', SILENT);
      high.connect(env);
      patter.connect(env);
      env.connect(into);
      const sheet = graph.noise('sheet', specOf('white', 0.95, undefined, 2), 1, false);
      if (sheet) sheet.connect(high);
      const drops = graph.noise('drops', specOf('grain', 0.9, 0.7, 2), 0.9, false);
      if (drops) drops.connect(patter);
      return Math.max(
        graph.swell(env.gain, at, peak, Math.max(0.3, graph.args.durationSec)),
        at + 0.4,
      );
    },
  },
  room: {
    seconds: 0.7,
    build: (graph, into, peak, at) => {
      const low = graph.filter('low', 'lowpass', graph.jittered(260, 0.2), 0.6);
      const env = graph.gain('env', SILENT);
      low.connect(env);
      env.connect(into);
      const air = graph.noise('air', specOf('brown', 0.8, undefined, 1), 1, false);
      if (air) air.connect(low);
      return Math.max(
        graph.swell(env.gain, at, peak, Math.max(0.3, graph.args.durationSec * 0.6)),
        at + 0.4,
      );
    },
  },
  city: {
    seconds: 0.8,
    build: (graph, into, peak, at) => {
      const low = graph.filter('low', 'lowpass', graph.jittered(700, 0.2), 0.7);
      const env = graph.gain('env', SILENT);
      low.connect(env);
      env.connect(into);
      const traffic = graph.noise('traffic', specOf('pink', 0.9, undefined, 2), 1, false);
      if (traffic) traffic.connect(low);
      const drone = graph.tone('drone', 'sine', graph.jittered(58, 0.05));
      if (drone) {
        const droneGain = graph.gain('drone.env', SILENT);
        drone.connect(droneGain);
        droneGain.connect(into);
        graph.swell(droneGain.gain, at, peak * 0.4, Math.max(0.3, graph.args.durationSec * 0.8));
      }
      return Math.max(
        graph.swell(env.gain, at, peak, Math.max(0.3, graph.args.durationSec * 0.7)),
        at + 0.4,
      );
    },
  },
  chime: {
    seconds: 0.9,
    build: (graph, into, peak, at) => {
      const bell = graph.filter('bell', 'bandpass', graph.jittered(1900, 0.18), 2.2);
      const env = graph.gain('env', SILENT);
      bell.connect(env);
      env.connect(into);
      const ring = graph.noise('ring', specOf('ring', 0.9, undefined, 1), 1, false);
      if (ring) ring.connect(bell);
      const partial = graph.tone('partial', 'sine', graph.jittered(1180, 0.05));
      if (partial) {
        const partialGain = graph.gain('partial.env', SILENT);
        partial.connect(partialGain);
        partialGain.connect(into);
        graph.punch(partialGain.gain, at + 0.01, peak * 0.3, 0.004, 0.55);
      }
      return Math.max(graph.punch(env.gain, at, peak, 0.004, 0.62), at + 0.75);
    },
  },
};

interface BedRecipe {
  readonly flavor: NoiseFlavor;
  /** Loop length: long enough that the player cannot hear the seam (§27). */
  readonly seconds: number;
  readonly density?: number;
  readonly channels?: number;
  readonly rate?: number;
  readonly filter: { readonly type: string; readonly hz: number; readonly q: number };
  /** The bed's own breathing: how fast and how deep it moves with no player input. */
  readonly lfoHz: number;
  readonly lfoDepth: number;
}

const BEDS: Partial<Record<AudioVoiceId, BedRecipe>> = {
  flame: {
    flavor: 'white',
    seconds: 2.4,
    channels: 2,
    filter: { type: 'lowpass', hz: 900, q: 0.6 },
    lfoHz: 6.5,
    lfoDepth: 180,
  },
  draw: {
    flavor: 'pink',
    seconds: 2.8,
    channels: 2,
    filter: { type: 'bandpass', hz: 460, q: 0.8 },
    lfoHz: 0.32,
    lfoDepth: 140,
  },
  crackle: {
    flavor: 'grain',
    seconds: 3.2,
    density: 0.5,
    channels: 2,
    filter: { type: 'highpass', hz: 1100, q: 0.7 },
    lfoHz: 1.7,
    lfoDepth: 260,
  },
  ember: {
    flavor: 'brown',
    seconds: 3.6,
    channels: 1,
    filter: { type: 'lowpass', hz: 520, q: 0.7 },
    lfoHz: 0.24,
    lfoDepth: 70,
  },
  wind: {
    flavor: 'pink',
    seconds: 3.4,
    channels: 2,
    filter: { type: 'bandpass', hz: 540, q: 0.6 },
    lfoHz: 0.19,
    lfoDepth: 240,
  },
  rain: {
    flavor: 'white',
    seconds: 3,
    channels: 2,
    filter: { type: 'highpass', hz: 1500, q: 0.5 },
    lfoHz: 2.4,
    lfoDepth: 300,
  },
  room: {
    flavor: 'brown',
    seconds: 4,
    channels: 1,
    filter: { type: 'lowpass', hz: 260, q: 0.5 },
    lfoHz: 0.11,
    lfoDepth: 40,
  },
  city: {
    flavor: 'pink',
    seconds: 4.2,
    channels: 2,
    filter: { type: 'lowpass', hz: 720, q: 0.6 },
    lfoHz: 0.13,
    lfoDepth: 120,
  },
  hiss: {
    flavor: 'white',
    seconds: 2.6,
    channels: 2,
    filter: { type: 'highpass', hz: 2200, q: 0.6 },
    lfoHz: 3.1,
    lfoDepth: 420,
  },
};

/** A looping voice can carry a bed; anything else is only ever a one-shot. */
export const canBed = (voice: AudioVoiceId): boolean => BEDS[voice] !== undefined;

/**
 * A bed is one looped source → shaping filter → level → stereo position → bus. Everything the
 * engine modulates per frame is on the returned handle, so `beds.ts` never needs to know how
 * a voice is built.
 */
export function buildBed(
  context: AudioContextLike,
  out: AudioNodeLike,
  voice: AudioVoiceId,
  args: VoiceArgs,
  label = `bed.${voice}`,
): BedHandle | null {
  const recipe = BEDS[voice];
  if (!recipe) return null;

  const graph = new VoiceGraph(context, out, args, label);
  const level = graph.gain('level', SILENT);
  const shape = graph.filter('shape', recipe.filter.type, recipe.filter.hz, recipe.filter.q);
  const field = graph.stage('field');
  shape.connect(level);
  level.connect(field);
  graph.lfo('breath', recipe.lfoHz, recipe.lfoDepth, shape.frequency);

  const seconds = recipe.seconds;
  const density = recipe.density ?? 0.35;
  const channels = recipe.channels ?? 1;
  const rate = recipe.rate ?? 1;
  /** The loop currently sounding: a re-seed stops this one and hands the name to the next. */
  let sounding: AudioBufferSourceLike | null = graph.loopInto(
    shape,
    'loop',
    specOf(recipe.flavor, seconds, density, channels),
    rate,
  );

  const { nodes } = graph.view();

  return {
    gain: level.gain,
    cutoff: shape.frequency,
    reseed: (rng: Rng) => {
      // Stop the old loop a moment after the new one starts: the crossfade is a few samples,
      // and the fresh buffer is a different grain pattern, so the bed never repeats (§27).
      const dying = sounding;
      sounding = graph.loopInto(
        shape,
        `loop.${nodes.length}`,
        specOf(
          recipe.flavor,
          seconds * rng.range(0.85, 1.15),
          density * rng.range(0.7, 1.3),
          channels,
        ),
        rate * rng.range(0.97, 1.03),
      );
      if (dying) {
        try {
          dying.stop(context.currentTime + 0.08);
        } catch {
          /* already finished */
        }
      }
    },
    dispose: (nowSec: number) => {
      graph.stopAll(nowSec);
      for (const node of nodes) node.disconnect();
    },
  };
}

/** Fire one cue. Returns the handle the engine reaps once `endsAtSec` has passed. */
export function fireVoice(
  context: AudioContextLike,
  out: AudioNodeLike,
  voice: AudioVoiceId,
  args: VoiceArgs,
): VoiceHandle | null {
  const recipe = ONE_SHOTS[voice];
  if (!recipe) return null;

  const graph = new VoiceGraph(context, out, args, `cue.${voice}`);
  const field = graph.stage('bus');
  const at = Math.max(args.atSec, context.currentTime);
  const peak = clamp(args.gain, 0, 1.4) * 0.9;
  const ends = recipe.build(graph, field, peak, at);

  graph.startAll(at);
  graph.stopAll(ends + 0.02);

  // The nominal recipe length is the floor: a cue whose envelope came up short is still
  // reaped on schedule, so the engine's active-voice list cannot drift.
  const view = graph.view();
  return {
    endsAtSec: Math.max(ends, at + recipe.seconds) + 0.05,
    nodes: view.nodes,
    sources: view.sources,
  };
}
