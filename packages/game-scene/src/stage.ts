/**
 * Stage coordinates → scene coordinates.
 *
 * The core owns the geometry (SPEC §79) and the shell mirrors it as five canvas fractions on
 * `.stage[data-aim]`. The scene reads that mirror and nothing else: a second copy of the layout is
 * exactly the mistake the old browser layer made twice, and both times it reported a working game
 * as a broken one.
 *
 * Fractions are relative to the canvas, so the mapping needs the canvas aspect — otherwise a
 * portrait phone stretches the table. y is flipped: fractions grow downwards, world y grows up.
 */

export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

export const AIM_KEYS = ['body', 'ember', 'lighter', 'ashtray', 'pack'] as const;
export type AimKey = (typeof AIM_KEYS)[number];

/** Parse the `.stage[data-aim]` mirror: `body:0.62,0.41 lighter:0.12,0.85 …`. */
export function parseAim(text: string): Partial<Record<AimKey, AimPoint>> {
  const out: Partial<Record<AimKey, AimPoint>> = {};
  for (const part of text.split(' ')) {
    const [key, pair] = part.split(':');
    if (key === undefined || pair === undefined) continue;
    const [x, y] = pair.split(',').map(Number);
    if (!AIM_KEYS.includes(key as AimKey) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[key as AimKey] = { x: x as number, y: y as number };
  }
  return out;
}

/** World height of the visible stage; the width follows the canvas aspect so nothing is stretched. */
export const WORLD_HEIGHT = 4;

export function toWorld(point: AimPoint, aspect: number): readonly [number, number, number] {
  return [(point.x - 0.5) * WORLD_HEIGHT * aspect, (0.5 - point.y) * WORLD_HEIGHT, 0];
}

/** A rod drawn between the two published points, so its angle comes from the core and not a guess. */
export function rodBetween(
  body: AimPoint,
  ember: AimPoint,
  aspect: number,
): {
  readonly mid: readonly [number, number, number];
  readonly length: number;
  readonly angle: number;
} {
  const a = toWorld(body, aspect);
  const b = toWorld(ember, aspect);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // The two points are the middle and the lit end of a 0.26-unit rod, so the distance between them is
  // a fraction of the rod: scale it back up by where they sit (body at 0.45 of the length).
  const span = Math.hypot(dx, dy) || 1e-6;
  const length = (span / 0.55) * 1.0;
  return {
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0],
    length,
    angle: Math.atan2(dy, dx),
  };
}

/**
 * The stage rectangle inside the canvas, as four canvas fractions: `x,y,width,height`.
 *
 * The letterbox is the reason this exists. Anchors arrive as canvas fractions, but the stage is a
 * 3:4 box floating in that canvas — so a scene that mapped canvas fractions straight to the world
 * put the tray in the wrong place at the wrong size. The shell publishes the box for the same
 * reason it publishes the anchors: a second copy of the layout has gone stale twice in this repo.
 */
export interface StageBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function parseStageBox(text: string): StageBox | null {
  const parts = text.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Canvas fraction → world, through the stage box. `viewportAspect` is the canvas's own aspect
 * (width / height); the stage's world width follows from how much of the canvas the box covers.
 */
export function canvasToWorld(
  fraction: AimPoint,
  box: StageBox,
  viewportAspect: number,
): readonly [number, number, number] {
  const nx = (fraction.x - box.x) / box.width;
  const ny = (fraction.y - box.y) / box.height;
  const stageWidth = WORLD_HEIGHT * (box.width / box.height) * viewportAspect;
  return [(nx - 0.5) * stageWidth, (0.5 - ny) * WORLD_HEIGHT, 0];
}

/** The stage box's world size, which is also the orthographic camera's frame. */
export function stageWorldSize(
  box: StageBox,
  viewportAspect: number,
): { readonly width: number; readonly height: number } {
  return { width: WORLD_HEIGHT * (box.width / box.height) * viewportAspect, height: WORLD_HEIGHT };
}

/** A rod drawn between two canvas fractions, via the same box. */
export function rodBetweenInBox(
  body: AimPoint,
  ember: AimPoint,
  box: StageBox,
  viewportAspect: number,
): {
  readonly mid: readonly [number, number, number];
  readonly length: number;
  readonly angle: number;
} {
  const a = canvasToWorld(body, box, viewportAspect);
  const b = canvasToWorld(ember, box, viewportAspect);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const span = Math.hypot(dx, dy) || 1e-6;
  return {
    mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0],
    length: span / 0.55,
    angle: Math.atan2(dy, dx),
  };
}

/**
 * Stage units → world units, with the frame the camera is built around.
 *
 * Distinct from `canvasToWorld`: those two take *canvas fractions* (positions the shell publishes
 * for pointers); these take the core's own stage units, which is what the particle pool works in.
 */
export function stageToWorld(
  point: AimPoint,
  frame: { readonly width: number; readonly height: number },
): readonly [number, number, number] {
  return [(point.x - 0.5) * frame.width, (0.5 - point.y) * frame.height, 0];
}
