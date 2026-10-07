/**
 * A recording Web Audio double — SPEC.md §72.
 *
 * Node has no `AudioContext` and jsdom never had one, so the audio tests bring their own: a
 * fake that behaves like the real API where the engine touches it (nodes, params, scheduling)
 * and records every call so a test can assert on *automation*, not on bytes of sound. It is
 * typed as `AudioContextLike`, which is what keeps the seam honest — the real browser context
 * satisfies the same shape (`boundaries.test.ts` proves that at compile time).
 */

import type {
  AudioBufferLike,
  AudioBufferSourceLike,
  AudioContextLike,
  AudioDelayLike,
  AudioFilterLike,
  AudioGainLike,
  AudioNodeLike,
  AudioOscillatorLike,
  AudioParamLike,
  AudioPannerLike,
} from '../web-audio';

export type AutomationKind =
  'value' | 'setValueAtTime' | 'linearRamp' | 'exponentialRamp' | 'setTarget' | 'cancel';

export interface AutomationCall {
  readonly kind: AutomationKind;
  readonly value: number;
  readonly time: number;
  readonly timeConstant: number;
}

export class FakeParam implements AudioParamLike {
  readonly calls: AutomationCall[] = [];

  constructor(public value = 0) {}

  setValueAtTime(value: number, startTime: number): void {
    this.calls.push({ kind: 'setValueAtTime', value, time: startTime, timeConstant: 0 });
    this.value = value;
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.calls.push({ kind: 'linearRamp', value, time: endTime, timeConstant: 0 });
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): void {
    this.calls.push({ kind: 'exponentialRamp', value, time: endTime, timeConstant: 0 });
    this.value = value;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): void {
    this.calls.push({ kind: 'setTarget', value: target, time: startTime, timeConstant });
    this.value = target;
  }

  cancelScheduledValues(startTime: number): void {
    this.calls.push({ kind: 'cancel', value: 0, time: startTime, timeConstant: 0 });
  }

  of(kind: AutomationKind): AutomationCall[] {
    return this.calls.filter((call) => call.kind === kind);
  }

  /** The value the engine last asked this param to chase — the only meaningful "level" test. */
  lastTarget(): number | undefined {
    for (let i = this.calls.length - 1; i >= 0; i -= 1) {
      const call = this.calls[i];
      if (call && (call.kind === 'setTarget' || call.kind === 'setValueAtTime')) return call.value;
    }
    return undefined;
  }

  last(): AutomationCall | undefined {
    return this.calls[this.calls.length - 1];
  }
}

export class FakeNode implements AudioNodeLike {
  name = '';
  readonly connections: Array<AudioNodeLike | AudioParamLike> = [];
  readonly params = new Map<string, FakeParam>();
  connectCount = 0;
  disconnectCount = 0;

  connect(destination: AudioNodeLike | AudioParamLike): void {
    this.connections.push(destination);
    this.connectCount += 1;
  }

  disconnect(): void {
    this.disconnectCount += 1;
  }

  protected register(key: string, param: FakeParam): FakeParam {
    this.params.set(key, param);
    return param;
  }

  param(key: string): FakeParam | undefined {
    return this.params.get(key);
  }
}

export class FakeGain extends FakeNode implements AudioGainLike {
  readonly gain: FakeParam;

  constructor(value = 1) {
    super();
    this.gain = this.register('gain', new FakeParam(value));
  }
}

export class FakeFilter extends FakeNode implements AudioFilterLike {
  type = 'lowpass';
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  readonly gain: FakeParam;
  readonly detune: FakeParam;

  constructor() {
    super();
    this.frequency = this.register('frequency', new FakeParam(350));
    this.Q = this.register('Q', new FakeParam(1));
    this.gain = this.register('gain', new FakeParam(0));
    this.detune = this.register('detune', new FakeParam(0));
  }
}

export class FakePanner extends FakeNode implements AudioPannerLike {
  readonly pan: FakeParam;

  constructor() {
    super();
    this.pan = this.register('pan', new FakeParam(0));
  }
}

/** A `DelayNode`: the room's whole shape lives in this one param. */
export class FakeDelay extends FakeNode implements AudioDelayLike {
  readonly delayTime: FakeParam;

  constructor() {
    super();
    this.delayTime = this.register('delayTime', new FakeParam(0));
  }
}

export class FakeBuffer implements AudioBufferLike {
  private readonly data: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = [];
    for (let i = 0; i < numberOfChannels; i += 1) this.data.push(new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    const found = this.data[channel];
    if (!found) throw new Error(`no channel ${channel}`);
    return found;
  }

  /** Cheap fingerprint of the generated samples: same shape means a repeated sound. */
  fingerprint(): number {
    const first = this.data[0];
    if (!first) return 0;
    let sum = 0;
    for (let i = 0; i < first.length; i += 7) sum += first[i] ?? 0;
    return Math.round(sum * 1000);
  }
}

