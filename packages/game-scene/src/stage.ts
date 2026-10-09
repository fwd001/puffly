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
