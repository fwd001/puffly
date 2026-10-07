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
    /**
     * How long the smoke is meant to be held. `0` is an inhaled draw, whose body keeps arriving
     * sub-linearly for as long as the hand holds it (§14 — a 2s hold is not twice a 1s hold).
     * Any other number is a draw that stays in the mouth (Smoke Ritual 品鉴型: 含住 2 秒再缓缓
     * 吐出): it fills on that fixed rhythm rather than on the rod's jittered draw length, and the
     * ring follows the mouth rather than the clock.
     */
    savourMs: number;
    /**
     * How much resistance one draw leaves behind for the next — a hotter cherry and a faster
     * burn. `0` is a draw that never reaches the lungs (Smoke Ritual 品鉴型: 无肺阻力反馈).
     */
    loadPerPuff: number;
    /**
     * How long the released smoke is breathed out over. `0` is an inhaled draw, which leaves in one
     * rush; anything else is 缓缓吐出 — the same cloud, given a longer life and less speed, so it
     * comes out of the mouth rather than being pushed out of the lungs.
     */
    exhaleMs: number;
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

  /**
   * What the archive (S17) says about this rod. Deliberately two names and nothing more: the
   * numbers the card shows are the ones above (`physical`, `burnDuration`), its 场合 come from
   * `environmentBias`, and a fictional rod has no published market data to quote. §10 forbids
   * inventing any, so inventing none is the field's whole design.
   */
  archive: {
    /** The rod's own name in the language the archive is read in (§9.2: 量词 lives here). */
    zhName: string;
    /** Which of the three interaction families it belongs to: inhaled, savoured, filtered. */
    kind: 'inhale' | 'savor' | 'filter';
  };

  eventPool: string[];
}

/** §37: growth is day/count based on purpose — no RPG numbers. */
export type UnlockRule =
  | { kind: 'default' }
  | { kind: 'day'; day: number }
  | { kind: 'sessions'; count: number }
  /**
   * The ladder the smoking places are hung on. `sessions` counts breaks already kept, which is a
   * number with no shape; a level is the same progress with a floor under it, and the places are
   * ordered by how much of the world you have to have sat still in to be shown them.
   */
  | { kind: 'level'; level: number }
  | { kind: 'puffs'; count: number }
  /** The last skin is gated on the collection, not on volume: 12 boxes, however long it takes. */
  | { kind: 'packs'; count: number };

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
  /** What an ash landing on this material sounds like. */
  soundProfileId: string;
  /** What putting the rod out in this material sounds like — a glass tray rings, a stone one does not. */
  extinguishProfileId: string;
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
  /**
   * 通风系数 (S21): 0 is a sealed cubicle where the smoke has nowhere to go, 1 is a forecourt with
   * a draught over it. It is not a look — it decides how thick the smoke stays and how far it
   * spreads, which is why the same rod is four times more visible in one place than another. The
   * deck calls this the one reason the venue system exists: it builds presence better than a skin
   * ever could, because a skin is allowed to change nothing else.
   */
  ventilation: number;
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
  /**
   * `stairwell` is the landings and under-stairs air of a building; `corner` is the marked-out
   * patch of pavement a smoking area actually is — a wall, a bin, a sign. Both are interiors of a
   * kind, which is why they are their own shapes rather than another `room`.
   */
  kind:
    'sky' | 'room' | 'window' | 'city' | 'street' | 'mountain' | 'desk' | 'stairwell' | 'corner';
  /**
   * Whether the sky's own weather can be *seen* from this place: rain streaks, and anything else
   * that is drawn as falling outside. A stairwell and a desk cannot show it; a window can, and so
   * can the patch of pavement a smoking corner actually is. It is a fact about the place rather
   * than a list the renderer keeps, because §77 makes a new place one entry in this table — and the
   * first thing a new place would do is fail to appear in a switch it never got edited.
   */
  weatherVisible: boolean;
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
  /**
   * What the rod is lying on here, and therefore what lifting it sounds like. Optional because the
   * fallback is a real content profile (`surface-table`) rather than whichever entry sorts first;
   * a scene overrides it when its table is not a table — a stairwell sill, a concrete ledge.
   */
  surfaceProfileId?: string;
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
/** Which of the three price tiers a box belongs to (§ packs.tiers). */
export type PackTier = 'low' | 'mid' | 'high';

/**
 * One slot of the collection (S16, S19): a name in an archive, never an object in the scene.
 * A brand may be named here and nowhere else — no mark, no packaging, no comparison, no ranking,
 * no recommendation, no health claim (§ redlines.noAdvertising).
 */
export interface PackContent {
  id: string;
  tier: PackTier;
  /** Empty for a slot the brief leaves unfilled. It reads as a gap, not as a guess. */
  brand: string;
  /** Always carrying its ≈: a published range, not a price this product knows. */
  priceCny: string;
  /** Held out of the random pool: the finale the last skin is gated on. */
  reserved: boolean;
}

/**
 * A skin is four colours and nothing else (§ redlines.skinIsCosmetic). The four layers are the
 * only thing it may touch — paper, ember, plume and the pool of light on the table — because a
 * palette that could also move a duration would turn cosmetics into difficulty, which is the
 * single easiest way to ruin this product.
 */
/** The four layers a skin may repaint, and the whole of what it may do. */
export type SkinPalette = SkinContent['palette'];

export interface SkinContent {
  id: string;
  name: string;
  palette: { paper: Rgb; ember: Rgb; smoke: Rgb; pool: Rgb };
  unlock: UnlockRule;
}

export interface ContentBundle {
  cigarettes: CigaretteContent[];
  skins: SkinContent[];
  environments: Environment[];
  lighters: LighterContent[];
  ashtrays: AshtrayContent[];
  smokeStyles: SmokeStyleContent[];
  soundProfiles: SoundProfileContent[];
  packs: PackContent[];
}
