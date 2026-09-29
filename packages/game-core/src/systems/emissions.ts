/**
 * Burst recipes — SPEC.md §15, §16.
 *
 * Game Core does not own particles (that is the renderer's job, §47) but it does own
 * *what kind of smoke this puff is*: a seeded recipe with explicit variance envelopes,
 * so every puff looks different (§16) while still being reproducible from the session
 * seed alone (§71).
 */

import { clamp01, mixRgb, type Rgb } from '@puffly/shared';
import { SMOKE } from '../constants';
import type { Burst, BurstKind } from '../types/events';
import type { SmokeCharacter } from '../types/content';
import type { Point } from '../types/geometry';
import type { EngineRuntime } from '../runtime';

export interface BurstOptions {
  kind: BurstKind;
  origin: Point;
  /** Base particle count before variance and quality scaling (§54 budget). */
  count: number;
  directionDeg: number;
  spreadDeg: number;
  speed: [number, number];
  radius: [number, number];
  lifeMs: [number, number];
  alphaPeak: number;
  rise: number;
  turbulence: number;
  scaleGrowth?: number;
  gravity?: number;
  tint?: Rgb;
  heat?: number;
}

function qualityScale(rt: EngineRuntime): number {
  if (rt.settings.reducedMotion) return 0.28;
  switch (rt.settings.quality) {
    case 'light':
      return 0.5;
    case 'balanced':
      return 0.75;
    case 'high':
      return 1;
    default:
      return 1;
  }
}

/**
 * How a rod's character reshapes every puff it produces. Multipliers, not overrides:
 * the rod's own `smokeProfile` numbers still lead, so two rods of the same character
 * differ, and the same rod in two environments differs again (§16, §77).
 */
export interface PlumeShape {
  count: number;
  spread: number;
  speed: number;
  radius: number;
  life: number;
  alpha: number;
  rise: number;
  turbulence: number;
  gravity: number;
}

const PLAMES: Record<SmokeCharacter, PlumeShape> = {
  column: {
    count: 0.85,
    spread: 0.5,
    speed: 1.0,
    radius: 0.8,
    life: 1.15,
    alpha: 1.0,
    rise: 1.25,
    turbulence: 0.7,
    gravity: 0,
  },
  haze: {
    count: 1.15,
    spread: 1.5,
    speed: 0.7,
    radius: 1.2,
    life: 1.4,
    alpha: 0.7,
    rise: 0.7,
    turbulence: 1.0,
    gravity: 0,
  },
  curls: {
    count: 1.0,
    spread: 1.15,
    speed: 1.05,
    radius: 1.0,
    life: 1.0,
    alpha: 0.95,
    rise: 1.0,
    turbulence: 1.7,
    gravity: 0,
  },
  curtain: {
    count: 1.3,
    spread: 1.9,
    speed: 0.8,
    radius: 1.15,
    life: 1.5,
    alpha: 0.85,
    rise: -0.45,
    turbulence: 1.1,
    gravity: 0.3,
  },
  bloom: {
    count: 1.4,
    spread: 1.35,
    speed: 1.4,
    radius: 1.1,
    life: 0.75,
    alpha: 1.1,
    rise: 1.15,
    turbulence: 1.25,
    gravity: -0.06,
  },
};

export function plumeFor(character: SmokeCharacter): PlumeShape {
  return PLAMES[character] ?? PLAMES.haze;
}

