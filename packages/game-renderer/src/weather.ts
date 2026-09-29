/**
 * Weather and air life — SPEC.md §22, §24, §25.
 *
 * §25 says weather mainly changes smoke, sound, light and the environment; the visible
 * half of that is here. Rain is a set of seeded streaks that fall with the wind, and the
 * room itself carries slow dust motes in the key light, which is most of what makes a
 * still frame feel like a place someone could be sitting in.
 *
 * Geometry is generated once per (environment, weather) and reused, so a frame costs a
 * handful of strokes instead of a random-number fight.
 */

import { clamp01, rgbToCss } from '@puffly/shared';
import type { GameStateView } from '@puffly/game-core';
import { fbm2 } from './noise';
import type { Viewport } from './viewport';

interface Streak {
  x: number;
  phase: number;
  speed: number;
  length: number;
}

interface Mote {
  x: number;
  y: number;
  drift: number;
  size: number;
  seed: number;
}

const cache = new Map<string, { streaks: Streak[]; motes: Mote[] }>();

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function geometryFor(environmentId: string, weather: string) {
  const key = `${environmentId}:${weather}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashOf(environmentId);
  const heavy = weather === 'storm' ? 1 : weather === 'rain' ? 0.6 : 0;
  const streaks: Streak[] = [];
  const count = Math.round(heavy * 90);
  for (let i = 0; i < count; i++) {
    streaks.push({
      x: (fbm2(i * 1.7, seed, 3) + 1) / 2,
      phase: ((fbm2(i * 2.9, seed, 7) + 1) / 2) * 1.4,
      speed: 0.75 + ((fbm2(i * 0.7, seed, 11) + 1) / 2) * 0.8,
      length: 0.02 + ((fbm2(i * 1.3, seed, 13) + 1) / 2) * 0.05,
    });
  }

  const motes: Mote[] = [];
  for (let i = 0; i < 26; i++) {
    motes.push({
      x: (fbm2(i * 2.2, seed, 17) + 1) / 2,
      y: 0.12 + ((fbm2(i * 1.1, seed, 19) + 1) / 2) * 0.62,
      drift: (fbm2(i * 3.3, seed, 23) + 1) / 2,
      size: 0.0012 + ((fbm2(i * 4.1, seed, 29) + 1) / 2) * 0.0026,
      seed: i,
    });
  }

  const built = { streaks, motes };
  cache.set(key, built);
  return built;
}

/** Rain in front of the scene, angled by the wind the simulation is already using. */
export function drawRain(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  reducedMotion: boolean,
): void {
  if (state.world.weather !== 'rain' && state.world.weather !== 'storm') return;
  const { streaks } = geometryFor(state.environment.id, state.world.weather);
  if (streaks.length === 0) return;

  const { stage } = viewport;
  const seconds = state.nowMs / 1000;
  const slant = Math.max(-0.5, Math.min(0.5, state.smoke.drift.x * 2.2));
  const alpha = reducedMotion ? 0.1 : 0.16 + clamp01(state.world.ambientGain) * 0.16;

  ctx.save();
  ctx.strokeStyle = rgbToCss([206, 218, 232], alpha);
  ctx.lineWidth = Math.max(1, viewport.len(0.0016));
  ctx.beginPath();
  for (const streak of streaks) {
    const travel = (seconds * streak.speed + streak.phase) % 1.4;
    const y = stage.y - 0.1 + travel;
    if (y > 1.05) continue;
    const x = streak.x + slant * travel;
    const top = viewport.px({ x, y });
    const bottom = viewport.px({ x: x + slant * streak.length, y: y + streak.length });
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Dust in the light: the cheapest possible way to make still air look like a room. */
export function drawDust(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  reducedMotion: boolean,
): void {
  const { motes } = geometryFor(state.environment.id, state.world.weather);
  const { stage } = viewport;
  const seconds = state.nowMs / 1000;
  const light = 0.25 + state.world.light.ambient * 0.75;
  const speed = reducedMotion ? 0 : 1;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const mote of motes) {
    const wobble = fbm2(seconds * 0.08 * speed + mote.seed, mote.drift * 10, 31);
    const x = (mote.x + wobble * 0.05 + seconds * 0.004 * speed * state.world.wind) % 1;
    const y = mote.y + Math.sin(seconds * 0.21 * speed + mote.seed) * 0.012;
    const at = viewport.px({ x, y });
    const radius = viewport.len(mote.size) * (1 + Math.abs(wobble) * 0.6);
    const alpha = clamp01(0.05 + light * 0.12 + wobble * 0.05);
    if (alpha <= 0.01 || radius <= 0.3) continue;
    ctx.fillStyle = rgbToCss([236, 226, 208], alpha);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  void stage;
}

export function clearWeatherCache(): void {
  cache.clear();
}
