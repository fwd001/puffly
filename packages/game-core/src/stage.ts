/**
 * The stage: how a canvas becomes a place to put things — SPEC.md §55, §66.
 *
 * Two ideas live here and nowhere else:
 *
 *  1. `stageBoxFor` — the rectangle inside a canvas that props may occupy. It keeps a
 *     sane aspect (a phone fills the screen, an ultrawide gets a centred strip) and is
 *     shared by the renderer and the shell, so hit-testing and drawing can never disagree
 *     about where "the middle" is.
 *  2. `layoutFor` — where the pack, lighter, tray and held rod sit *for that shape*.
 *     A landscape phone and a portrait phone have completely different empty space, and
 *     one normalised table cannot serve both: that is what made the landscape layout look
 *     like a pebble in a shoebox.
 *
 * Positions are normalised to the stage box (0..1 on both axes). Because the box aspect
 * varies, distances in that space are anisotropic, so `stageDistance` carries the aspect
 * into every hit test instead of pretending x and y are the same size.
 */

import { clamp, type Point } from '@puffly/shared';
import { ANGLES, LAYOUT } from './constants';

/**
 * Below this the canvas is a tall slab (phone portrait). It sits under the reference
 * stage aspect of 0.75 on purpose: an engine that was never told its aspect keeps the
 * desktop geometry, so a layout change cannot silently rewrite a session's ergonomics.
 */
export const TALL_ASPECT_MAX = 0.7;
export const WIDE_ASPECT_MIN = 1.35;

/** The stage box never gets narrower than this… */
export const STAGE_MIN_ASPECT = 0.42;
/** …nor wider than this, so an ultrawide monitor does not fling the tray off-screen. */
export const STAGE_MAX_ASPECT = 1.9;

export interface StageLayout {
  id: 'tall' | 'regular' | 'wide';
  /** Where a fresh rod lies. */
  table: Point;
  pack: Point;
  lighter: Point;
  ashtray: Point;
  /** Where the rod is held. */
  restPivot: Point;
  /** Horizon of the table surface, as a fraction of the stage height. */
  tableEdgeY: number;
  ashtrayRadius: number;
  /** How far the held rod tilts; a landscape scene can afford more. */
  heldDeg: number;
}

const REGULAR: StageLayout = {
  id: 'regular',
  table: LAYOUT.table,
  pack: LAYOUT.pack,
  lighter: LAYOUT.lighter,
  ashtray: LAYOUT.ashtray,
  restPivot: LAYOUT.restPivot,
  tableEdgeY: 0.78,
  ashtrayRadius: 0.1,
  heldDeg: ANGLES.heldDeg,
};

const TALL: StageLayout = {
  id: 'tall',
  // A phone is narrow: everything hugs the lower half so the smoke has room to travel.
  table: { x: 0.5, y: 0.9 },
  pack: { x: 0.24, y: 0.855 },
  lighter: { x: 0.12, y: 0.71 },
  // Far enough left that a rod lying in it still fits on the screen.
  ashtray: { x: 0.7, y: 0.855 },
  restPivot: { x: 0.5, y: 0.58 },
  tableEdgeY: 0.76,
  ashtrayRadius: 0.125,
  heldDeg: -19,
};

const WIDE: StageLayout = {
  id: 'wide',
  // A band: spread the objects apart and lift the horizon, or the middle looks empty.
  table: { x: 0.33, y: 0.86 },
  pack: { x: 0.19, y: 0.8 },
  lighter: { x: 0.075, y: 0.66 },
  ashtray: { x: 0.815, y: 0.8 },
  restPivot: { x: 0.52, y: 0.5 },
  tableEdgeY: 0.7,
  ashtrayRadius: 0.085,
  heldDeg: -14,
};

export const STAGE_LAYOUTS: Record<StageLayout['id'], StageLayout> = {
  tall: TALL,
  regular: REGULAR,
  wide: WIDE,
};

export function layoutFor(aspect: number): StageLayout {
  if (!Number.isFinite(aspect) || aspect <= 0) return REGULAR;
  if (aspect < TALL_ASPECT_MAX) return TALL;
  if (aspect >= WIDE_ASPECT_MIN) return WIDE;
  return REGULAR;
}

export interface StageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
}

/**
 * The largest stage box of an aspect within [0.42, 1.9] that fits the canvas, centred.
 * Background layers paint the whole canvas; only props are confined to this box, so the
 * clamping is invisible except that it keeps objects in reach of a thumb.
 */
export function stageBoxFor(widthPx: number, heightPx: number): StageBox {
  const w = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
  const h = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 1;
  const target = clamp(w / h, STAGE_MIN_ASPECT, STAGE_MAX_ASPECT);

  if (w / h <= target) {
    return { x: 0, y: 0, width: w, height: h, aspect: w / h };
  }
  const width = h * target;
  return { x: (w - width) / 2, y: 0, width, height: h, aspect: target };
}

/** Distance in stage space, corrected for the box's aspect so a hit area is round on screen. */
export function stageDistance(a: Point, b: Point, aspect: number): number {
  const dx = (a.x - b.x) * (Number.isFinite(aspect) ? aspect : 1);
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Distance from a point to a line segment, in the same screen-round metric as
 * `stageDistance`.
 *
 * A cigarette is 0.26 stage units long and about 0.01 thick. Measuring a tap against its
 * midpoint alone leaves the outer half of the thing you can see untappable, which on a phone
 * means the tray's wide touch target swallows the tap instead.
 */
export function stageDistanceToSegment(
  point: Point,
  from: Point,
  to: Point,
  aspect: number,
): number {
  const scale = Number.isFinite(aspect) ? aspect : 1;
  const px = point.x * scale;
  const py = point.y;
  const ax = from.x * scale;
  const ay = from.y;
  const bx = to.x * scale;
  const by = to.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * A finger is not a cursor: on a 390 px screen one normalised unit is 180 px, so a
 * 0.085 radius is already generous — but touch still lands sloppily, especially on the
 * cherry and the ash. Touch inputs get this multiplier on every hit radius (§66).
 */
export const TOUCH_HIT_TOLERANCE = 1.6;

export function hitToleranceFor(
  source: 'touch' | 'pointer' | 'mouse' | 'keyboard' | 'shortcut' | undefined,
): number {
  return source === 'touch' ? TOUCH_HIT_TOLERANCE : 1;
}
