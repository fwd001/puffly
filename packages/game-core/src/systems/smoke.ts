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
const CHARACTER_SHAPE: Record<SmokeCharacter, { rise: number; turbulence: number; dispersion: number; density: number }> = {
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
    profile.density * modifier.density * CHARACTER_SHAPE[rt.state.smoke.character].density * (draw + smoulder + waning),
  );
}

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

  field.turbulence =
    profile.turbulence *
    modifier.turbulence *
    style.swirl *
    shape.turbulence *
    (1 + boost.turbulence) *
    (0.85 + rt.rng.range(0, 0.3));

  // Rain and heavy air put a lid on the rise (§25: weather mainly changes smoke).
  field.riseSpeed =
    profile.riseSpeed *
    modifier.riseSpeed *
    (1 - clamp01(boost.rain) * 0.35) *
    (0.9 + 0.2 * field.density);
  field.dispersion =
    profile.dispersion * modifier.dispersion * shape.dispersion * (1 + Math.abs(world.wind) * 0.5);

  const radians = degToRad(world.windDirectionDeg);
  field.drift.x = Math.cos(radians) * world.wind * SMOKE.driftPerWind;
  field.drift.y =
    Math.sin(radians) * world.wind * SMOKE.driftPerWind * 0.35 - 0.01 * field.riseSpeed;

  field.visibility = world.light.smokeVisibility * (0.7 + 0.3 * boost.ambient);
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
