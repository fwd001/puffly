/**
 * Content models — SPEC.md §12, §13, §23, §25, §37, §38.
 *
 * Nothing here references a real tobacco brand (§84), and every behaviour a player
 * can notice is a number in content rather than a branch in code (§77).
 */

import type { Rgb } from '@puffly/shared';

/** SPEC.md §12 — field names and nesting kept exactly as specified. */
export interface CigaretteType {
  id: string;

  burnDuration: {
    min: number;
    max: number;
  };

  puffProfile: {
    intensityMin: number;
    intensityMax: number;
    durationMin: number;
    durationMax: number;
  };

  smokeProfile: {
    density: number;
    turbulence: number;
    riseSpeed: number;
    dispersion: number;
  };

  emberProfile: {
    brightness: number;
    flicker: number;
    flareChance: number;
  };

  ashProfile: {
    minLength: number;
    maxLength: number;
  };

  /**
   * The four real measurements of a stick — Smoke Ritual's "Frozen Core". They are physics, not
   * balance: a skin may recolour everything except these (§6.1), and the head-up display reads
   * them as millimetres and grams rather than as points. `puffs.target` is what a stick is planned
   * for (the denominator of "6 / 12"); the range is how far a real one wanders.
   */
  physical: {
    /** Millimetres of a pristine rod, filter included. */
    lengthMm: number;
    /** Grammes of ash the whole stick leaves behind. */
    ashGrams: number;
    /** Degrees Celsius at the cherry, low and high of this rod's own range. */
    centerTempC: [number, number];
    puffs: { target: number; min: number; max: number };
  };

  eventPool: string[];
}

/** §37: growth is day/count based on purpose — no RPG numbers. */
export type UnlockRule =
  | { kind: 'default' }
  | { kind: 'day'; day: number }
  | { kind: 'sessions'; count: number }
  | { kind: 'puffs'; count: number };

/**
 * How a rod's smoke behaves as a body of air, not just how much of it there is (§13):
 *  - `column` a narrow, lazy climb (the plain smoulder everyone recognises)
 *  - `haze`   wide, slow, low-contrast: it fills and lingers
 *  - `curls`  restless: it rolls and eddies as it rises
 *  - `curtain` heavy and cold: it pours downward and lies on the table
 *  - `bloom`  balloons outward on the exhale and fades fast
 */
export type SmokeCharacter = 'column' | 'haze' | 'curls' | 'curtain' | 'bloom';

/** §13: original fictional cigarettes only. */
export interface CigaretteContent extends CigaretteType {
  name: string;
  /** Omit it and Game Core derives one from `smokeProfile` (§77: data first, defaults free). */
  character?: SmokeCharacter;
  palette: { paper: Rgb; band: Rgb; filter: Rgb; ash: Rgb };
  smokeStyleId: string;
  soundProfileId: string;
  environmentBias: string[];
  unlock: UnlockRule;
}

export interface LighterContent {
  id: string;
  name: string;
  /** How long the flame must be held before the cigarette catches (ms). */
  ignitionTimeMs: { min: number; max: number };
  /** §21 `lighter_failure` base chance per ignition attempt. */
  failureChance: number;
  flame: { height: number; flicker: number; hue: Rgb; sparkles: number };
  soundProfileId: string;
  unlock: UnlockRule;
}

export interface AshtrayContent {
  id: string;
  name: string;
  /** Normalised stage radius that catches a released cigarette (§20, §66: no tiny targets). */
  catchRadius: number;
  material: { base: Rgb; rim: Rgb; reflect: number };
  soundProfileId: string;
  unlock: UnlockRule;
}

export interface SmokeStyleContent {
  id: string;
  name: string;
  tint: Rgb;
  opacity: number;
  blur: number;
  swirl: number;
  unlock: UnlockRule;
}

/** §26: sounds are synthesised voices, not files. A profile is a layer recipe. */
export interface SoundProfileContent {
  id: string;
  name: string;
  layers: AudioLayer[];
  unlock: UnlockRule;
}

export type AudioVoiceId =
  | 'click'
  | 'flame'
  | 'draw'
  | 'crackle'
  | 'ember'
  | 'puff'
  | 'hiss'
  | 'ash'
  | 'wind'
  | 'rain'
  | 'room'
  | 'city'
  | 'chime';

export interface AudioLayer {
  voice: AudioVoiceId;
  gain: number;
  /** ± semitones sampled per trigger, so nothing repeats mechanically (§26). */
  pitchSpread: number;
  /** ± milliseconds of start jitter. */
  timingSpreadMs: number;
  /** -1..1 stereo placement before the pan modifier. */
  pan: number;
  loop: boolean;
}

/** §25. */
export type WeatherId = 'clear' | 'cloudy' | 'rain' | 'wind' | 'storm';

/** §24. */
export type TimeOfDayId = 'morning' | 'afternoon' | 'sunset' | 'night' | 'late-night';

/** §23: the shape of SPEC.md §23 with each field given a concrete type. */
export interface Environment {
  id: string;
  name: string;
  background: BackgroundSpec;
  lighting: LightingSpec;
  ambientAudio: AmbientAudioSpec;
  wind: WindSpec;
  weather: WeatherSpec;
  smokeModifier: SmokeModifier;
  emberModifier: EmberModifier;
  eventPool: string[];
  /** §24: per-time-of-day overrides; missing keys fall back to the base spec. */
  timeVariants?: Partial<Record<TimeOfDayId, EnvironmentVariant>>;
  unlock: UnlockRule;
}

/** A variant only names what differs from the base environment (§24). */
export interface EnvironmentVariant {
  lighting?: Partial<LightingSpec>;
  wind?: Partial<WindSpec>;
  weatherBias?: Partial<Record<WeatherId, number>>;
  ambientAudio?: Partial<AmbientAudioSpec>;
}

export interface BackgroundSpec {
  /** Drawn by the renderer from these numbers — no bitmaps, no GIFs (§15, §87). */
  kind: 'sky' | 'room' | 'window' | 'city' | 'street' | 'mountain' | 'desk';
  sky: [Rgb, Rgb];
  horizon: Rgb;
  silhouette: Rgb;
  fog: number;
  grain: number;
}

export interface LightingSpec {
  /** 0..1 overall exposure of the scene. */
  ambient: number;
  /** 0 (warm/tungsten) .. 1 (cool/daylight). */
  warmth: number;
  keyDirectionDeg: number;
  contrast: number;
  /** How strongly smoke reads against this background (§24: night smoke glows). */
  smokeVisibility: number;
}

export interface AmbientAudioSpec {
  profileId: string;
  gain: number;
  pan: number;
}

export interface WindSpec {
  /** Normalised stage units per second. */
  base: number;
  gust: number;
  directionDeg: number;
  variance: number;
}

export interface WeatherSpec {
  /** Weighted draw at session start; §25 says weather mainly changes smoke/sound/light. */
  bias: Partial<Record<WeatherId, number>>;
  rainIntensity: number;
  /** Multiplier applied to the environment's own wind when weather is `wind`/`storm`. */
  stormWindScale: number;
}

export interface SmokeModifier {
  density: number;
  turbulence: number;
  riseSpeed: number;
  dispersion: number;
  tintShift: Rgb;
}

export interface EmberModifier {
  brightness: number;
  flicker: number;
  flareBoost: number;
}

/** Everything the game needs to exist; §77 means adding content is adding data. */
export interface ContentBundle {
  cigarettes: CigaretteContent[];
  environments: Environment[];
  lighters: LighterContent[];
  ashtrays: AshtrayContent[];
  smokeStyles: SmokeStyleContent[];
  soundProfiles: SoundProfileContent[];
}
