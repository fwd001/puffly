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

type LightView = GameStateView['world']['light'];

interface Geometry {
  blocks: { x: number; y: number; w: number; h: number; lights: number[] }[];
  ridge: number[];
  bokeh: { x: number; y: number; r: number; warm: boolean }[];
  neon: { x: number; y: number; w: number; h: number; hue: number }[];
  /** The overhead flight of a stairwell: each entry is one tread's rising edge, left to right. */
  steps: number[];
  /**
   * The things that make a room a particular room: a pipe, a hanging flex, a lit window nobody is
   * in, a stain. Seeded per scene *and per day*, so the corner you sit in tomorrow has its bin on
   * the other side, while a replay of today's break puts every one of them back exactly where it
   * was (§71).
   */
  details: { x: number; y: number; w: number; h: number; kind: number }[];
}

const cache = new Map<string, Geometry>();

function hashOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function geometryFor(state: GameStateView): Geometry {
  const environmentId = state.environment.id;
  const background = state.environment.background;
  // The day is part of the seed, so the room's clutter moves tomorrow and not between two
  // frames of the same break. A per-frame salt would be the shiver §59 says a picture must not have.
  const salt = state.progress.level + state.progress.dayNumber * 31;
  const key = `${environmentId}:${background.kind}:${salt}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const seed = hashOf(environmentId) + salt * 7919;
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

  const steps: number[] = [];
  if (background.kind === 'stairwell') {
    // Eight treads climbing out of frame, each a little narrower than the last, which is what a
    // flight looks like from below the landing you are standing on.
    for (let i = 0; i < 8; i++) steps.push(0.62 - i * 0.062 - ((fbm2(i, seed, 59) + 1) / 2) * 0.02);
  }

  const details: Geometry['details'] = [];
  for (let i = 0; i < 5; i++) {
    details.push({
      x: 0.04 + ((fbm2(i * 1.9, seed, 61) + 1) / 2) * 0.92,
      y: 0.1 + ((fbm2(i * 2.4, seed, 67) + 1) / 2) * 0.5,
      w: 0.006 + ((fbm2(i * 3.2, seed, 71) + 1) / 2) * 0.1,
      h: 0.02 + ((fbm2(i * 4.1, seed, 73) + 1) / 2) * 0.16,
      kind: Math.floor(((fbm2(i * 5.3, seed, 79) + 1) / 2) * 4) % 4,
    });
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

  const built: Geometry = { blocks, ridge, bokeh, neon, steps, details };
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

/**
 * The sky's two ends, by warmth: `warmth` runs 0 (cool/blue) .. 1 (warm/amber), and the mix between
 * these is the room's own light. Exported because the 3D backdrop has to read the sky the same way —
 * a second pair of numbers would be a second sky.
 */
export const SKY_COOL: readonly [number, number, number] = [210, 224, 240];
export const SKY_WARM: readonly [number, number, number] = [255, 232, 200];

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
  //
  // The ceiling is deliberately low. The design's frames are near-black with the smoke as the
  // light thing in them, and at the old exposure a room came out mid-grey, which left the plume
  // with nothing to be bright against — the single biggest reason the smoke did not read as the
  // mock-up's does.
  const { skyTop, skyBottom, horizon, silhouette } = skyPalette(light, background);

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
    case 'stairwell':
    case 'corner':
      drawInterior(ctx, state, viewport, silhouette, horizon);
      break;
    case 'sky':
      break;
  }

  drawDetails(ctx, state, viewport, silhouette, horizon);
  if (background.kind === 'stairwell') drawStairwell(ctx, state, viewport, silhouette);
  if (background.kind === 'corner') drawCorner(ctx, state, viewport, silhouette, horizon);
  drawFeatures(ctx, state, viewport, silhouette, horizon);

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
  vignette.addColorStop(1, `rgba(0,0,0,${vignetteAlpha(light.ambient).toFixed(3)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

/**
 * How dark the room's corners get: `0.55` at full exposure, `0.85` in the dark. The 3D layer paints
 * the same vignette as a soft black plane, which is why this is a function and not a literal inside
 * the fill.
 */
export function vignetteAlpha(ambient: number): number {
  return 0.55 + (1 - ambient) * 0.3;
}

/**
 * The room's four painted colours — sky top, sky bottom, horizon, silhouette — from its own palette,
 * its exposure and the warm/cool cast.
 *
 * Extracted so the 3D layer reads the same room by the same rule: exposure is `0.34 + ambient * 0.46`
 * and every colour is nudged a tenth of the way to the cast. Two callers, one formula; a backdrop
 * that mixed only the cast came out as a bright day sky in a night room.
 */
export function skyPalette(
  light: { ambient: number; warmth: number },
  background: { sky: readonly [Rgb, Rgb]; horizon: Rgb; silhouette: Rgb },
): { skyTop: Rgb; skyBottom: Rgb; horizon: Rgb; silhouette: Rgb } {
  const exposure = 0.34 + light.ambient * 0.46;
  const cool = mixRgb(SKY_COOL, SKY_WARM, light.warmth);
  return {
    skyTop: scale(background.sky[0], exposure, cool),
    skyBottom: scale(background.sky[1], exposure * 0.95, cool),
    horizon: scale(background.horizon, exposure, cool),
    silhouette: scale(background.silhouette, exposure * 0.9, cool),
  };
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
  const geometry = geometryFor(state);
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
  const geometry = geometryFor(state);
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

/**
 * The room's own clutter. Four shapes, each drawn as a plain flat colour at a low alpha, because
 * these are not props to read — they are the reason the wall stops being a swatch. Which of them
 * appear, and where, is seeded per scene and per day.
 */
function drawDetails(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
  horizon: Rgb,
): void {
  const { cssWidth: w, cssHeight: h } = viewport;
  for (const detail of geometryFor(state).details) {
    const x = detail.x * w;
    const y = detail.y * h;
    const tone = rgbToCss(mixRgb(silhouette, horizon, detail.kind === 2 ? 0.5 : 0.22), 0.3);
    ctx.fillStyle = tone;
    if (detail.kind === 0) {
      // A pipe along the wall.
      ctx.fillRect(x, y, w * 0.34, Math.max(1, h * 0.006));
    } else if (detail.kind === 1) {
      // A flex hanging from the ceiling with nothing on the end of it.
      ctx.fillRect(x, y, Math.max(1, w * 0.004), h * 0.12);
    } else if (detail.kind === 2) {
      // A window further off, lit by someone else's evening.
      ctx.fillRect(x, y, w * Math.min(0.09, detail.w), h * Math.min(0.12, detail.h));
    } else {
      // A stain: a short, hard-edged mark, not a blob.
      ctx.fillRect(x, y, w * Math.min(0.05, detail.w), Math.max(1, h * 0.004));
    }
  }
}

/**
 * The place's own furniture, drawn from `BackgroundSpec.features`.
 *
 * A contact sheet of all twenty-one shipped places, painted from one scripted break, put every
 * indoor place within three luminance points of every other (L 32.0..35.3): a net café, a toilet
 * cubicle, an office landing and a desk read as one dark room in four colour grades. The deck's line
 * on this is 「场所不是背景板」, so a place now carries the shapes that stand in it. Each id is one
 * shape, drawn in the same register as the seeded clutter — flat rects at a low alpha, sized to read
 * at phone width and dark enough never to compete with the cherry for the brightest pixel (§57).
 */
function drawFeatures(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
  horizon: Rgb,
): void {
  const wanted = state.environment.background.features;
  if (!wanted || wanted.length === 0) return;
  const { cssWidth: w, cssHeight: h } = viewport;
  const ground = 0.72;
  const seeded = geometryFor(state).details;
  // Darker than the wall behind them, because these are seen rather than read; `lit` and `warm` are
  // the two that give light back, and both stay under the ember's own brightness.
  const ink = rgbToCss(mixRgb(silhouette, [0, 0, 0], 0.45), 0.86);
  const soft = rgbToCss(mixRgb(silhouette, [0, 0, 0], 0.3), 0.6);
  const edge = rgbToCss(mixRgb(silhouette, horizon, 0.55), 0.45);
  const glow = rgbToCss(mixRgb(silhouette, [226, 232, 244], 0.62), 0.5);
  const warm = rgbToCss(mixRgb(silhouette, [255, 186, 104], 0.68), 0.55);
  const box = (x: number, y: number, bw: number, bh: number, tone: string): void => {
    ctx.fillStyle = tone;
    ctx.fillRect(x * w, y * h, Math.max(1, bw * w), Math.max(1, bh * h));
  };
  /** Where this feature sits, so two places with the same id do not draw it in the same spot. */
  const at = (i: number, fallback: number): number => (seeded[i]?.x ?? fallback) % 0.7;

  wanted.forEach((feature, index) => {
    const x = at(index, 0.12 + index * 0.18);
    switch (feature) {
      case 'screens': {
        // A wall of monitors: the only light some rooms have, so this is the one feature that gives
        // brightness back rather than taking it away.
        box(x - 0.02, 0.38, 0.5, 0.16, soft);
        for (let i = 0; i < 4; i++) box(x + i * 0.12, 0.4, 0.1, 0.07, glow);
        for (let i = 0; i < 4; i++) box(x + i * 0.12, 0.47, 0.1, 0.008, edge);
        break;
      }
      case 'partitions': {
        // Cubicle doors, with the gap under them the deck's 「只能虚掩」 actually leaves.
        for (const door of [0.1, 0.42]) {
          box(door, 0.4, 0.17, ground - 0.42, ink);
          box(door, 0.4, 0.17, 0.006, edge);
        }
        break;
      }
      case 'extractor': {
        // A square of dead air high on the wall, slatted.
        box(0.72, 0.16, 0.11, 0.09, ink);
        for (let i = 0; i < 4; i++) box(0.72, 0.17 + i * 0.02, 0.11, 0.005, edge);
        break;
      }
      case 'roof': {
        // A roof line and its beam, from a tin shelter to a courtyard's eaves. The underside is the
        // lighter band: a flat black bar across the top reads as a censor bar, and an edge with a
        // highlight on it reads as something built.
        box(0, 0.05, 1, 0.05, ink);
        box(0, 0.1, 1, 0.008, edge);
        box(0, 0.108, 1, 0.004, soft);
        box(0.18, 0.112, 0.012, 0.3, ink);
        box(0.78, 0.112, 0.012, 0.3, ink);
        break;
      }
      case 'clothesline': {
        // Three short spans that sag, and three things on them.
        for (let i = 0; i < 3; i++) box(0.2 + i * 0.2, 0.22 + i * 0.012, 0.2, 0.004, edge);
        for (let i = 0; i < 3; i++) box(0.26 + i * 0.16, 0.24 + i * 0.01, 0.05, 0.07, ink);
        break;
      }
      case 'counter': {
        box(0.08, 0.56, 0.62, 0.03, ink);
        for (let i = 0; i < 4; i++) box(0.12 + i * 0.16, 0.59, 0.05, 0.12, soft);
        break;
      }
      case 'hearth': {
        // The fire is the room's key light, so it is the one place a feature sits *under* the
        // silhouette rather than below it.
        box(0.62, 0.5, 0.24, 0.2, ink);
        box(0.66, 0.56, 0.16, 0.13, warm);
        break;
      }
      case 'low-tables': {
        for (let i = 0; i < 3; i++) {
          box(0.1 + i * 0.26, 0.62, 0.16, 0.02, ink);
          box(0.12 + i * 0.26, 0.64, 0.12, 0.06, soft);
        }
        break;
      }
      case 'parasol': {
        // A canopy that steps down at the ends, so it is an octagon seen edge-on rather than a
        // horizontal bar, which is the difference between a parasol and a signpost.
        box(0.2, 0.28, 0.38, 0.016, ink);
        box(0.15, 0.296, 0.48, 0.014, ink);
        box(0.38, 0.31, 0.012, 0.29, ink);
        for (const table of [0.18, 0.56]) {
          box(table, 0.58, 0.14, 0.015, edge);
          box(table + 0.055, 0.595, 0.02, 0.11, soft);
        }
        break;
      }
      case 'elevator': {
        box(0.56, 0.34, 0.2, ground - 0.36, ink);
        box(0.655, 0.34, 0.01, ground - 0.36, edge);
        box(0.24, 0.42, 0.16, 0.1, soft);
        break;
      }
      case 'pumps': {
        for (const pump of [0.22, 0.52]) {
          box(pump, 0.44, 0.1, 0.26, ink);
          box(pump + 0.02, 0.47, 0.06, 0.05, glow);
        }
        box(0.32, 0.6, 0.2, 0.012, soft);
        break;
      }
      case 'bins': {
        box(0.06, 0.56, 0.12, 0.14, ink);
        box(0.2, 0.58, 0.1, 0.12, ink);
        box(0.44, 0.6, 0.4, 0.03, soft);
        for (let i = 0; i < 3; i++) box(0.46 + i * 0.12, 0.53, 0.08, 0.07, ink);
        break;
      }
      case 'glass-box': {
        // Two seams and a rail: the glass itself is the light it keeps back.
        box(0.16, 0.24, 0.008, ground - 0.26, edge);
        box(0.7, 0.24, 0.008, ground - 0.26, edge);
        box(0.16, 0.24, 0.548, 0.012, edge);
        box(0.16, 0.252, 0.548, ground - 0.272, soft);
        break;
      }
      case 'shutters': {
        for (let i = 0; i < 3; i++) {
          box(0.1 + i * 0.3, 0.36, 0.22, 0.18, ink);
          for (let s = 0; s < 4; s++) box(0.1 + i * 0.3, 0.38 + s * 0.04, 0.22, 0.004, edge);
        }
        break;
      }
    }
  });
}

/** The flight overhead: treads cut across the upper half, seen from the landing below them. */
function drawStairwell(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
): void {
  const { cssWidth: w, cssHeight: h } = viewport;
  const steps = geometryFor(state).steps;
  if (steps.length === 0) return;
  ctx.fillStyle = rgbToCss(mixRgb(silhouette, [0, 0, 0], 0.3), 0.92);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.04);
  steps.forEach((rising, i) => {
    const x = ((i + 1) / steps.length) * w * 1.02;
    ctx.lineTo(x, h * rising);
    ctx.lineTo(x, h * (rising + 0.035));
  });
  ctx.lineTo(w, h * 0.9);
  ctx.lineTo(0, h * 0.9);
  ctx.closePath();
  ctx.fill();
  // The nosing catches the key light, which is the only thing that makes a stair read as a stair.
  ctx.strokeStyle = rgbToCss(mixRgb(silhouette, [232, 232, 236], 0.5), 0.32);
  ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath();
  steps.forEach((rising, i) => {
    const x = ((i + 1) / steps.length) * w * 1.02;
    if (i === 0) ctx.moveTo(0, h * 0.04);
    else ctx.lineTo(x, h * rising);
  });
  ctx.stroke();
}

/** The marked-out patch of pavement: a wall seam behind you and the bin the sign is bolted to. */
function drawCorner(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  silhouette: Rgb,
  horizon: Rgb,
): void {
  const { cssWidth: w, cssHeight: h } = viewport;
  // The wall junction, one vertical line, so the corner is a corner and not a backdrop.
  ctx.fillStyle = rgbToCss(mixRgb(silhouette, horizon, 0.3), 0.5);
  ctx.fillRect(w * 0.58, 0, Math.max(1, w * 0.006), h * 0.7);
  // The sign post, and the plate on it. What the plate says is not the point. Its x is seeded —
  // which side of the corner the council put it on changes between visits — but its foot stops
  // above the table edge, because a pole standing through the place where the rod lies reads as
  // the rod being impaled rather than as furniture behind it.
  const details = geometryFor(state).details;
  const px = w * (0.2 + ((details[3]?.x ?? 0.4) % 0.28));
  ctx.fillStyle = rgbToCss(mixRgb(silhouette, [0, 0, 0], 0.25), 0.9);
  ctx.fillRect(px, h * 0.3, Math.max(2, w * 0.01), h * 0.26);
  ctx.fillStyle = rgbToCss(mixRgb(horizon, [240, 236, 226], 0.5), 0.5);
  ctx.fillRect(px - w * 0.02, h * 0.26, Math.max(4, w * 0.05), h * 0.05);
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
  const geometry = geometryFor(state);
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
  const geometry = geometryFor(state);
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
