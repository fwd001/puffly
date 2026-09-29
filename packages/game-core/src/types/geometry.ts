/** Geometry primitives used by the pure layer. No DOM types here (SPEC.md §47). */

import type { Point, Rgb } from '@puffly/shared';

export type { Point, Rgb };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Range {
  min: number;
  max: number;
}

export const range = (min: number, max: number): Range => ({ min, max });

/** Normalised stage: 0..1 on both axes, y growing downwards (SPEC.md §55). */
export const STAGE_ASPECT = 0.75;

/** A pristine rod's long edge, in normalised stage units. */
export const CIGARETTE_LENGTH = 0.34;
export const CIGARETTE_THICKNESS = 0.016;
export const FILTER_FRACTION = 0.26;

export function angleBetween(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function offset(from: Point, distanceUnits: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * distanceUnits, y: from.y + Math.sin(rad) * distanceUnits };
}
