/**
 * A software canvas: the renderer draws a real frame into it and the pixels come back out.
 *
 * Nothing here ships. It exists because the question "does the smoke read against the room it is
 * actually drawn in?" cannot be answered from the particle numbers — the answer is a ratio between
 * two luminances that only exist after the background gradients, the light pool, the vignette and a
 * few hundred overlapping sprites have been composited in order. A recording context proves which
 * calls happen; this proves what they leave behind.
 *
 * What it implements: `clearRect`/`fillRect` with solid colours, linear and radial gradients
 * (linear interpolation between the stops, the same rule canvas uses), and `drawImage` of a soft
 * disc, whose falloff is the profile `sprites.ts` bakes. What it deliberately skips: paths — arcs,
 * ellipses, quadratic curves — which is where the rod, the tray and the props are drawn. Those
 * omissions are counted and reported rather than left silent, so a picture made here is never
 * mistaken for a screenshot.
 */

import { profile, PROFILE_RADII } from '../sprites';

export interface PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly ctx: CanvasRenderingContext2D;
  /** Row-major RGB, three bytes per pixel. */
  readonly pixels: Uint8ClampedArray;
  skipped(): Record<string, number>;
  traceAt(x: number, y: number): string[];
  /** Relative luminance (WCAG) of the pixel at x,y. */
  luminance(x: number, y: number): number;
  /** The brightest pixel inside a box, with its coordinates. */
  peakIn(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; L: number };
  meanIn(x0: number, y0: number, x1: number, y1: number): number;
}

interface Stop {
  offset: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Gradient {
  kind: 'linear' | 'radial';
  geometry: number[];
  stops: Stop[];
}

const parse = (value: string | CanvasGradient | CanvasPattern): Stop => {
  if (typeof value !== 'string') return { offset: 0, r: 0, g: 0, b: 0, a: 0 };
  const match = /rgba?\(([^)]+)\)/.exec(value.replace(/[\s\n]/g, ''));
  if (!match?.[1]) return { offset: 0, r: 0, g: 0, b: 0, a: 0 };
  const parts = match[1].split(',').map(Number);
  return {
    offset: 0,
    r: parts[0] ?? 0,
    g: parts[1] ?? 0,
    b: parts[2] ?? 0,
    a: parts.length > 3 ? (parts[3] ?? 1) : 1,
  };
};

const lerpStops = (stops: Stop[], at: number): Stop => {
  if (stops.length === 0) return { offset: 0, r: 0, g: 0, b: 0, a: 0 };
  // Padded: below the first stop or above the last, that end's own colour repeats.
  const t = Math.min(1, Math.max(0, at));
  for (let index = 0; index < stops.length - 1; index++) {
    const a = stops[index];
    const b = stops[index + 1];
    if (!a || !b) continue;
    if (t <= b.offset) {
      const span = b.offset - a.offset;
      const k = span <= 0 ? 0 : (t - a.offset) / span;
      return {
        offset: t,
        r: a.r + (b.r - a.r) * k,
        g: a.g + (b.g - a.g) * k,
        b: a.b + (b.b - a.b) * k,
        a: a.a + (b.a - a.a) * k,
      };
    }
  }
  return stops[stops.length - 1] ?? stops[0] ?? { offset: t, r: 0, g: 0, b: 0, a: 0 };
};

/**
 * The sprite's own falloff, taken from `sprites.ts` rather than re-derived. The first version
 * copied the gaussian here, which quietly made every picture a measurement of the copy: flattening
 * the shipped profile changed nothing, so smoke could not be made invisible by anything the
 * renderer actually does. Canvas also interpolates linearly between the four baked stops, and that
 * piecewise curve — not the pure exponential — is what a player sees.
 */
