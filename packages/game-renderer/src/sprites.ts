/**
 * Soft-disc sprite cache.
 *
 * A smoke particle is a radial-gradient sprite blitted with alpha, which is the only way
 * to draw a thousand of them at 60 FPS (§54). Creating a gradient per particle per frame
 * would be the classic way this kind of app dies, so gradients are baked once per tint and
 * reused. Blur is faked by the sprite's own falloff rather than `ctx.filter`, which is
 * both slow and missing on some engines (§58: soft light scattering, not a neon glow).
 */

import type { Rgb } from '@puffly/shared';
import { mixRgb } from '@puffly/shared';

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
  /** A soft disc in the given colour, from a cache keyed by a quantised tint. */
  soft(tint: Rgb): SpriteImage | null;
  readonly size: number;
  clear(): void;
}

const cacheKey = (tint: Rgb): string => `${tint[0] >> 4}-${tint[1] >> 4}-${tint[2] >> 4}`;

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

  const bake = (tint: Rgb): SpriteImage | null => {
    const image = factory(size);
    if (!image) return null;
    drawInto(image, tint, size);
    return image;
  };

  return {
    size,
    soft(tint) {
      const key = cacheKey(tint);
      const cached = cache.get(key);
      if (cached) return cached;
      const baked = bake(tint);
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
 */
function drawInto(image: SpriteImage, tint: Rgb, size: number): void {
  const context = image.getContext?.('2d');
  if (!context) return;

  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  const core = mixRgb(tint, [255, 255, 255], 0.22);
  gradient.addColorStop(0, `rgba(${core[0]}, ${core[1]}, ${core[2]}, 0.95)`);
  gradient.addColorStop(0.45, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0.5)`);
  gradient.addColorStop(0.78, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0.12)`);
  gradient.addColorStop(1, `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0)`);
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
