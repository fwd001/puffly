/**
 * The Web Audio seam — SPEC.md §26, §47, §63, §75.
 *
 * Everything in this package talks to the browser through the narrow structural types
 * below rather than the `lib.dom` classes. Two reasons: the engine stays drivable from a
 * recording test double with no browser present (§72), and the surface we depend on is
 * written down in one place, so a runtime that lacks a node type (an old Safari without
 * `createStereoPanner`) degrades instead of throwing (§63).
 *
 * `__tests__/boundaries.test.ts` proves at compile time that the real `AudioContext`
 * already satisfies `AudioContextLike`, so this is a view, not a wrapper.
 */

/** An `AudioParam` restricted to the automation this engine actually schedules. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
  /** Always preferred over `linearRamp` for state following: no zipper noise (§8). */
  setTargetAtTime(target: number, startTime: number, timeConstant: number): void;
  cancelScheduledValues(startTime: number): void;
}

export interface AudioNodeLike {
  /** Diagnostic tag; also how the test double finds a node again. */
  name?: string;
  connect(destination: AudioNodeLike | AudioParamLike): void;
  disconnect(): void;
}

export interface AudioBufferLike {
  readonly duration: number;
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioScheduledSourceLike extends AudioNodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioGainLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

/** `BiquadFilterType` is wider than the four we use, so `type` stays a string here. */
export interface AudioFilterLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
  readonly gain: AudioParamLike;
  readonly detune: AudioParamLike;
}

export interface AudioOscillatorLike extends AudioScheduledSourceLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly detune: AudioParamLike;
}

export interface AudioBufferSourceLike extends AudioScheduledSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  readonly playbackRate: AudioParamLike;
  readonly detune: AudioParamLike;
}

export interface AudioPannerLike extends AudioNodeLike {
  readonly pan: AudioParamLike;
}

/** The context view the engine needs. `state` is a string: browsers disagree on the enum. */
export interface AudioContextLike {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): AudioGainLike;
  createBiquadFilter(): AudioFilterLike;
  createOscillator(): AudioOscillatorLike;
  createBufferSource(): AudioBufferSourceLike;
  /** Optional because Safari <14 has no `StereoPannerNode`; panning is then skipped. */
  createStereoPanner?(): AudioPannerLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  resume(): unknown;
  suspend(): unknown;
  close?(): unknown;
}

export const CONTEXT_RUNNING = 'running';
export const CONTEXT_CLOSED = 'closed';

export const isContextRunning = (context: AudioContextLike): boolean =>
  context.state === CONTEXT_RUNNING;

/** `new AudioContext()` narrowed to zero arguments. */
type AudioContextCtor = new () => AudioContext;

/** Only the two globals this file is allowed to look at. */
interface WebAudioGlobals {
  readonly AudioContext?: AudioContextCtor;
  readonly webkitAudioContext?: AudioContextCtor;
}

function globalScope(): WebAudioGlobals | undefined {
  return typeof globalThis === 'undefined' ? undefined : (globalThis as WebAudioGlobals);
}

function audioContextCtor(): AudioContextCtor | undefined {
  const scope = globalScope();
  const direct = scope?.AudioContext;
  if (typeof direct === 'function') return direct;
  const prefixed = scope?.webkitAudioContext;
  return typeof prefixed === 'function' ? prefixed : undefined;
}

/**
 * §63: "if the browser forbids audio the game still runs". This is the cheap capability
 * probe the shell uses to decide whether to show a speaker glyph at all — it never
 * constructs a context, so calling it has no side effect.
 */
export function isAudioAvailable(): boolean {
  return audioContextCtor() !== undefined;
}

/** Anything Web Audio hands back on a rejected promise is swallowed here (§63). */
function swallow(result: unknown): void {
  if (typeof result !== 'object' || result === null) return;
  const thenable = (result as { then?: unknown }).then;
  if (typeof thenable !== 'function') return;
  const hook = thenable as (onFulfilled?: () => void, onRejected?: () => void) => unknown;
  try {
    hook(noop, noop);
  } catch {
    /* a context that cannot even settle is already dead; the caller notices via state */
  }
}

const noop = (): void => undefined;

/** Resume/suspend/close are fire-and-forget: no rejection may reach the game loop. */
export const dispatch = (result: unknown): void => swallow(result);

export interface AcquiredContext {
  readonly context: AudioContextLike | null;
  /** True when this package constructed the context, and so may close it on dispose. */
  readonly owned: boolean;
}

/**
 * Never throws: a missing constructor, a blocked factory or a context that turns out to be a
 * duck with the wrong feathers all come back as `{ context: null }` (§63). A context the caller
 * handed over stays theirs — we disconnect from it but never close it.
 */
export function acquireContext(
  provided: AudioContextLike | undefined,
  factory: (() => AudioContextLike) | undefined,
): AcquiredContext {
  if (provided) {
    return { context: looksLikeAudioContext(provided) ? provided : null, owned: false };
  }

  try {
    const created = factory ? factory() : createDefaultContext();
    if (!created || !looksLikeAudioContext(created)) return { context: null, owned: false };
    return { context: created, owned: true };
  } catch {
    return { context: null, owned: false };
  }
}

function createDefaultContext(): AudioContextLike | null {
  const Ctor = audioContextCtor();
  return Ctor ? new Ctor() : null;
}

/** The minimum a browser object must offer before the engine will schedule on it. */
export function looksLikeAudioContext(
  value: AudioContextLike | null | undefined,
): value is AudioContextLike {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AudioContextLike>;
  return (
    typeof candidate.createGain === 'function' &&
    typeof candidate.createBufferSource === 'function' &&
    typeof candidate.createBuffer === 'function' &&
    typeof candidate.createBiquadFilter === 'function' &&
    typeof candidate.createOscillator === 'function' &&
    typeof candidate.currentTime === 'number' &&
    typeof candidate.sampleRate === 'number'
  );
}
