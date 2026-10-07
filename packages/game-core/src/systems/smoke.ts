/**
 * The smoke field — SPEC.md §15, §16, §24, §25.
 *
 * Continuous values only (density, turbulence, rise, dispersion, drift, tint,
 * visibility): the renderer turns these into particles, and discrete happenings
 * arrive as bursts from the event systems. Weather and time of day reach the smoke
 * exclusively through the environment's modifiers, which is what keeps §24 silent —
 * the player never sees a label saying "night mode", the smoke just reads differently.
 */

import { approach, clamp01, mixRgb, degToRad } from '@puffly/shared';
import { SMOKE, TIMING } from '../constants';
import type { CigaretteContent, SmokeCharacter } from '../types/content';
import { emit } from '../emit';
import { isLit } from '../stateMachine';
import { driftBurst, wispBurst } from './emissions';
import type { EngineRuntime } from '../runtime';

/**
 * Content may name a rod's plume personality; when it does not, the numbers say it.
 * Single home for that fallback, so the burst recipes and the renderer always agree.
 */
export function deriveSmokeCharacter(cigarette: CigaretteContent): SmokeCharacter {
  if (cigarette.character) return cigarette.character;
  const { density, turbulence, riseSpeed, dispersion } = cigarette.smokeProfile;
  if (riseSpeed < 0.22 && dispersion > 1.1) return 'curtain';
  if (turbulence > 1.3) return 'curls';
  if (density > 1.1 && riseSpeed > 0.3) return 'bloom';
  if (riseSpeed > 0.36 && dispersion < 0.7) return 'column';
  return 'haze';
}

/** Per-character shaping multipliers, applied on top of the rod's own profile numbers. */
const CHARACTER_SHAPE: Record<
  SmokeCharacter,
  { rise: number; turbulence: number; dispersion: number; density: number }
> = {
  column: { rise: 1.15, turbulence: 0.72, dispersion: 0.75, density: 0.95 },
  haze: { rise: 0.7, turbulence: 0.95, dispersion: 1.35, density: 0.85 },
  curls: { rise: 0.95, turbulence: 1.65, dispersion: 1.1, density: 1 },
  curtain: { rise: -0.25, turbulence: 1.1, dispersion: 1.5, density: 1.2 },
  bloom: { rise: 1.3, turbulence: 1.2, dispersion: 1.25, density: 1.1 },
};

/** Particles per ambient burst: small enough that the column never looks striped. */
const AMBIENT_BATCH = 9;

function densityTarget(rt: EngineRuntime): number {
  const cigarette = rt.state.cigarette;
  const profile = rt.cigarette.smokeProfile;
  const modifier = rt.environment.smokeModifier;
  const lit = isLit(cigarette.state) && cigarette.ember.lit;

  const draw = cigarette.puff.active ? 0.5 + 0.5 * cigarette.puff.intensity : 0;
  const smoulder = lit ? 0.24 + 0.34 * cigarette.ember.brightness : 0;
  const waning =
    cigarette.state === 'EXTINGUISHED'
      ? 0.18 * Math.max(0, 1 - rt.timers.waningMs / TIMING.waningSmokeMs)
      : 0;

  return clamp01(
    profile.density *
      modifier.density *
      CHARACTER_SHAPE[rt.state.smoke.character].density *
      (draw + smoulder + waning),
  );
}

/**
 * S21's own endpoints. 0.05 is the sealed cubicle the deck starts its scale with, 0.90 the forecourt
 * with a draught over it — everything the ventilation does is measured across that span rather than
 * from zero, so a room at or below the sealed end is the picture every plume calibration was made
 * at, and only the genuinely open places pay for it.
 */
const VENT_SEALED = 0.05;
const VENT_OPEN = 0.9;

/**
 * 通风系数 as 0..1 from the sealed end (S21). Both halves of the mechanic — how thick the smoke
 * hangs and how far it is carried — are driven by this one number, and the renderer reads the
 * spread through it too, because there is one fact per place and the renderer is not allowed to
 * invent a second one.
 */
