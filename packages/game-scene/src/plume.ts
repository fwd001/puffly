/**
 * The plume, driven by the core rather than by a recipe copied out of the 2D renderer.
 *
 * The pool itself is the Canvas 2D layer's own (`ParticlePool`): its physics, its noise field and
 * its lifetimes are exactly what the picture has been built on, and P5 moves it here for good. What
 * is *not* copied is the recipe — how many puffs a second and how they look arrives in the state
 * view (`smoke.emissionRate`, `smoke.density`, `smoke.turbulence`, `smoke.riseSpeed`,
 * `smoke.dispersion`, `smoke.tint`), because a second copy of a recipe is how this repository ended
 * up with a browser layer that reported a working game as eight broken ones.
 */
import type { GameStateView } from '@puffly/game-core';
import type { SpawnInit } from '@puffly/game-renderer';

/**
 * How hard still air drags a puff back to rest, per second. The aerosol's own number, not the ash's
 * 0.9/s: with the ash figure an exhaled cloud crosses the whole stage in about two seconds, which
 * the README records as the defect that turned the plume into 烟会到左上角.
 */
export const PLUME_DRAG = 12;

/**
 * Is the rod making smoke at all?
 *
 * The core answers this itself: `smoke.emissionRate` is "particles per second the ambient emitter
 * should produce right now", and it already knows the difference between an unlit rod, a caught
 * cherry and one being stubbed out. Reading a state id here instead would be this layer deciding,
 * a second time, something the simulation has already decided.
 */
export function isAlight(state: Pick<GameStateView, 'smoke'>): boolean {
  return state.smoke.emissionRate > 0;
}

export interface PlumePlace {
  /** World units. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * One puff's initial conditions, from the state view. `spread` is drawn by the caller so the pool
 * stays deterministic under a seeded rng rather than reading Math.random behind the core's back.
 */
export function plumeSpawn(state: GameStateView, at: PlumePlace, spread: () => number): SpawnInit {
  const smoke = state.smoke;
  const opacity = state.style.smoke.opacity;
  const rise = 0.06 + smoke.riseSpeed * 0.12;
  const side = (spread() - 0.5) * 0.05 * (0.4 + smoke.turbulence);
  return {
    x: at.x + (spread() - 0.5) * 0.02,
    y: at.y,
    vx: side + smoke.drift.x * 0.02,
    vy: rise * (0.7 + spread() * 0.6),
    radius: 0.02 + smoke.density * 0.02,
    alphaPeak: Math.min(1, 0.18 + smoke.density * 0.5) * opacity,
    alphaDecay: 0.55 + smoke.dispersion * 0.4,
    life: 1400 + smoke.riseSpeed * 2200,
    noiseSeed: Math.floor(spread() * 65536),
    rotation: spread() * Math.PI * 2,
    scale: 0.8 + spread() * 0.5,
    scaleGrowth: 1.2 + smoke.dispersion * 1.6,
    turbulence: smoke.turbulence * 0.5,
    rise: rise * 0.5,
    gravity: 0,
    drag: PLUME_DRAG,
    layer: null,
    tint: [smoke.tint[0], smoke.tint[1], smoke.tint[2]],
    heat: 0,
    depth: 0,
    spark: false,
  };
}
