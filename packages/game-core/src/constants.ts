import type { Point, Range } from './types/geometry';

/** Fixed simulation step: replay compares like with like (SPEC.md §71). */
export const STEP_MS = 1000 / 60;

export const TIMING = {
  /** Flame reaches full size. */
  flameRiseMs: 260,
  flameFallMs: 220,
  /** `RESTING` window after a puff is released (§11). */
  restSettleMs: 900,
  /** How long the pressure interaction takes (§19). */
  extinguishMs: 720,
  /** Progress at which the smoke burst happens (§19). */
  extinguishBurstAt: 0.42,
  /** Press shorter than this is a tap, not a hold (§14). */
  tapMaxMs: 150,
  /** Draw length of a tap-sized puff (§14). */
  microPuffMs: 180,
  /** Discard settle (§20). */
  discardSettleMs: 800,
  /** A fresh rod becomes available this long after the previous one was discarded. */
  newRodDelayMs: 1200,
  /** Exponential decay rate of a flare spike, per ms (§17). */
  flareDecayPerMs: 0.0025,
  /** Thin smoke after extinguishing (§19). */
  waningSmokeMs: 6000,
  /** Controls fade out after this much stillness (§10). */
  controlsIdleMs: 2600,
  /** Ash falls on its own if nobody flicks within this window of being critical. */
  ashPatienceMs: 9000,
} as const;

export const THRESHOLDS = {
  /** Below this remaining rod the cigarette is a stub (§11 NEAR_END). */
  nearEndRodFraction: 0.16,
  /** Ash ratio at which the column starts asking to be flicked (§18). */
  ashCriticalRatio: 0.82,
  /** Ash below this reads as nothing, so we do not draw a stub of grey. */
  ashVisibleFraction: 0.04,
  /** Ember is considered lit above this brightness. */
  litBrightness: 0.12,
} as const;

export const BURN = {
  /** Drawing pulls air, so the cherry consumes faster while puffing (§14). */
  puffRateMultiplier: 1.9,
  /** Extra consumption from accumulated load, at full load. */
  loadRateMultiplier: 0.45,
  /** Fraction of consumed rod that becomes an ash column; the rest is dust. */
  ashYield: 0.6,
  /** Idle smoulder burn-rate variation, so two identical cigarettes differ (§12). */
  smoulderJitter: 0.08,
} as const;

export const PUFF = {
  /** Holds get stronger sub-linearly: a 2s hold is not twice a 1s hold (§14). */
  intensityCurve: 0.7,
  /** Calms down between puffs so `RESTING` is a real rest (§8). */
  loadDecayPerSecond: 0.18,
} as const;

export const ASH = {
  /** Bent proportional to `ratio` squared — a short column does not sag (§18). */
  bendExponent: 2,
  maxBendRad: 0.42,
  /** Falling fragments per flick, scaled by column length. */
  fragmentsPerFlick: 4,
  gravityPerSecond: 0.55,
} as const;

export const SMOKE = {
  /** Ambient particles per second at density 1, before quality scaling (§54). */
  baseEmissionPerSecond: 34,
  /** Continuous drift of the whole column, normalised units/second per wind unit. */
  driftPerWind: 0.055,
  /** Quality ceilings: particle budget per tier (§54 object pooling + budget). */
  budget: { high: 1400, balanced: 800, light: 380, reducedMotion: 160 } as const,
  /** Per-puff variance envelopes (§16). */
  variance: {
    directionDeg: 34,
    speed: 0.55,
    scale: 0.6,
    life: 0.45,
    turbulence: 0.7,
  } as const,
} as const;

export const EMBER = {
  baselineGlow: 0.024,
  maxGlow: 0.075,
  /** Flare chance is evaluated once per this many ms (§17: "偶尔"). */
  flareCheckMs: 500,
} as const;

/** Stage layout, in normalised coordinates (SPEC.md §55). */
export const LAYOUT: Record<'pack' | 'lighter' | 'ashtray' | 'restPivot' | 'table', Point> = {
  // Everything on the table lies above the chrome line (`CHROME_CLEAR_Y` in the stage): the pill
  // and the rail are drawn over the bottom of the scene at every window size, and a rod under
  // them is hidden behind the button that operates it.
  pack: { x: 0.28, y: 0.685 },
  /** Where a fresh rod lies before anyone picks it up: beside the pack, not on top of it. */
  table: { x: 0.415, y: 0.705 },
  lighter: { x: 0.135, y: 0.575 },
  ashtray: { x: 0.755, y: 0.67 },
  restPivot: { x: 0.5, y: 0.505 },
};

export const ANGLES = {
  /** Held, tip slightly raised — the way a real one sits between fingers. */
  heldDeg: -17,
  tableDeg: 6,
  trayDeg: 11,
} as const;

/** Generous hit radii in normalised units (SPEC.md §66: no precise pixel targets). */
export const HIT: Record<'body' | 'ember' | 'ash' | 'lighter' | 'ashtray', number> = {
  body: 0.1,
  ember: 0.085,
  ash: 0.075,
  lighter: 0.095,
  /**
   * A floor, not the tray's size: the drawn tray is at least this wide in every layout, and
   * `touchReach` adds the finger budget on top. Higher than this and the tray's touch area
   * reaches past its own rim onto whatever is lying next to it.
   */
  ashtray: 0.1,
};

export const WORLD = {
  /** Gap between world events is sampled from this envelope, never a period (§81 (8)). */
  defaultGap: { min: 4200, max: 13_000 } satisfies Range,
  /** How many world events may overlap. */
  maxActive: 3,
  /** Cross-fade of a weather change, ms. */
  weatherShiftMs: 4000,
} as const;

export const TIME_OF_DAY_HOURS: Record<
  'morning' | 'afternoon' | 'sunset' | 'night' | 'late-night',
  Range
> = {
  morning: { min: 5, max: 11 },
  afternoon: { min: 11, max: 17 },
  sunset: { min: 17, max: 20 },
  night: { min: 20, max: 24 },
  'late-night': { min: 0, max: 5 },
};
