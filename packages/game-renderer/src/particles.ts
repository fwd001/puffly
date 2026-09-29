/**
 * Particle system — SPEC.md §15, §16, §54.
 *
 * Fixed-size pool, zero allocation in the per-frame loop, and an explicit budget. The
 * particle record carries exactly the fields §15 names, plus the few the integrator
 * needs. Particles are never touched by Vue and never become reactive (§54, §81 (9)).
 */

import type { Rgb } from '@puffly/shared';
import { curl2 } from './noise';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
  noiseSeed: number;
  rotation: number;
  /** Multiplier sampled at spawn, so identical bursts still vary in size (§16). */
  scale: number;
  /** How much wider the puff is at the end of its life than at the start. */
  scaleGrowth: number;
  /** 1..1+scaleGrowth, derived from age: smoke spreads, but it does not fill the room. */
  size: number;
  /** 0..1 through this particle's life. */
  age: number;
  alphaPeak: number;
  alphaDecay: number;
  turbulence: number;
  rise: number;
  gravity: number;
  tint: Rgb;
  heat: number;
  /** 0 = far away and dim, 1 = at the front of the frame. Lets smoke read as volume. */
  depth: number;
  /** Previous position, so a spark can be drawn as a streak instead of a dot. */
  px: number;
  py: number;
  spark: boolean;
  active: boolean;
}

export interface SpawnInit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alphaPeak: number;
  alphaDecay: number;
  life: number;
  noiseSeed: number;
  rotation: number;
  scale: number;
  scaleGrowth: number;
  turbulence: number;
  rise: number;
  gravity: number;
  tint: Rgb;
  heat: number;
  depth: number;
  spark: boolean;
}

const EMPTY: Particle = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 1,
  alpha: 0,
  life: 0,
  maxLife: 1,
  noiseSeed: 0,
  rotation: 0,
  scale: 1,
  size: 1,
  age: 0,
  scaleGrowth: 1,
  alphaPeak: 0,
  alphaDecay: 1,
  turbulence: 0,
  rise: 0,
  gravity: 0,
  tint: [200, 200, 200],
  heat: 0,
  depth: 0.5,
  px: 0,
  py: 0,
  spark: false,
  active: false,
};

export class ParticlePool {
  private readonly items: Particle[] = [];
  private cursor = 0;
  private activeCount = 0;

  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) this.items.push({ ...EMPTY });
  }

  get capacity(): number {
    return this.items.length;
  }

  get size(): number {
    return this.activeCount;
  }

  /**
   * Ring-buffer allocation: no search, no `splice`, no garbage. When the pool is full the
   * oldest slot is recycled, which keeps a puff's tail rather than its head — visually the
   * least damaging thing to lose.
   */
  spawn(init: SpawnInit): Particle | null {
    const slot = this.items[this.cursor];
    if (!slot) return null;
    this.cursor = (this.cursor + 1) % this.items.length;
    if (!slot.active) this.activeCount += 1;

    slot.x = init.x;
    slot.y = init.y;
    slot.vx = init.vx;
    slot.vy = init.vy;
    slot.radius = init.radius;
    slot.alpha = 0;
    slot.life = init.life;
    slot.maxLife = init.life;
    slot.noiseSeed = init.noiseSeed;
    slot.rotation = init.rotation;
    slot.scale = init.scale;
    slot.size = 1;
    slot.age = 0;
    slot.scaleGrowth = init.scaleGrowth;
    slot.alphaPeak = init.alphaPeak;
    slot.alphaDecay = init.alphaDecay;
    slot.turbulence = init.turbulence;
    slot.rise = init.rise;
    slot.gravity = init.gravity;
    slot.tint = init.tint;
    slot.heat = init.heat;
    slot.depth = init.depth;
    slot.spark = init.spark;
    slot.px = init.x;
    slot.py = init.y;
    slot.active = true;
    return slot;
  }

  /**
   * Integrate everything in one pass. `drift` is the wind **velocity** from Game Core
   * (`SmokeField.drift`, normalised units per second), so it is added to the particle's own
   * velocity rather than treated as an acceleration — the difference is a column that leans
   * with the gust instead of creeping sideways long after it.
   */
  update(
    dtMs: number,
    drift: { x: number; y: number },
    fieldScale: number,
    timeSeconds: number,
  ): void {
    if (this.activeCount === 0) return;
    const dt = dtMs / 1000;

    for (const particle of this.items) {
      if (!particle.active) continue;

      particle.life -= dtMs;
      if (particle.life <= 0) {
        particle.active = false;
        this.activeCount -= 1;
        continue;
      }

      const age = 1 - particle.life / particle.maxLife;
      const swirl = curl2(
        particle.x * fieldScale + timeSeconds * 0.12,
        particle.y * fieldScale - timeSeconds * 0.2,
        particle.noiseSeed,
      );

      // Turbulence is the acceleration; the wind is the air the particle is sitting in.
      particle.vx += swirl.vx * particle.turbulence * dt;
      particle.vy += (swirl.vy * particle.turbulence - particle.rise + particle.gravity) * dt;

      // Air drags smoke back to still; without this it accelerates into streaks.
      particle.vx *= 1 - 0.9 * dt;
      particle.vy *= 1 - 0.9 * dt;

      particle.px = particle.x;
      particle.py = particle.y;
      particle.x += (particle.vx + drift.x) * dt;
      particle.y += (particle.vy + drift.y) * dt;

      // Diffusion-ish: the puff widens across its own lifetime. Deliberately *not*
      // `radius *= 1 + k*dt`, which compounds and turns a wisp into a wall of fog.
      particle.age = 1 - particle.life / particle.maxLife;
      particle.size = 1 + particle.scaleGrowth * particle.age;
      particle.rotation += (particle.turbulence * 0.4 + 0.15) * dt;

      // In fast, out slow: what makes a wisp read as smoke rather than a fading dot.
      const attack = Math.min(1, age / 0.12);
      const release = Math.pow(1 - age, particle.alphaDecay);
      particle.alpha = particle.alphaPeak * attack * release;
    }
  }

  forEachActive(visit: (particle: Particle, index: number) => void): void {
    if (this.activeCount === 0) return;
    for (let i = 0; i < this.items.length; i++) {
      const particle = this.items[i];
      if (particle && particle.active) visit(particle, i);
    }
  }

  clear(): void {
    for (const particle of this.items) particle.active = false;
    this.activeCount = 0;
    this.cursor = 0;
  }
}
