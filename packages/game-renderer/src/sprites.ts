/**
 * Soft-disc sprite cache.
 *
 * A smoke particle is a radial-gradient sprite blitted with alpha, which is the only way
 * to draw a thousand of them at 60 FPS (§54). Creating a gradient per particle per frame
 * would be the classic way this kind of app dies, so gradients are baked once per tint and
 * reused. Blur is the sprite's own falloff rather than `ctx.filter`, which is both slow and
 * missing on some engines (§58: soft light scattering, not a neon glow).
 */

import { clamp, mixRgb, type Rgb } from '@puffly/shared';

/** The slice of a 2D context a sprite tile actually needs, so a stub can stand in. */
export interface SpriteContext2D {
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradient;
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
}

/**
 * A drawable tile that can also be drawn *into*. Typed structurally rather than as
 * `HTMLCanvasElement` so a test can hand over a plain object without a cast, while
 * `drawImage` still accepts it (§72).
 */
export type SpriteImage = CanvasImageSource & {
  readonly width: number;
  readonly height: number;
  getContext?(kind: '2d'): SpriteContext2D | null;
};

export type SpriteCanvasFactory = (size: number) => SpriteImage | null;

export interface SpriteProvider {
  /**
   * A soft disc in the given colour, from a cache keyed by a quantised tint and a quantised
   * falloff. `blur` is the smoke style's own softness (§21): 1 is the profile this shipped
   * before, higher spreads the density outward, lower gathers it into a crisper core.
   */
  soft(tint: Rgb, blur?: number): SpriteImage | null;
  readonly size: number;
  clear(): void;
}

const cacheKey = (tint: Rgb, blur: number): string =>
  `${tint[0] >> 4}-${tint[1] >> 4}-${tint[2] >> 4}-${Math.round(clamp(blur, 0.4, 2.5) * 8)}`;

/**
 * `defaultSpriteFactory` is the only place this package touches `document`, and it is
 * injectable so the renderer can be tested with a fake context and fake sprites.
 */
export function defaultSpriteFactory(): SpriteCanvasFactory {
  return (size: number) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  };
}

export function createSpriteProvider(
  factory: SpriteCanvasFactory = defaultSpriteFactory(),
  size = 96,
): SpriteProvider {
  const cache = new Map<string, SpriteImage>();

  const bake = (tint: Rgb, blur: number): SpriteImage | null => {
    const image = factory(size);
    if (!image) return null;
    drawInto(image, tint, size, blur);
    return image;
  };

  return {
    size,
    soft(tint, blur = 1) {
      const key = cacheKey(tint, blur);
      const cached = cache.get(key);
      if (cached) return cached;
      const baked = bake(tint, blur);
      if (!baked) return null;
      cache.set(key, baked);
      return baked;
    },
    clear() {
      cache.clear();
    },
  };
}

/**
 * The sprite itself: transparent rim, soft core. `mixRgb` toward white at the centre is
 * what makes dense smoke read as lit from inside rather than as grey blobs (§58).
 *
 * The smoke style's `blur` is the shape of that falloff, not a filter: a puff is denser
 * toward its middle by an amount its own author set, so the stops come from a profile
 * `exp(-(r/sigma)^2)` whose width is the blur.
 *
 * `SIGMA_AT_ONE` is deliberately tighter than the four stops this file shipped before
 * (0.95 / 0.5 / 0.12 / 0, which the curve reproduces at sigma 0.56). At that width every
 * rod looked the same and the column read as fog — 像雾, 没对上焦 — and a wisp only looks
 * in focus when its own edge is steeper than the blob it is drawn from.
 */
const SIGMA_AT_ONE = 0.42;
const PROFILE_RADII = [0, 0.45, 0.78, 1] as const;

function profile(blur: number): number[] {
  const sigma = SIGMA_AT_ONE * clamp(blur, 0.4, 2.5);
  return PROFILE_RADII.map((radius) => Math.exp(-((radius / sigma) ** 2)));
}

function drawInto(image: SpriteImage, tint: Rgb, size: number, blur: number): void {
  const context = image.getContext?.('2d');
  if (!context) return;

  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  const core = mixRgb(tint, [255, 255, 255], 0.22);
  const [peak = 0, middle = 0, outer = 0, rim = 0] = profile(blur);
  gradient.addColorStop(0, `rgba(${core[0]}, ${core[1]}, ${core[2]}, ${(0.95 * peak).toFixed(3)})`);
  gradient.addColorStop(
    0.45,
    `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(0.95 * middle).toFixed(3)})`,
  );
  gradient.addColorStop(
    0.78,
    `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(0.95 * outer).toFixed(3)})`,
  );
  gradient.addColorStop(1, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, ${(0.95 * rim).toFixed(3)})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}

/**
 * A film-grain tile. §23 lets an environment declare `grain`, and §56 asks for a cinematic
 * rather than a clean-rendered look; a single baked tile pattern-filled at low alpha is the
 * cheap way to get texture without drawing thousands of dots per frame.
 */
export function createGrainTile(
  factory: SpriteCanvasFactory = defaultSpriteFactory(),
  size = 128,
  density = 0.55,
  seed = 0x9e3779b9,
): SpriteImage | null {
  const image = factory(size);
  if (!image) return null;
  const ctx = image.getContext?.('2d');
  if (!ctx) return null;

  // Integer LCG so the tile is identical on every platform and every run.
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  ctx.clearRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (next() > density) continue;
      const value = Math.round(120 + next() * 135);
      ctx.fillStyle = `rgba(${value}, ${value}, ${value}, ${(0.05 + next() * 0.1).toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return image;
}