/** Every numeric envelope gets its own sample, which is what §16 asks for. */
export function makeBurst(rt: EngineRuntime, options: BurstOptions): Burst {
  const rng = rt.rng;
  const v = SMOKE.variance;
  const density = clamp01(rt.state.smoke.density);
  const plume = plumeFor(rt.state.smoke.character);

  const count = Math.max(
    1,
    Math.round(
      options.count * plume.count * qualityScale(rt) * rng.range(1 - v.speed, 1 + v.speed),
    ),
  );
  const directionDeg = options.directionDeg + rng.range(-v.directionDeg, v.directionDeg);
  const speedFactor = plume.speed * rng.range(1 - v.speed * 0.5, 1 + v.speed);
  const radiusFactor = plume.radius * rng.range(1 - v.scale * 0.4, 1 + v.scale);
  const lifeFactor = plume.life * rng.range(1 - v.life * 0.5, 1 + v.life);
  const turbulence =
    options.turbulence * plume.turbulence * rng.range(1 - v.turbulence * 0.4, 1 + v.turbulence);

  return {
    id: rt.ids.next('burst'),
    kind: options.kind,
    seed: rng.int(1, 0x7ffffffe),
    origin: { x: options.origin.x, y: options.origin.y },
    count,
    directionDeg,
    spreadDeg: options.spreadDeg * plume.spread * rng.range(0.85, 1.2),
    speed: { min: options.speed[0] * speedFactor, max: options.speed[1] * speedFactor },
    radius: { min: options.radius[0] * radiusFactor, max: options.radius[1] * radiusFactor },
    lifeMs: { min: options.lifeMs[0] * lifeFactor, max: options.lifeMs[1] * lifeFactor },
    alphaPeak: clamp01(
      options.alphaPeak * plume.alpha * (0.75 + density * 0.5) * rng.range(0.9, 1.1),
    ),
    alphaDecay: rng.range(0.55, 0.95),
    rise: options.rise * plume.rise * rng.range(0.85, 1.15),
    turbulence,
    scaleGrowth: options.scaleGrowth ?? 2.4,
    gravity: (options.gravity ?? 0) + plume.gravity,
    tint: options.tint ?? rt.state.smoke.tint,
    heat: options.heat ?? 0,
  };
}

const tipAngle = (rt: EngineRuntime): number => rt.state.cigarette.pose.angleDeg - 90;

/** A wisp escaping the cherry while the draw is held (§14). */
export function puffBurst(rt: EngineRuntime): Burst {
  const smoke = rt.cigarette.smokeProfile;
  const intensity = rt.state.cigarette.puff.intensity;
  return makeBurst(rt, {
    kind: 'puff',
    origin: rt.state.cigarette.pose.tip,
    count: 10 + Math.round(26 * intensity),
    directionDeg: tipAngle(rt),
    spreadDeg: 26,
    speed: [0.012, 0.05],
    radius: [0.006, 0.02],
    lifeMs: [900, 2200],
    alphaPeak: 0.22 + 0.3 * intensity,
    rise: smoke.riseSpeed * (0.5 + intensity),
    turbulence: smoke.turbulence * 1.1,
    heat: clamp01(rt.state.cigarette.ember.brightness),
  });
}

/** Release: the drawn smoke expands outward and up (§14 "smoke expands"). */
export function exhaleBurst(
  rt: EngineRuntime,
  intensity = rt.state.cigarette.puff.intensity,
): Burst {
  const smoke = rt.cigarette.smokeProfile;
  const modifier = rt.environment.smokeModifier;
  return makeBurst(rt, {
    kind: 'exhale',
    origin: rt.state.cigarette.pose.tip,
    count: 34 + Math.round(86 * intensity),
    directionDeg: tipAngle(rt) + 8,
    spreadDeg: 62,
    speed: [0.02, 0.09 + 0.1 * intensity],
    radius: [0.01, 0.04],
    lifeMs: [2600, 6400],
    alphaPeak: 0.2 + 0.26 * intensity,
    rise: smoke.riseSpeed * modifier.riseSpeed * (0.8 + intensity * 0.9),
    turbulence: smoke.turbulence * modifier.turbulence * (0.9 + intensity),
    scaleGrowth: 2.2,
    heat: clamp01(intensity * 0.35),
  });
}

/** The lazy column that rises from a smouldering cherry (§15 continuous drift). */
export function driftBurst(rt: EngineRuntime, count = 18): Burst {
  const smoke = rt.cigarette.smokeProfile;
  return makeBurst(rt, {
    kind: 'drift',
    origin: rt.state.cigarette.pose.tip,
    count,
    directionDeg: tipAngle(rt),
    spreadDeg: 34,
    speed: [0.006, 0.03],
    radius: [0.007, 0.028],
    lifeMs: [3200, 7800],
    alphaPeak: 0.13,
    rise: smoke.riseSpeed,
    turbulence: smoke.turbulence,
    scaleGrowth: 1.7,
  });
}

export function flareBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'flare',
    origin: rt.state.cigarette.pose.tip,
    count: 8,
    directionDeg: tipAngle(rt),
    spreadDeg: 90,
    speed: [0.02, 0.08],
    radius: [0.004, 0.014],
    lifeMs: [700, 1800],
    alphaPeak: 0.34,
    rise: rt.cigarette.smokeProfile.riseSpeed * 1.4,
    turbulence: rt.cigarette.smokeProfile.turbulence * 1.6,
    heat: 1,
  });
}

