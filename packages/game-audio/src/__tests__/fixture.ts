/**
 * Test fixtures: content-shaped data and a state view narrow enough to type by hand.
 *
 * The engine reads `AudioStateSlice`, which a real `GameStateView` satisfies — so a test can
 * name the two numbers it cares about instead of building 200 lines of state (§72).
 */

import {
  createDefaultSettings,
  WorldEventId,
  type Burst,
  type BurstKind,
  type ContentBundle,
  type EngineEvent,
  type SoundProfileContent,
  type WorldEventOccurrence,
  type CigaretteStateId,
  type WeatherId,
  type SessionEvent,
  type Settings,
} from '@puffly/game-core';
import type { AudioStateSlice } from '../types';

export const PROFILES: SoundProfileContent[] = [
  {
    id: 'lighter-wheel',
    name: 'Wheel',
    layers: [
      { voice: 'click', gain: 0.5, pitchSpread: 3, timingSpreadMs: 12, pan: -0.25, loop: false },
      { voice: 'flame', gain: 0.36, pitchSpread: 2, timingSpreadMs: 30, pan: -0.2, loop: true },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'draw-warm',
    name: 'Warm draw',
    layers: [
      { voice: 'draw', gain: 0.4, pitchSpread: 2.5, timingSpreadMs: 20, pan: 0.1, loop: true },
      { voice: 'crackle', gain: 0.16, pitchSpread: 3, timingSpreadMs: 60, pan: 0.15, loop: true },
      { voice: 'puff', gain: 0.34, pitchSpread: 2, timingSpreadMs: 24, pan: 0.05, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'tray-stone',
    name: 'Stone tray',
    layers: [
      { voice: 'ash', gain: 0.4, pitchSpread: 2, timingSpreadMs: 22, pan: 0.35, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'extinguish',
    name: 'Stub out',
    layers: [
      { voice: 'hiss', gain: 0.5, pitchSpread: 3, timingSpreadMs: 10, pan: 0.2, loop: false },
      { voice: 'ash', gain: 0.2, pitchSpread: 2, timingSpreadMs: 30, pan: 0.3, loop: false },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'room-quiet',
    name: 'Quiet room',
    layers: [
      { voice: 'room', gain: 0.5, pitchSpread: 0, timingSpreadMs: 0, pan: 0, loop: true },
      { voice: 'ember', gain: 0.1, pitchSpread: 2, timingSpreadMs: 900, pan: 0.4, loop: true },
    ],
    unlock: { kind: 'default' },
  },
  {
    id: 'city-night',
    name: 'City night',
    layers: [
      { voice: 'city', gain: 0.5, pitchSpread: 0, timingSpreadMs: 0, pan: -0.35, loop: true },
      { voice: 'wind', gain: 0.2, pitchSpread: 3, timingSpreadMs: 500, pan: 0.3, loop: true },
      { voice: 'chime', gain: 0.06, pitchSpread: 5, timingSpreadMs: 4200, pan: 0.5, loop: true },
    ],
    unlock: { kind: 'day', day: 14 },
  },
];

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...createDefaultSettings(Date.UTC(2026, 8, 29, 21, 30, 0)), ...overrides };
}

export interface StateOverrides {
  readonly puffActive?: boolean;
  readonly intensity?: number;
  readonly sinceReleaseMs?: number;
  readonly flame?: number;
  readonly lighterEngaged?: boolean;
  readonly brightness?: number;
  readonly flare?: number;
  readonly lit?: boolean;
  readonly ambientGain?: number;
  readonly wind?: number;
  readonly weather?: WeatherId;
  readonly density?: number;
  readonly cigaretteState?: CigaretteStateId;
  readonly extinguishProgress?: number;
  readonly soundProfileId?: string;
  readonly ambientProfileId?: string;
  readonly ambientTrim?: number;
  readonly nowMs?: number;
}

/** A resting, unlit cigarette in a quiet room: the state audio starts from. */
export function makeState(overrides: StateOverrides = {}): AudioStateSlice {
  const o = overrides;
  const brightness = o.brightness ?? 0;
  return {
    nowMs: o.nowMs ?? 0,
    cigarette: {
      state: o.cigaretteState ?? 'IDLE',
      soundProfileId: o.soundProfileId ?? 'draw-warm',
      rodRemaining: 1,
      ember: {
        brightness,
        flare: o.flare ?? 0,
        lit: o.lit ?? brightness > 0.12,
      },
      puff: {
        active: o.puffActive ?? false,
        intensity: o.intensity ?? 0,
        progress: 0,
        sinceReleaseMs: o.sinceReleaseMs ?? 5000,
      },
      ash: { ratio: 0, ready: false },
      extinguishProgress: o.extinguishProgress ?? 0,
      discardProgress: 0,
    },
    smoke: {
      density: o.density ?? 0,
      turbulence: 0.4,
      riseSpeed: 0.2,
      emissionRate: 0,
    },
    world: {
      environmentId: 'quiet-room',
      timeOfDay: 'night',
      weather: o.weather ?? 'clear',
      wind: o.wind ?? 0.1,
      ambientGain: o.ambientGain ?? 0.5,
      light: { ambient: 0.24, flash: 0 },
    },
    lighter: {
      typeId: 'wheel',
      engaged: o.lighterEngaged ?? false,
      flame: o.flame ?? 0,
      sputter: 0,
    },
    ui: { sessionActive: true },
    environment: {
      ambientAudio: {
        profileId: o.ambientProfileId ?? 'room-quiet',
        gain: o.ambientTrim ?? 1,
        pan: 0,
      },
    },
  };
}

const ORIGIN = { x: 0.5, y: 0.42 };
const RANGE = { min: 0.01, max: 0.05 };

export function makeBurst(kind: BurstKind, seed: number, alphaPeak = 0.34): Burst {
  return {
    id: `burst-${kind}-${seed}`,
    kind,
    seed,
    origin: ORIGIN,
    count: 24,
    directionDeg: -90,
    spreadDeg: 40,
    speed: RANGE,
    radius: RANGE,
    lifeMs: { min: 900, max: 2400 },
    alphaPeak,
    alphaDecay: 0.7,
    rise: 0.2,
    turbulence: 1.1,
    scaleGrowth: 2.4,
    gravity: 0,
    tint: [200, 200, 205],
    heat: kind === 'ember' || kind === 'lighter' ? 0.9 : 0.2,
  };
}

export const burstEvent = (kind: BurstKind, seed = 1000, atMs = 0): EngineEvent => ({
  kind: 'burst',
  atMs,
  burst: makeBurst(kind, seed),
});

export function makeOccurrence(
  type: (typeof WorldEventId)[keyof typeof WorldEventId],
  strength = 0.6,
  durationMs = 2000,
): WorldEventOccurrence {
  return {
    id: `world-${type}-${Math.round(strength * 100)}`,
    type,
    startedAtMs: 0,
    endsAtMs: durationMs,
    strength,
    at: ORIGIN,
  };
}

export const worldEvent = (
  type: (typeof WorldEventId)[keyof typeof WorldEventId],
  strength = 0.6,
  durationMs = 2000,
): EngineEvent => ({
  kind: 'world',
  atMs: 0,
  occurrence: makeOccurrence(type, strength, durationMs),
});

export const sessionEvent = (type: string, id = 'evt-1'): EngineEvent => {
  const event: SessionEvent = { id, type, timestamp: 1_760_000_000_000 };
  return { kind: 'session', event };
};

export const BURST_KINDS: readonly BurstKind[] = [
  'puff',
  'exhale',
  'drift',
  'ember',
  'flare',
  'ash',
  'extinguish',
  'lighter',
  'discard',
  'impact',
];

export const WORLD_TYPES = Object.values(WorldEventId);

/** One of every event the core can emit — the "must never throw" corpus (§63). */
export function everyEvent(): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const kind of BURST_KINDS) {
    events.push(burstEvent(kind, kind.length * 977 + 13));
    events.push(burstEvent(kind, kind.length * 977 + 13, 500));
  }
  for (const type of WORLD_TYPES) events.push(worldEvent(type, 0.4, 1800));
  for (const type of [
    'SESSION_START',
    'SESSION_END',
    'SESSION_TARGET',
    'PICK_UP',
    'LIGHT',
    'LIGHT_FAIL',
    'PUFF',
    'ASH',
    'ASH_FALL',
    'WIND',
    'EXTINGUISH',
    'DISCARD',
    'CRAVING',
    'TRIGGER',
    'UNLOCK',
  ]) {
    events.push(sessionEvent(type, `evt-${type}`));
  }
  events.push({ kind: 'transition', atMs: 0, from: 'PICKED_UP', to: 'LIGHTING' });
  events.push({ kind: 'transition', atMs: 900, from: 'BURNING', to: 'NEAR_END' });
  events.push({ kind: 'unlock', atMs: 1200, category: 'lighters', id: 'brass' });
  return events;
}

/**
 * A miniature content bundle for the integration test: one of everything the core insists on,
 * with numbers that make a whole lifecycle finish in about a simulated second. It is a real
 * `ContentBundle`, so the engine is exercised against Game Core's own event stream.
 */
export const BUNDLE: ContentBundle = {
  cigarettes: [
    {
      id: 'test-rod',
      name: 'Test Rod',
      burnDuration: { min: 12000, max: 12000 },
      puffProfile: {
        intensityMin: 0.4,
        intensityMax: 0.9,
        durationMin: 600,
        durationMax: 900,
        savourMs: 0,
        loadPerPuff: 0.24,
        exhaleMs: 0,
      },
      smokeProfile: { density: 1, turbulence: 1, riseSpeed: 0.3, dispersion: 1 },
      emberProfile: { brightness: 0.8, flicker: 0.1, flareChance: 0 },
      ashProfile: { minLength: 0.02, maxLength: 0.05 },
      physical: {
        lengthMm: 84,
        ashGrams: 2.1,
        centerTempC: [700, 800],
        puffs: { target: 3, min: 2, max: 4 },
      },
      archive: { zhName: '测试烟支', kind: 'inhale' },
      eventPool: [],
      palette: {
        paper: [238, 233, 222],
        band: [196, 68, 52],
        filter: [206, 150, 96],
        ash: [122, 122, 128],
      },
      smokeStyleId: 'test-smoke',
      soundProfileId: 'draw-warm',
      environmentBias: ['test-room'],
      unlock: { kind: 'default' },
    },
  ],
  environments: [
    {
      id: 'test-room',
      name: 'Test Room',
      background: {
        kind: 'room',
        sky: [
          [34, 33, 36],
          [52, 48, 44],
        ],
        horizon: [66, 60, 56],
        silhouette: [24, 23, 25],
        fog: 0.2,
        grain: 0.4,
      },
      lighting: {
        ambient: 0.24,
        warmth: 0.4,
        keyDirectionDeg: 30,
        contrast: 0.6,
        smokeVisibility: 0.8,
      },
      ambientAudio: { profileId: 'room-quiet', gain: 1, pan: 0 },
      wind: { base: 0.05, gust: 0.05, directionDeg: 90, variance: 0.2 },
      weather: { bias: { clear: 1 }, rainIntensity: 0, stormWindScale: 1 },
      smokeModifier: {
        density: 1,
        turbulence: 1,
        riseSpeed: 1,
        dispersion: 1,
        tintShift: [0, 0, 0],
      },
      emberModifier: { brightness: 1, flicker: 1, flareBoost: 1 },
      eventPool: [],
      unlock: { kind: 'default' },
    },
  ],
  lighters: [
    {
      id: 'wheel',
      name: 'Wheel',
      ignitionTimeMs: { min: 120, max: 180 },
      failureChance: 0,
      flame: { height: 1, flicker: 0.2, hue: [255, 170, 80], sparkles: 2 },
      soundProfileId: 'lighter-wheel',
      unlock: { kind: 'default' },
    },
  ],
  ashtrays: [
    {
      id: 'stone',
      name: 'Stone',
      catchRadius: 0.16,
      material: { base: [120, 118, 122], rim: [160, 158, 160], reflect: 0.2 },
      soundProfileId: 'tray-stone',
      unlock: { kind: 'default' },
    },
  ],
  smokeStyles: [
    {
      id: 'test-smoke',
      name: 'Test Smoke',
      tint: [200, 200, 205],
      opacity: 1,
      blur: 1,
      swirl: 1,
      unlock: { kind: 'default' },
    },
  ],
  soundProfiles: PROFILES,
  skins: [],
  packs: [],
};