const discAlpha = (radius: number, blur: number): number => {
  if (radius >= 1) return 0;
  const stops = profile(blur);
  for (let index = 0; index < PROFILE_RADII.length - 1; index++) {
    const inner = PROFILE_RADII[index] ?? 0;
    const outer = PROFILE_RADII[index + 1] ?? 1;
    if (radius <= outer) {
      const span = outer - inner;
      const k = span <= 0 ? 0 : (radius - inner) / span;
      const a = stops[index] ?? 0;
      const b = stops[index + 1] ?? 0;
      return 0.95 * (a + (b - a) * k);
    }
  }
  return 0.95 * (stops[stops.length - 1] ?? 0);
};

export function createPixelCanvas(width: number, height: number): PixelCanvas {
  const pixels = new Uint8ClampedArray(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = 0;
    pixels[index + 1] = 0;
    pixels[index + 2] = 0;
  }

  const skipped: Record<string, number> = {};
  const skip = (name: string): void => {
    skipped[name] = (skipped[name] ?? 0) + 1;
  };

  let fillStyle: string | CanvasGradient = '#000';
  let globalAlpha = 1;
  let composite: string = 'source-over';
  let tx = 0;
  let ty = 0;
  interface State {
    fillStyle: string | CanvasGradient;
    globalAlpha: number;
    composite: string;
    tx: number;
    ty: number;
  }
  const stack: State[] = [];
  const gradients = new WeakMap<object, Gradient>();
  let lastGradient: Gradient | null = null;

  const tracePixel = { x: -1, y: -1 };
  const trace: string[] = [];

  const blend = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
    if (x === tracePixel.x && y === tracePixel.y) {
      trace.push(
        `${composite} rgb(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)}) a=${a.toFixed(3)} ga=${globalAlpha.toFixed(3)}`,
      );
    }
    if (a <= 0) return;
    const offset = (y * width + x) * 3;
    if (offset < 0 || offset + 2 >= pixels.length) return;
    const alpha = Math.min(1, a);
    if (composite === 'lighter') {
      pixels[offset] = Math.min(255, (pixels[offset] ?? 0) + r * alpha);
      pixels[offset + 1] = Math.min(255, (pixels[offset + 1] ?? 0) + g * alpha);
      pixels[offset + 2] = Math.min(255, (pixels[offset + 2] ?? 0) + b * alpha);
      return;
    }
    pixels[offset] = (pixels[offset] ?? 0) * (1 - alpha) + r * alpha;
    pixels[offset + 1] = (pixels[offset + 1] ?? 0) * (1 - alpha) + g * alpha;
    pixels[offset + 2] = (pixels[offset + 2] ?? 0) * (1 - alpha) + b * alpha;
  };

  const paint = (stop: Stop, x: number, y: number): void =>
    blend(x, y, stop.r, stop.g, stop.b, stop.a * globalAlpha);

  const fillRect = (x: number, y: number, w: number, h: number): void => {
    const gradient =
      typeof fillStyle === 'object' && fillStyle !== null ? gradients.get(fillStyle) : undefined;
    const x0 = Math.max(0, Math.round(Math.min(x, x + w)));
    const x1 = Math.min(width - 1, Math.round(Math.max(x, x + w)));
    const y0 = Math.max(0, Math.round(Math.min(y, y + h)));
    const y1 = Math.min(height - 1, Math.round(Math.max(y, y + h)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        if (gradient) {
          paint(sample(gradient, px + 0.5, py + 0.5), px, py);
        } else {
          paint({ ...parse(String(fillStyle)), offset: 0 }, px, py);
        }
      }
    }
  };

  const NONE: Stop = { offset: 0, r: 0, g: 0, b: 0, a: 0 };

  /**
   * Canvas pads a gradient: outside the ends the nearest stop repeats, and a zero-length linear or
   * a zero-radius radial paints nothing at all. Both rules matter here — treating the outside as
   * transparent, or a degenerate geometry as "stop zero everywhere", painted a whole stage one
   * uniform step brighter than the stops the renderer actually handed over.
   */
  const sample = (gradient: Gradient, x: number, y: number): Stop => {
    const stops = gradient.stops;
    if (stops.length === 0) return NONE;
    if (gradient.kind === 'linear') {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = gradient.geometry;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const length = dx * dx + dy * dy;
      if (length === 0) return NONE;
      const t = ((x - x0) * dx + (y - y0) * dy) / length;
      return lerpStops(stops, t);
    }
    const [, , r0 = 0, x1 = 0, y1 = 0, r1 = 0] = gradient.geometry;
    if (r0 === 0 && r1 === 0) return NONE;
    const distance = Math.hypot(x - x1, y - y1);
    const span = r1 - r0;
    const t = span === 0 ? 0 : (distance - r0) / span;
    return lerpStops(stops, t);
  };

  const drawImage = (
    sprite: CanvasImageSource & { blur?: number; tint?: number[] },
    x: number,
    y: number,
    w: number,
    h: number,
  ): void => {
    const tint = sprite.tint ?? [255, 255, 255];
    const blur = sprite.blur ?? 1;
    const radiusX = Math.max(0.5, w / 2);
    const radiusY = Math.max(0.5, h / 2);
    const centreX = x + radiusX;
    const centreY = y + radiusY;
    const x0 = Math.max(0, Math.floor(centreX - radiusX));
    const x1 = Math.min(width - 1, Math.ceil(centreX + radiusX));
    const y0 = Math.max(0, Math.floor(centreY - radiusY));
    const y1 = Math.min(height - 1, Math.ceil(centreY + radiusY));
    for (let py = y0; py <= y1; py++) {
      const dy = (py + 0.5 - centreY) / radiusY;
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5 - centreX) / radiusX;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius > 1) continue;
        blend(
          px,
          py,
          tint[0] ?? 255,
          tint[1] ?? 255,
          tint[2] ?? 255,
          discAlpha(radius, blur) * globalAlpha,
        );
      }
    }
  };

  const makeGradient =
    (kind: 'linear' | 'radial') =>
    (...args: number[]) => {
      const gradient: Gradient = { kind, geometry: args, stops: [] };
      const handle = {
        addColorStop(offset: number, color: string) {
          const stop = parse(color);
          gradient.stops.push({ ...stop, offset });
        },
      };
      gradients.set(handle, gradient);
      lastGradient = gradient;
      return handle as unknown as CanvasGradient;
    };

  const target: Record<string, unknown> = {
    canvas: { width, height },
    createLinearGradient: makeGradient('linear'),
    createRadialGradient: makeGradient('radial'),
    fillRect,
    clearRect: (x: number, y: number, w: number, h: number) => {
      const previous = composite;
      composite = 'source-over';
      for (let py = Math.round(y); py < Math.round(y + h); py++) {
        for (let px = Math.round(x); px < Math.round(x + w); px++) {
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const offset = (py * width + px) * 3;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
        }
      }
      composite = previous;
    },
    drawImage: (sprite: CanvasImageSource, ...rest: number[]) => {
      if (rest.length < 4) {
        skip('drawImage:9arg');
        return;
      }
      drawImage(
        sprite as CanvasImageSource & { blur?: number; tint?: number[] },
        (rest[0] ?? 0) + tx,
        (rest[1] ?? 0) + ty,
        rest[2] ?? 0,
        rest[3] ?? 0,
      );
    },
    save: () => stack.push({ fillStyle, globalAlpha, composite, tx, ty }),
    // A real canvas restores the *whole* state here, and the composite mode is the part that
    // matters: the ember glow and the light pools leave it on `lighter`, and if `restore` does not
    // take it back, every later layer adds instead of blending — which is how this file's first
    // version painted a room the renderer had asked for at rgb(37,37,39) as rgb(75,74,76).
    restore: () => {
      const state = stack.pop();
      if (!state) return;
      fillStyle = state.fillStyle;
      globalAlpha = state.globalAlpha;
      composite = state.composite;
      tx = state.tx;
      ty = state.ty;
    },
    translate: (x: number, y: number) => {
      tx += x;
      ty += y;
    },
    setTransform: () => {
      tx = 0;
      ty = 0;
    },
    rotate: () => skip('rotate'),
    scale: () => skip('scale'),
    beginPath: () => undefined,
    closePath: () => undefined,
    fill: () => skip('fill:path'),
    stroke: () => skip('stroke:path'),
    arc: () => skip('arc'),
    ellipse: () => skip('ellipse'),
    moveTo: () => skip('path'),
    lineTo: () => skip('path'),
    quadraticCurveTo: () => skip('path'),
    bezierCurveTo: () => skip('path'),
    rect: () => skip('rect:path'),
    strokeRect: () => skip('strokeRect'),
    setLineDash: () => undefined,
    createPattern: () => {
      skip('createPattern');
      return null;
    },
    clip: () => skip('clip'),
  };

  const ctx = new Proxy(target, {
    get(object, property: string) {
      if (property === 'fillStyle') return object.fillStyle;
      if (property === 'strokeStyle') return object.strokeStyle;
      if (property === 'globalAlpha') return object.globalAlpha;
      if (property === 'globalCompositeOperation') return object.globalCompositeOperation;
      if (property === 'lineWidth') return object.lineWidth;
      if (property === 'lineCap') return object.lineCap;
      if (property === 'lineJoin') return object.lineJoin;
      if (property === 'filter') return object.filter;
      if (property in object) return object[property];
      return () => skip(`unknown:${property}`);
    },
    set(object, property: string, value) {
      if (property === 'fillStyle') {
        const gradient =
          typeof value === 'object' && value !== null ? gradients.get(value as object) : undefined;
        object.fillStyle = gradient ? (lastGradient ?? value) : value;
        // Keep the handle so `fillRect` can find the gradient by identity.
        if (gradient) gradients.set(value as object, gradient);
        fillStyle = (gradient ? value : String(value)) as string | CanvasGradient;
        return true;
      }
      if (property === 'globalAlpha') {
        globalAlpha = Number(value);
        return true;
      }
      if (property === 'globalCompositeOperation') {
        composite = String(value);
        return true;
      }
      object[property] = value;
      return true;
    },
    has() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  const linear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminanceAt = (x: number, y: number): number => {
    const offset = (y * width + x) * 3;
    return (
      0.2126 * linear((pixels[offset] ?? 0) / 255 || 0) +
      0.7152 * linear((pixels[offset + 1] ?? 0) / 255 || 0) +
      0.0722 * linear((pixels[offset + 2] ?? 0) / 255 || 0)
    );
  };

  return {
    width,
    height,
    ctx,
    pixels,
    skipped: () => ({ ...skipped }),
    traceAt: (x: number, y: number) => {
      tracePixel.x = x;
      tracePixel.y = y;
      trace.length = 0;
      return trace;
    },
    luminance: luminanceAt,
    peakIn: (x0, y0, x1, y1) => {
      let best = { x: x0, y: y0, L: -1 };
      for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
          const L = luminanceAt(x, y);
          if (L > best.L) best = { x, y, L };
        }
      }
      return best;
    },
    meanIn: (x0, y0, x1, y1) => {
      let sum = 0;
      let count = 0;
      for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
          sum += luminanceAt(x, y);
          count += 1;
        }
      }
      return count === 0 ? 0 : sum / count;
    },
  };
}

/** A sprite the pixel canvas can shade: it carries the tint and blur it was baked for. */
export function pixelSprite(
  tint: readonly number[],
  blur: number,
  size = 64,
): SpriteImage & {
  tint: number[];
  blur: number;
} {
  return {
    width: size,
    height: size,
    tint: [tint[0] ?? 0, tint[1] ?? 0, tint[2] ?? 0],
    blur,
  } as unknown as SpriteImage & { tint: number[]; blur: number };
}

type SpriteImage = CanvasImageSource & { width: number; height: number };