export function sparkBurst(rt: EngineRuntime, heat: number): Burst {
  return makeBurst(rt, {
    kind: 'ember',
    origin: rt.state.cigarette.pose.tip,
    count: 14,
    directionDeg: tipAngle(rt),
    spreadDeg: 120,
    speed: [0.03, 0.12],
    radius: [0.002, 0.007],
    lifeMs: [260, 900],
    alphaPeak: 0.7,
    rise: 0.12,
    turbulence: 1.4,
    gravity: 0.35,
    heat,
    tint: rt.cigarette.palette.filter,
  });
}

/** Ash letting go: gritty fragments plus a small grey puff (§18). */
export function ashDustBurst(rt: EngineRuntime, origin: Point, ratio: number): Burst {
  return makeBurst(rt, {
    kind: 'ash',
    origin,
    count: 6 + Math.round(16 * ratio),
    directionDeg: 100,
    spreadDeg: 70,
    speed: [0.004, 0.03],
    radius: [0.0015, 0.006],
    lifeMs: [900, 2400],
    alphaPeak: 0.5,
    rise: -0.02,
    turbulence: 0.7,
    gravity: 0.5,
    tint: rt.cigarette.palette.ash,
    scaleGrowth: 1.1,
  });
}

/** §19: burst first, then a thin trail. */
export function extinguishBurst(rt: EngineRuntime): Burst {
  const style = rt.smokeStyle;
  return makeBurst(rt, {
    kind: 'extinguish',
    origin: rt.state.cigarette.pose.tip,
    count: 46,
    directionDeg: tipAngle(rt) - 10,
    spreadDeg: 110,
    speed: [0.05, 0.18],
    radius: [0.014, 0.06],
    lifeMs: [1400, 3600],
    alphaPeak: 0.34,
    rise: 0.34,
    turbulence: 2.1 * style.swirl,
    scaleGrowth: 2.4,
    tint: mixRgb(rt.state.smoke.tint, [255, 255, 255], 0.2),
  });
}

export function wispBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'drift',
    origin: rt.state.cigarette.pose.tip,
    count: 7,
    directionDeg: tipAngle(rt) - 6,
    spreadDeg: 22,
    speed: [0.004, 0.016],
    radius: [0.008, 0.03],
    lifeMs: [2400, 5200],
    alphaPeak: 0.1,
    rise: 0.1,
    turbulence: 0.8,
  });
}

/** §20: the small puff of dust when it lands in the tray. */
export function discardImpactBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'impact',
    origin: rt.state.anchors.ashtray,
    count: 10,
    directionDeg: -90,
    spreadDeg: 120,
    speed: [0.01, 0.05],
    radius: [0.003, 0.012],
    lifeMs: [500, 1600],
    alphaPeak: 0.3,
    rise: 0.05,
    turbulence: 0.9,
    gravity: 0.4,
    tint: rt.ashtray.material.base,
  });
}

export function lighterBurst(rt: EngineRuntime): Burst {
  return makeBurst(rt, {
    kind: 'lighter',
    origin: rt.state.lighter.at,
    count: 6,
    directionDeg: -90,
    spreadDeg: 60,
    speed: [0.02, 0.07],
    radius: [0.002, 0.007],
    lifeMs: [220, 700],
    alphaPeak: 0.5,
    rise: 0.2,
    turbulence: 1.2,
    heat: 0.9,
    gravity: -0.1,
  });
}

/** A gust visibly pushes the whole column sideways (§6 wind). */
export function windGustBurst(rt: EngineRuntime, strength: number): Burst {
  return makeBurst(rt, {
    kind: 'drift',
    origin: rt.state.cigarette.pose.tip,
    count: Math.round(12 + 30 * strength),
    directionDeg: rt.state.world.windDirectionDeg,
    spreadDeg: 120,
    speed: [0.04, 0.14 + 0.1 * strength],
    radius: [0.012, 0.05],
    lifeMs: [1800, 4200],
    alphaPeak: 0.3,
    rise: 0.12,
    turbulence: 2.4 * strength,
  });
}
