/**
 * Background layer — SPEC.md §23, §24, §56, §57, §58.
 *
 * Everything here is drawn from the environment's numbers: sky gradient, horizon,
 * silhouette, fog. No bitmap, no GIF, no stock photo — and the silhouette geometry is
 * generated once from the environment id, so a room looks like the same room every frame
 * while still never being a file on disk.
 */

import { clamp01, mixRgb, rgbToCss, type Rgb } from '@puffly/shared';
import type { GameStateView } from '@puffly/game-core';
import { fbm2 } from './noise';
import type { Viewport } from './viewport';

type BackgroundView = GameStateView['environment']['background'];
type LightView = GameStateView['world']['light'];

interface Geometry {
  blocks: { x: number; y: number; w: number; h: number; lights: number[] }[];
  ridge: number[];
  bokeh: { x: number; y: number; r: number; warm: boolean }[];
  neon: { x: number; y: number; w: number; h: number; hue: number }[];
}

const cache = new Map<string, Geometry>();

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function geometryFor(environmentId: string, background: BackgroundView): Geometry {
  const key = `${environmentId}:${background.kind}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashOf(environmentId);
  const blocks: Geometry['blocks'] = [];
  if (background.kind === 'city' || background.kind === 'street' || background.kind === 'window') {
    const count = background.kind === 'window' ? 9 : 16;
    for (let i = 0; i < count; i++) {
      const x = ((fbm2(i * 1.7, seed, 3) + 1) / 2) * 0.98;
      const w = 0.03 + ((fbm2(i * 2.3, seed, 7) + 1) / 2) * 0.07;
      const h = 0.1 + ((fbm2(i * 0.9, seed, 11) + 1) / 2) * 0.34;
      const lights: number[] = [];
      const lit = Math.floor(((fbm2(i, seed, 13) + 1) / 2) * 8);
      for (let j = 0; j < lit; j++) lights.push((fbm2(j * 3.1, i * 2 + seed, 17) + 1) / 2);
      blocks.push({ x, y: 0.72 - h, w, h, lights });
    }
  }

  const ridge: number[] = [];
  if (background.kind === 'mountain') {
    for (let i = 0; i <= 64; i++) {
      ridge.push(0.6 + fbm2(i * 0.09, seed, 5) * 0.13 + Math.sin(i * 0.21 + seed) * 0.03);
    }
  }

  const bokeh: Geometry['bokeh'] = [];
  if (background.kind === 'window' || background.kind === 'street') {
    for (let i = 0; i < 26; i++) {
      bokeh.push({
        x: (fbm2(i * 1.1, seed, 23) + 1) / 2,
        y: 0.3 + ((fbm2(i * 2.7, seed, 29) + 1) / 2) * 0.5,
        r: 0.008 + ((fbm2(i, seed, 31) + 1) / 2) * 0.02,
        warm: fbm2(i * 4, seed, 37) > 0,
      });
    }
  }

  const neon: Geometry['neon'] = [];
  if (background.kind === 'street') {
    for (let i = 0; i < 5; i++) {
      neon.push({
        x: 0.06 + i * 0.19 + ((fbm2(i, seed, 41) + 1) / 2) * 0.05,
        y: 0.28 + ((fbm2(i * 1.3, seed, 43) + 1) / 2) * 0.3,
        w: 0.012 + ((fbm2(i * 2, seed, 47) + 1) / 2) * 0.05,
        h: 0.008 + ((fbm2(i * 3, seed, 53) + 1) / 2) * 0.02,
        hue: i,
      });
    }
  }

  const built: Geometry = { blocks, ridge, bokeh, neon };
  cache.set(key, built);
  return built;
}

const NEON_TINTS: readonly Rgb[] = [
  [236, 92, 150],
  [96, 210, 226],
  [226, 190, 92],
  [150, 110, 232],
  [232, 120, 80],
];

const NEON_FALLBACK: Rgb = NEON_TINTS[0] ?? [236, 92, 150];

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  const { cssWidth: w, cssHeight: h } = viewport;
  const background = state.environment.background;
  const light = state.world.light;

  // Exposure and warmth are applied to the palette rather than as a filter overlay, so a
  // dark scene stays dark instead of turning grey (§57: colour must stay restrained).
  const exposure = 0.55 + light.ambient * 0.85;
  const cool = mixRgb([210, 224, 240], [255, 232, 200], light.warmth);
  const skyTop = scale(background.sky[0], exposure, cool);
  const skyBottom = scale(background.sky[1], exposure * 0.95, cool);
  const horizon = scale(background.horizon, exposure, cool);
  const silhouette = scale(background.silhouette, exposure * 0.9, cool);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgbToCss(skyTop));
  sky.addColorStop(0.62, rgbToCss(skyBottom));
  sky.addColorStop(1, rgbToCss(mixRgb(skyBottom, silhouette, 0.45)));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const ground = h * 0.72;
  ctx.fillStyle = rgbToCss(mixRgb(horizon, silhouette, 0.35), 0.9);
  ctx.fillRect(0, ground, w, h - ground);

  switch (background.kind) {
    case 'city':
    case 'street':
    case 'window':
      drawBlocks(ctx, state, viewport, silhouette, light);
      break;
    case 'mountain':
      drawRidge(ctx, state, viewport, silhouette, background.fog);
      break;
    case 'room':
    case 'desk':
      drawInterior(ctx, state, viewport, silhouette, horizon);
      break;
    case 'sky':
      break;
  }

  if (background.kind === 'window' || background.kind === 'street') {
    drawBokeh(ctx, state, viewport);
  }
  if (background.kind === 'street') drawNeon(ctx, state, viewport);

  if (background.fog > 0) {
    const fog = ctx.createLinearGradient(0, h * 0.35, 0, h);
    fog.addColorStop(0, rgbToCss(skyBottom, 0));
    fog.addColorStop(1, rgbToCss(skyBottom, clamp01(background.fog) * 0.55));
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.35, w, h * 0.65);
  }

  // A soft vignette keeps the eye on the cherry, which is the whole point of §57.
  const vignette = ctx.createRadialGradient(
    w / 2,
    h * 0.55,
    Math.min(w, h) * 0.2,
    w / 2,
    h * 0.5,
    Math.max(w, h) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${(0.45 + (1 - light.ambient) * 0.3).toFixed(3)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function scale(value: Rgb, exposure: number, cast: Rgb): Rgb {
  return mixRgb(
    [
      Math.min(255, Math.round(value[0] * exposure)),
      Math.min(255, Math.round(value[1] * exposure)),
      Math.min(255, Math.round(value[2] * exposure)),
    ],
    cast,
    0.1,
  );
}

function drawBlocks(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
  light: LightView,
): void {
  const { stage } = viewport;
  const geometry = geometryFor(state.environment.id, state.environment.background);
  for (const block of geometry.blocks) {
    const x = stage.x + block.x * stage.width;
    const y = stage.y + block.y * stage.height;
    const bw = block.w * stage.width;
    const bh = block.h * stage.height;
    ctx.fillStyle = rgbToCss(mixRgb(silhouette, [0, 0, 0], 0.2));
    ctx.fillRect(x, y, bw, bh);

    for (const pick of block.lights) {
      const fx = x + bw * (0.15 + pick * 0.7);
      const fy = y + bh * (0.1 + ((pick * 97) % 1) * 0.8);
      const warm = pick > 0.45;
      const glow = 0.22 + light.ambient * 0.5 + Math.max(0, light.flash) * 0.4;
      ctx.fillStyle = rgbToCss(warm ? [255, 214, 150] : [188, 216, 236], clamp01(glow));
      ctx.fillRect(fx, fy, Math.max(1, bw * 0.08), Math.max(1, bh * 0.03));
    }
  }
}

function drawRidge(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
  fog: number,
): void {
  const geometry = geometryFor(state.environment.id, state.environment.background);
  const { stage } = viewport;
  const layers = [0, 1, 2];
  for (const layer of layers) {
    ctx.beginPath();
    const base = stage.y + stage.height * (0.52 + layer * 0.07);
    ctx.moveTo(stage.x, viewport.cssHeight);
    geometry.ridge.forEach((value, index) => {
      const x = stage.x + (index / (geometry.ridge.length - 1)) * stage.width;
      const y = base + (value - 0.6) * stage.height * (0.8 + layer * 0.25);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(stage.x + stage.width, viewport.cssHeight);
    ctx.closePath();
    ctx.fillStyle = rgbToCss(
      mixRgb(silhouette, [255, 255, 255], layer * 0.06 + fog * 0.05),
      0.95 - layer * 0.1,
    );
    ctx.fill();
  }
}

function drawInterior(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
  horizon: Rgb,
): void {
  const { cssWidth: w, cssHeight: h, stage } = viewport;
  // The warm colour of the light the room is lit by. It arrives through `style.scene` so a skin
  // can repaint it, and it is the only place the table's colour was decided.
  const poolLight = state.style.scene.pool;
  const wall = mixRgb(horizon, silhouette, 0.5);
  ctx.fillStyle = rgbToCss(wall, 0.85);
  ctx.fillRect(0, 0, w, h * 0.7);

  // The key light falls from the environment's own direction, so a lamp reads as a lamp.
  const radians = (state.world.light.keyDirectionDeg * Math.PI) / 180;
  const lx = w / 2 + Math.cos(radians) * w * 0.3;
  const ly = h * 0.2 + Math.sin(radians) * h * 0.25;
  const pool = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.45);
  pool.addColorStop(
    0,
    rgbToCss(mixRgb(wall, poolLight, 0.5), 0.35 * (0.4 + state.world.light.ambient)),
  );
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);

  // Table edge, sitting exactly where the stage's props are anchored.
  const edge = stage.y + stage.height * state.stage.layout.tableEdgeY;
  ctx.fillStyle = rgbToCss(mixRgb(silhouette, [0, 0, 0], 0.25));
  ctx.fillRect(0, edge, w, h - edge);
  ctx.fillStyle = rgbToCss(mixRgb(horizon, [255, 255, 255], 0.12), 0.5);
  ctx.fillRect(0, edge, w, Math.max(1, h * 0.004));

  // The props live on the table, so the table has to be lit. The key light above falls on the
  // wall and stops at the edge, which left the lower band a flat black rectangle with four
  // small bright things in it — a screenshot of nothing, and the first thing a player sees.
  const { layout } = state.stage;
  const spot = {
    x: (layout.table.x + layout.ashtray.x + layout.pack.x) / 3,
    y: (layout.table.y + layout.ashtray.y + layout.pack.y) / 3,
  };
  const px = stage.x + spot.x * stage.width;
  const py = stage.y + spot.y * stage.height;
  const reach = Math.max(80, stage.width * 0.8);
  const pool2 = ctx.createRadialGradient(px, py, 0, px, py, reach);
  const strength = 0.26 + state.world.light.ambient * 0.34;
  pool2.addColorStop(0, rgbToCss(mixRgb(silhouette, poolLight, 0.62), strength));
  pool2.addColorStop(0.5, rgbToCss(mixRgb(silhouette, poolLight, 0.3), strength * 0.5));
  pool2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool2;
  ctx.fillRect(0, edge, w, h - edge);
}

function drawBokeh(ctx: CanvasRenderingContext2D, state: GameStateView, viewport: Viewport): void {
  const geometry = geometryFor(state.environment.id, state.environment.background);
  const { stage } = viewport;
  for (const dot of geometry.bokeh) {
    const alpha =
      0.1 + state.world.light.ambient * 0.35 + Math.max(0, state.world.light.flash) * 0.3;
    ctx.fillStyle = rgbToCss(dot.warm ? [255, 208, 150] : [170, 205, 235], clamp01(alpha));
    ctx.beginPath();
    ctx.arc(
      stage.x + dot.x * stage.width,
      stage.y + dot.y * stage.height,
      dot.r * stage.height,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawNeon(ctx: CanvasRenderingContext2D, state: GameStateView, viewport: Viewport): void {
  const geometry = geometryFor(state.environment.id, state.environment.background);
  const { stage } = viewport;
  for (const strip of geometry.neon) {
    const tint = NEON_TINTS[strip.hue % NEON_TINTS.length] ?? NEON_FALLBACK;
    const flicker = 0.55 + ((fbm2(state.nowMs / 900 + strip.x * 10, strip.hue, 61) + 1) / 2) * 0.45;
    ctx.fillStyle = rgbToCss(tint, clamp01(flicker * 0.7));
    ctx.fillRect(
      stage.x + strip.x * stage.width,
      stage.y + strip.y * stage.height,
      strip.w * stage.width,
      Math.max(1, strip.h * stage.height),
    );
  }
}

export function clearBackgroundCache(): void {
  cache.clear();
}
