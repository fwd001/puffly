/**
 * Synthesised noise buffers — SPEC.md §26, §87 ("声音不是一个 MP3 循环").
 *
 * There is no sample asset anywhere in this package: every buffer below is filled with
 * numbers at trigger time from a seeded RNG, so a repeated puff is a *different* sound
 * rather than the same recording at a different pitch. Generation stays cheap enough to
 * do per trigger (tens of milliseconds of audio) and expensive enough to matter, so beds
 * ask for a longer buffer once and re-seed it when the state drifts.
 */

import type { Rng } from '@puffly/shared';
import type { AudioBufferLike, AudioContextLike } from './web-audio';

export type NoiseFlavor =
  /** Hiss: the air in a puff, the body of a flame. */
  | 'white'
  /** Warmer, more organic: wind, room tone, the draw bed. */
  | 'pink'
  /** Rumble only: city, the low floor of a room. */
  | 'brown'
  /** Sparse decaying impulses: ember crackle, ash grit. */
  | 'grain'
  /** Detuned ping rings: the tray, the chime, a lighter casing. */
  | 'ring';

export interface NoiseSpec {
  readonly flavor: NoiseFlavor;
  readonly seconds: number;
  /** 0..1 for `grain`: how many impulses per second of buffer. */
  readonly density?: number;
  /** 1 keeps a bed coherent; 2 widens a one-shot. */
  readonly channels?: number;
}

/** Long enough for a bed's loop to be unrecognisable, short enough to fill fast. */
const MAX_SECONDS = 6;
const MIN_SECONDS = 0.008;

const secondsOf = (spec: NoiseSpec): number => {
  const raw = Number.isFinite(spec.seconds) ? spec.seconds : 0.1;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, raw));
};

/**
 * Returns `null` when the runtime refuses to hand out a buffer. Callers must then fall
 * back to oscillator-only synthesis instead of throwing (§63).
 */
export function createNoiseBuffer(
  context: AudioContextLike,
  spec: NoiseSpec,
  rng: Rng,
): AudioBufferLike | null {
  const sampleRate = context.sampleRate;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  const seconds = secondsOf(spec);
  const channels = Math.max(1, Math.round(spec.channels ?? 1));
  const frames = Math.max(1, Math.round(seconds * sampleRate));

  let buffer: AudioBufferLike;
  try {
    buffer = context.createBuffer(channels, frames, sampleRate);
  } catch {
    return null;
  }

  for (let channel = 0; channel < channels; channel += 1) {
    let data: Float32Array;
    try {
      data = buffer.getChannelData(channel);
    } catch {
      return null;
    }
    fill(data, spec, rng, sampleRate, channel);
  }
  return buffer;
}

function fill(
  data: Float32Array,
  spec: NoiseSpec,
  rng: Rng,
  sampleRate: number,
  channel: number,
): void {
  switch (spec.flavor) {
    case 'white':
      fillWhite(data, rng, 0.85);
      break;
    case 'pink':
      fillPink(data, rng, 0.9);
      break;
    case 'brown':
      fillBrown(data, rng);
      break;
    case 'grain':
      fillGrains(data, rng, spec.density ?? 0.35, sampleRate, channel);
      break;
    case 'ring':
      fillRing(data, rng, sampleRate, channel);
      break;
    default:
      fillWhite(data, rng, 0.8);
      break;
  }
  fadeEdges(data);
}

/** Plain white noise, scaled to a safe peak so stacked voices do not clip (§54). */
function fillWhite(data: Float32Array, rng: Rng, peak: number): void {
  for (let i = 0; i < data.length; i += 1) data[i] = (rng.next() * 2 - 1) * peak;
}

/**
 * Paul Kellet's pink filter: pink is what "air" sounds like, and a pink bed never reads
 * as the deterministic hiss white noise does (§27: feel the room).
 */
function fillPink(data: Float32Array, rng: Rng, peak: number): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = (rng.next() * 2 - 1) * peak;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    data[i] = Math.max(-1, Math.min(1, pink));
  }
}

/** Random walk with leakage — the low rumble under a city or a distant room. */
function fillBrown(data: Float32Array, rng: Rng): void {
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = (rng.next() * 2 - 1) * 0.6;
    last = (last + 0.02 * white) / 1.02;
    data[i] = Math.max(-1, Math.min(1, last * 8));
  }
}

/**
 * Impulse train: `density` grains per second, each a fast exponential decay with a
 * slightly different shape. This is what makes a crackle bed a *crackle* bed rather
 * than a hiss, and re-seeding it is what stops §27's "听见一段循环音频".
 */
function fillGrains(
  data: Float32Array,
  rng: Rng,
  density: number,
  sampleRate: number,
  channel: number,
): void {
  data.fill(0);
  const seconds = data.length / Math.max(1, sampleRate);
  const perSecond = 2 + Math.max(0, Math.min(1, density)) * 26;
  const grains = Math.max(1, Math.round(seconds * perSecond));
  const skew = channel === 0 ? 1 : -1;

  for (let g = 0; g < grains; g += 1) {
    const at = rng.range(0, Math.max(0, seconds - 0.02));
    const start = Math.floor(at * sampleRate);
    const lifetime = Math.round(rng.range(0.0008, 0.012) * sampleRate);
    const amplitude = rng.range(0.25, 1) * (1 + skew * 0.08);
    const wobble = rng.range(0.15, 0.6);
    for (let i = 0; i < lifetime; i += 1) {
      const index = start + i;
      if (index >= data.length) break;
      const t = i / Math.max(1, lifetime);
      const decay = Math.exp(-t * 7);
      const grit = Math.cos(t * wobble * Math.PI * 8) * 0.5 + rng.next() * 0.5;
      data[index] = Math.max(-1, Math.min(1, (data[index] ?? 0) + amplitude * decay * grit));
    }
  }
}

/**
 * A handful of detuned partials with a soft attack: enough inharmonic information that
 * a filter + envelope turns it into glass, metal or stone without any sample file.
 *
 * The partials sit at 1-2.4 kHz and above because that is where a struck thing actually
 * rings. A lower base made a buffer no band-passed transient could hear, and the lighter's
 * click came out as a bare sine blip with no metal in it.
 */
function fillRing(data: Float32Array, rng: Rng, sampleRate: number, channel: number): void {
  const partials = 5;
  const base = rng.range(2.5, 6);
  const ratios: number[] = [];
  for (let p = 0; p < partials; p += 1) ratios.push(base * (1 + p * rng.range(0.62, 0.93)));
  const skew = channel === 0 ? 1 : -1;
  const length = data.length;
  for (let i = 0; i < length; i += 1) {
    const t = i / Math.max(1, sampleRate);
    const envelope = Math.exp(-t * 9);
    let value = 0;
    for (let p = 0; p < partials; p += 1) {
      const ratio = ratios[p] ?? base;
      value += Math.sin(2 * Math.PI * ratio * 400 * t) / (1 + p * 1.6);
    }
    data[i] = Math.max(-1, Math.min(1, value * envelope * (1 + skew * 0.05)));
  }
}

/** A few hundred samples of ramp at each end: no click when a loop wraps or a buffer stops. */
function fadeEdges(data: Float32Array): void {
  const edge = Math.min(64, Math.max(1, Math.floor(data.length * 0.01)));
  for (let i = 0; i < edge; i += 1) {
    const factor = i / edge;
    const head = data[i];
    if (head !== undefined) data[i] = head * factor;
    const tailIndex = data.length - 1 - i;
    const tail = data[tailIndex];
    if (tail !== undefined) data[tailIndex] = tail * factor;
  }
}
