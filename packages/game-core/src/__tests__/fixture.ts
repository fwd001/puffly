import type { ContentBundle } from '@puffly/game-core';

/**
 * A tiny content bundle with numbers chosen so a test can watch a whole lifecycle in a
 * few simulated seconds. Using the real bundle's data shape proves §77 (content-driven)
 * at the same time: nothing here is special-cased inside the core.
 */
export const FIXTURE: ContentBundle = {
  cigarettes: [
    {
      id: 'test-rod',
      name: 'Test Rod',
      // Cold and heavy on purpose: the stage tests compare it against the restless rod below.
      character: 'curtain',
      burnDuration: { min: 4000, max: 4000 },
      puffProfile: {
        intensityMin: 0.3,
        intensityMax: 0.9,
        durationMin: 600,
        durationMax: 1200,
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
      eventPool: ['wind', 'ember_flare', 'ash_fall', 'smoke_swirl', 'light_change'],
      palette: {
        paper: [238, 233, 222],
        band: [196, 68, 52],
        filter: [206, 150, 96],
        ash: [122, 122, 128],
      },
      smokeStyleId: 'test-smoke',
      soundProfileId: 'test-sound',
      environmentBias: ['test-room'],
      unlock: { kind: 'default' },
    },
    {
      id: 'test-long',
      name: 'Test Long',
      burnDuration: { min: 9000, max: 9000 },
      puffProfile: {
        intensityMin: 0.2,
        intensityMax: 0.6,
        durationMin: 500,
        durationMax: 900,
        savourMs: 0,
        loadPerPuff: 0.24,
        exhaleMs: 0,
      },
      smokeProfile: { density: 0.6, turbulence: 1.4, riseSpeed: 0.4, dispersion: 0.8 },
      emberProfile: { brightness: 0.6, flicker: 0.3, flareChance: 0.05 },
      ashProfile: { minLength: 0.01, maxLength: 0.09 },
      // Its own body, not a copy: the long rod is longer, heavier and drawn more times, and the
      // readouts test depends on the numbers being per-rod rather than per-engine.
      physical: {
        lengthMm: 100,
        ashGrams: 2.6,
        centerTempC: [690, 790],
        puffs: { target: 5, min: 3, max: 7 },
      },
      archive: { zhName: '测试烟支', kind: 'inhale' },
      eventPool: ['wind', 'ambient_event'],
      palette: {
        paper: [246, 246, 248],
        band: [150, 158, 168],
        filter: [222, 224, 228],
        ash: [150, 152, 158],
      },
      smokeStyleId: 'test-smoke',
      soundProfileId: 'test-sound',
      environmentBias: [],
      unlock: { kind: 'day', day: 2 },
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
        ambient: 0.4,
        warmth: 0.3,
        keyDirectionDeg: -30,
        contrast: 0.7,
        smokeVisibility: 0.9,
      },
      ambientAudio: { profileId: 'test-sound', gain: 0.3, pan: 0 },
      wind: { base: 0.1, gust: 0.1, directionDeg: 0, variance: 0.2 },
      weather: { bias: { clear: 1 }, rainIntensity: 0, stormWindScale: 2 },
      smokeModifier: {
        density: 1,
        turbulence: 1,
        riseSpeed: 1,
        dispersion: 1,
        tintShift: [200, 200, 200],
      },
      emberModifier: { brightness: 1, flicker: 1, flareBoost: 0 },
      eventPool: [
        'wind',
        'light_change',
        'shadow_change',
        'ambient_event',
        'environment_noise',
        'smoke_swirl',
      ],
      unlock: { kind: 'default' },
    },
    {
      id: 'test-street',
      name: 'Test Street',
      background: {
        kind: 'street',
        sky: [
          [20, 16, 34],
          [44, 24, 52],
        ],
        horizon: [86, 40, 78],
        silhouette: [14, 12, 22],
        fog: 0.4,
        grain: 0.3,
      },
      lighting: {
        ambient: 0.3,
        warmth: 0.1,
        keyDirectionDeg: 50,
        contrast: 0.9,
        smokeVisibility: 1,
      },
      ambientAudio: { profileId: 'test-sound', gain: 0.4, pan: 0.2 },
      wind: { base: 0.5, gust: 0.4, directionDeg: 10, variance: 0.8 },
      weather: { bias: { rain: 1, clear: 1 }, rainIntensity: 0.5, stormWindScale: 2 },
      smokeModifier: {
        density: 1.1,
        turbulence: 1.2,
        riseSpeed: 0.9,
        dispersion: 1.1,
        tintShift: [220, 200, 210],
      },
      emberModifier: { brightness: 1.05, flicker: 1.2, flareBoost: 0.2 },
      eventPool: ['wind', 'rain', 'smoke_swirl', 'ember_flare', 'ash_fall'],
      unlock: { kind: 'sessions', count: 2 },
    },
  ],
  lighters: [
    {
      id: 'test-lighter',
      name: 'Test Lighter',
      ignitionTimeMs: { min: 350, max: 350 },
      failureChance: 0,
      flame: { height: 0.05, flicker: 0.4, hue: [255, 170, 74], sparkles: 3 },
      soundProfileId: 'test-sound',
      unlock: { kind: 'default' },
    },
    {
      id: 'test-flaky',
      name: 'Test Flaky',
      ignitionTimeMs: { min: 300, max: 300 },
      failureChance: 1,
      flame: { height: 0.04, flicker: 0.6, hue: [255, 190, 110], sparkles: 5 },
      soundProfileId: 'test-sound',
      unlock: { kind: 'day', day: 5 },
    },
  ],
  ashtrays: [
    {
      id: 'test-tray',
      name: 'Test Tray',
      catchRadius: 0.12,
      material: { base: [78, 76, 74], rim: [116, 112, 106], reflect: 0.1 },
      soundProfileId: 'test-sound',
      unlock: { kind: 'default' },
    },
  ],
  smokeStyles: [
    {
      id: 'test-smoke',
      name: 'Test Smoke',
      tint: [200, 200, 204],
      opacity: 1,
      blur: 1,
      swirl: 1,
      unlock: { kind: 'default' },
    },
  ],
  soundProfiles: [
    {
      id: 'test-sound',
      name: 'Test Sound',
      layers: [
        { voice: 'draw', gain: 0.4, pitchSpread: 1, timingSpreadMs: 20, pan: 0, loop: true },
      ],
      unlock: { kind: 'default' },
    },
  ],
  skins: [],
  // Three boxes, one per tier: enough for the drop rule to have somewhere to land.
  packs: [
    { id: 'test-low', tier: 'low', brand: '测试低档', priceCny: '≈6', reserved: false },
    { id: 'test-mid', tier: 'mid', brand: '测试中档', priceCny: '≈20', reserved: false },
    { id: 'test-high', tier: 'high', brand: '测试高档', priceCny: '≈90', reserved: false },
    { id: 'test-held', tier: 'high', brand: '测试压轴', priceCny: '≈100', reserved: true },
  ],
};