export const ventDraught = (ventilation: number): number =>
  clamp01((ventilation - VENT_SEALED) / (VENT_OPEN - VENT_SEALED));

export function tickSmoke(rt: EngineRuntime, dtMs: number): void {
  const profile = rt.cigarette.smokeProfile;
  const modifier = rt.environment.smokeModifier;
  const style = rt.smokeStyle;
  const field = rt.state.smoke;
  const shape = CHARACTER_SHAPE[field.character];
  const cigarette = rt.state.cigarette;
  const world = rt.state.world;
  const boost = rt.worldBoost;
  const lit = isLit(cigarette.state) && cigarette.ember.lit;

  field.density = approach(field.density, densityTarget(rt), lit ? 5.5 : 1.4, dtMs);

  // Turbulence is a slow weather, not a per-frame dice. Rolled fresh every 16 ms it made the
  // whole field shiver in place — the "background keeps wobbling" a player notices within a
  // second of opening the app, and the one thing standing smoke never does. The sample stays,
  // so the replay still consumes the same numbers; what changes is how fast it is allowed to.
  const turbulenceTarget =
    profile.turbulence *
    modifier.turbulence *
    style.swirl *
    shape.turbulence *
    (1 + boost.turbulence) *
    (0.85 + rt.rng.range(0, 0.3));
  field.turbulence = approach(field.turbulence, turbulenceTarget, 1.1, dtMs);

  // Rain and heavy air put a lid on the rise (§25: weather mainly changes smoke).
  field.riseSpeed =
    profile.riseSpeed *
    modifier.riseSpeed *
    (1 - clamp01(boost.rain) * 0.35) *
    (0.9 + 0.2 * field.density);
  // 通风系数 (S21). A sealed stairwell keeps its smoke: it hangs, layers and reads as a body of
  // smoke at the same brightness a rooftop loses in two seconds. The half that belongs to the
  // simulation is this one — how much of the puff is still there to see. The other half the deck
  // names, 扩散半径, is spent where a radius becomes pixels (`spread` in the renderer), because
  // `smoke.dispersion` is the rod's authored tendency and multiplying a venue into it would change
  // a number nothing reads.
  const draught = ventDraught(rt.environment.ventilation);
  field.dispersion =
    profile.dispersion * modifier.dispersion * shape.dispersion * (1 + Math.abs(world.wind) * 0.5);

  const radians = degToRad(world.windDirectionDeg);
  field.drift.x = Math.cos(radians) * world.wind * SMOKE.driftPerWind;
  field.drift.y =
    Math.sin(radians) * world.wind * SMOKE.driftPerWind * 0.35 - 0.01 * field.riseSpeed;

  // 0.75 is what makes the deck's number real: the same rod at the sealed end and at the open end
  // reads four times brighter, and that difference is the point of the whole system.
  field.visibility =
    world.light.smokeVisibility * (0.7 + 0.3 * boost.ambient) * (1 - draught * 0.75);
  field.tint = mixRgb(style.tint, modifier.tintShift, 0.35);

  const active = lit || cigarette.state === 'EXTINGUISHED' || cigarette.state === 'EXTINGUISHING';
  field.emissionRate = active ? SMOKE.baseEmissionPerSecond * field.density : 0;

  rt.smokeEmissionCarry += (field.emissionRate * dtMs) / 1000;
  if (rt.smokeEmissionCarry >= AMBIENT_BATCH) {
    const batches = Math.floor(rt.smokeEmissionCarry / AMBIENT_BATCH);
    rt.smokeEmissionCarry -= batches * AMBIENT_BATCH;
    for (let i = 0; i < batches; i++) {
      emit(rt, {
        kind: 'burst',
        atMs: rt.state.nowMs,
        burst: cigarette.ember.lit ? driftBurst(rt, AMBIENT_BATCH) : wispBurst(rt),
      });
    }
  }
}