export class FakeSource extends FakeNode implements AudioBufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  readonly playbackRate: FakeParam;
  readonly detune: FakeParam;
  readonly startCalls: number[] = [];
  readonly stopCalls: number[] = [];

  constructor() {
    super();
    this.playbackRate = this.register('playbackRate', new FakeParam(1));
    this.detune = this.register('detune', new FakeParam(0));
  }

  start(when?: number): void {
    this.startCalls.push(when ?? 0);
  }

  stop(when?: number): void {
    this.stopCalls.push(when ?? 0);
  }
}

export class FakeOscillator extends FakeSource implements AudioOscillatorLike {
  type = 'sine';
  readonly frequency: FakeParam;

  constructor() {
    super();
    this.frequency = this.register('frequency', new FakeParam(440));
  }
}

export interface FakeContextOptions {
  /** Autoplay policy: a context that starts suspended does nothing until a gesture resumes it. */
  readonly startState?: 'suspended' | 'running';
  /** Simulate a runtime that refuses a node type (`createStereoPanner` on old Safari, etc). */
  readonly without?: readonly ('stereoPanner' | 'oscillator' | 'buffer' | 'delay')[];
  /** Simulate a Web Audio implementation that throws — §63 must swallow it. */
  readonly throwOn?: 'createGain' | 'createBuffer' | 'createBufferSource' | 'resume';
  readonly sampleRate?: number;
}

export class FakeAudioContext implements AudioContextLike {
  readonly sampleRate: number;
  currentTime = 0;
  state: string;
  readonly destination = new FakeNode();
  readonly nodes: FakeNode[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly sources: FakeSource[] = [];
  readonly oscillators: FakeOscillator[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;

  private readonly options: FakeContextOptions;

  /**
   * Assigned in the constructor instead of declared as a method, so a context built with
   * `without: ['delay']` genuinely has no `createDelay` for the room to notice — which is the old
   * Safari case §63 asks the engine to survive by playing dry.
   */
  createDelay?: (maxDelaySeconds?: number) => AudioDelayLike;

  constructor(options: FakeContextOptions = {}) {
    this.options = options;
    this.sampleRate = options.sampleRate ?? 48000;
    this.state = options.startState ?? 'running';
    this.destination.name = 'destination';
    if (!options.without?.includes('delay')) {
      this.createDelay = () => {
        const node = new FakeDelay();
        this.track(node);
        return node;
      };
    }
  }

  advance(seconds: number): void {
    this.currentTime = Math.round((this.currentTime + seconds) * 1000) / 1000;
  }

  createGain(): AudioGainLike {
    this.check('createGain');
    const node = new FakeGain(1);
    this.track(node);
    return node;
  }

  createBiquadFilter(): AudioFilterLike {
    this.check('createBiquadFilter');
    const node = new FakeFilter();
    this.track(node);
    return node;
  }

  createOscillator(): AudioOscillatorLike {
    if (this.options.without?.includes('oscillator')) throw new Error('no oscillator support');
    const node = new FakeOscillator();
    this.track(node);
    this.oscillators.push(node);
    return node;
  }

  createBufferSource(): AudioBufferSourceLike {
    this.check('createBufferSource');
    const node = new FakeSource();
    this.track(node);
    this.sources.push(node);
    return node;
  }

  createStereoPanner(): AudioPannerLike {
    if (this.options.without?.includes('stereoPanner')) throw new Error('no StereoPannerNode');
    const node = new FakePanner();
    this.track(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike {
    this.check('createBuffer');
    if (this.options.without?.includes('buffer')) throw new Error('no buffers here');
    const buffer = new FakeBuffer(channels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  resume(): unknown {
    if (this.options.throwOn === 'resume') throw new Error('resume blocked');
    this.resumeCalls += 1;
    this.state = 'running';
    return undefined;
  }

  suspend(): unknown {
    this.suspendCalls += 1;
    this.state = 'suspended';
    return undefined;
  }

  close(): unknown {
    this.closeCalls += 1;
    this.state = 'closed';
    return undefined;
  }

  nodesNamed(prefix: string): FakeNode[] {
    return this.nodes.filter((node) => node.name.startsWith(prefix));
  }

  nodeNamed(name: string): FakeNode | undefined {
    return this.nodes.find((node) => node.name === name);
  }

  param(name: string, key: string): FakeParam | undefined {
    return this.nodeNamed(name)?.param(key);
  }

  /** Everything the engine scheduled on any `setTargetAtTime`, for smooth-ramp assertions. */
  targetCalls(): AutomationCall[] {
    const all: AutomationCall[] = [];
    for (const node of this.nodes) {
      for (const param of node.params.values()) all.push(...param.of('setTarget'));
    }
    return all;
  }

  startTimes(): number[] {
    const times: number[] = [];
    for (const source of [...this.sources, ...this.oscillators]) times.push(...source.startCalls);
    return times;
  }

  private check(method: string): void {
    if (this.options.throwOn === method) throw new Error(`${method} refused`);
  }

  private track(node: FakeNode): void {
    this.nodes.push(node);
  }
}
