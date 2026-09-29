/**
 * Burst intake: a Game Core recipe becomes particles.
 *
 * The recipe carries a seed, so this expansion is reproducible — the same session replays
 * into the same smoke (§71) while still never looking like the previous puff (§16).
 * Everything here works in normalised stage units, so resolution never changes the physics.
 */

import { createRng } from '@puffly/shared';
import type { Burst } from '@puffly/game-core';
import type { ParticlePool } from './particles';

/** Lattice size for the curl field: about eight cells across the visible stage. */
export const FIELD_SCALE = 8;

export interface IntakeOptions {
  /** 0..1; quality and reduced motion both arrive here already decided by settings (§64). */
  densityScale: number;
  /** Only draw puffs this far into the future; used to keep a stalled tab from dumping. */
  maxSpawnPerFrame?: number;
}

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export function intakeBurst(burst: Burst, pool: ParticlePool, options: IntakeOptions): number {
  const rng = createRng(burst.seed);
  const limit = options.maxSpawnPerFrame ?? 240;
  const requested = Math.min(burst.count, limit);
  const spawnCount = Math.max(1, Math.round(requested * options.densityScale));
  let spawned = 0;

  for (let i = 0; i < spawnCount; i++) {
    const angle = degToRad(
      burst.directionDeg + rng.range(-burst.spreadDeg / 2, burst.spreadDeg / 2),
    );
    const speed = rng.range(burst.speed.min, burst.speed.max);
    const radius = rng.range(burst.radius.min, burst.radius.max);
    const life = rng.range(burst.lifeMs.min, burst.lifeMs.max);

    const particle = pool.spawn({
      x: burst.origin.x + rng.range(-radius, radius) * 0.4,
      y: burst.origin.y + rng.range(-radius, radius) * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      alphaPeak: burst.alphaPeak * rng.range(0.7, 1.1),
      alphaDecay: burst.alphaDecay,
      life,
      noiseSeed: rng.int(0, 65535),
      rotation: rng.range(-Math.PI, Math.PI),
      scale: rng.range(0.7, 1.35),
      scaleGrowth: burst.scaleGrowth * rng.range(0.8, 1.2),
      turbulence: burst.turbulence,
      rise: burst.rise * rng.range(0.75, 1.25),
      gravity: burst.gravity,
      tint: burst.tint,
      heat: burst.heat * rng.range(0.6, 1),
      // Depth is sampled, not derived from index, so a puff never bands into layers.
      depth: rng.range(0.25, 1),
      spark: burst.kind === 'ember' || (burst.heat > 0.7 && rng.next() < 0.22),
    });
    if (particle) spawned += 1;
  }

  return spawned;
}

/**
 * How full the pool may get for a quality tier. The numbers are the core's budget table
 * (SPEC.md §54) with reduced motion taking the smallest share.
 */
export function budgetFor(
  reducedMotion: boolean,
  quality: 'auto' | 'high' | 'balanced' | 'light',
): number {
  if (reducedMotion) return 160;
  switch (quality) {
    case 'light':
      return 380;
    case 'balanced':
      return 800;
    case 'high':
      return 1400;
    default:
      return 1000;
  }
}
