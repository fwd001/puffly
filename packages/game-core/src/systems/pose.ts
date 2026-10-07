/**
 * Pose: where the cigarette is, in normalised stage units.
 *
 * Core integrates it (movement is simulation, not decoration) so the ashtray catch,
 * the flame proximity check and the renderer all agree (SPEC.md §48, §79). Motion is
 * eased and slightly imperfect, never linear (SPEC.md §59).
 */

import { approach, clamp01 } from '@puffly/shared';
import { ANGLES } from '../constants';
import { stageDistance, type StageLayout } from '../stage';
import {
  angleBetween,
  CIGARETTE_LENGTH,
  CIGARETTE_THICKNESS,
  offset,
  type Point,
} from '../types/geometry';
import type { CigarettePose, CigaretteStateId } from '../types/state';

export interface PoseTarget {
  pivot: Point;
  angleDeg: number;
  inTray: boolean;
  dragged: boolean;
  /** Per-second smoothing rate; lower feels heavier. */
  stiffness: number;
  /**
   * Separate rate for the turn. Left unset the angle follows `STIFFNESS_ANGLE`, which is right for
   * every pose a hand settles into; reaching across to a flame is the one place where a slow turn
   * reads as the rod doing a somersault rather than a wrist flicking.
   */
  angleStiffness?: number;
}

const STIFFNESS_HELD = 14;
const STIFFNESS_DRAG = 24;
const STIFFNESS_TRAY = 9;
const STIFFNESS_ANGLE = 8;
/** Slower than a hand at rest: the dip to the flame is the thing the player is watching. */
const STIFFNESS_REACH = 7;
/** The rod has to come about ~155° to point at a flame on the far side of the table. */
const STIFFNESS_TURN = 17;

/** The representation of `angleDeg` nearest `fromDeg`, so an eased turn takes the short arc. */
function shortWayTo(angleDeg: number, fromDeg: number): number {
  let angle = angleDeg;
  while (angle - fromDeg > 180) angle -= 360;
  while (fromDeg - angle > 180) angle += 360;
  return angle;
}

/**
 * Where the fire is, relative to the point the layout calls the lighter. That point is the tap
 * centre of the *case*; the flame burns above it, and the rod has to reach the fire rather than the
 * metal. Normalised stage units (§55).
 */
export const LIGHTER_FLAME = { x: 0.004, y: -0.026 };

/**
 * How close the rod's burning end has to get before the cherry can catch (§15 LIGHTING), in the
 * screen-round metric `stageDistance` uses. The flame is about 26 px wide on a phone, so this is
 * roughly "the end is inside the fire" rather than "the end is somewhere on the lighter".
 */
export const LIGHTING_REACH = 0.045;

/**
 * Distance in the plane the pose is authored in: normalised units, no aspect correction. `offset`
 * and `angleBetween` both live here, so a rod length and a travel distance are only comparable to
 * each other in this metric — measuring one in the other is what made the tip stop 0.064 short of
 * the flame and never arrive.
 */
const planeDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const flamePoint = (layout: StageLayout): Point => ({
  x: layout.lighter.x + LIGHTER_FLAME.x,
  y: layout.lighter.y + LIGHTER_FLAME.y,
});

/** 0..1: how far inside the flame a point is, in the same screen-round metric a tap uses. */
export const flameProximity = (at: Point, layout: StageLayout, aspect: number): number =>
  clamp01(1 - stageDistance(at, flamePoint(layout), aspect) / LIGHTING_REACH);

export function restingTarget(
  state: CigaretteStateId,
  dragPointer: Point | null,
  layout: StageLayout,
  rodLength: number,
): PoseTarget {
  if (dragPointer) {
    return {
      pivot: dragPointer,
      angleDeg: layout.heldDeg,
      inTray: false,
      dragged: true,
      stiffness: STIFFNESS_DRAG,
    };
  }
  if (state === 'LIGHTING') {
    // The rod goes to the fire, and the fire is over on the far side of the table. So the burning
    // end sweeps across and the hand follows it: the pivot is placed exactly `rodLength` back along
    // the direction the rod now points, which puts the tip on the flame for any rod length.
    const flame = flamePoint(layout);
    const angleDeg = angleBetween(layout.restPivot, flame);
    // Turn the short way. The held rod and this one are close to antiparallel, so the two ways round
    // differ by only a few degrees of final pose and entirely in what happens on the way: the long
    // arc takes the burning end down through the table, which the flame is not under. Measured on a
    // phone, the dip put the end 90 px below the table edge; this arc keeps it in the air.
    const reach = planeDistance(layout.restPivot, flame);
    return {
      // A stub is short enough that the hand could stay put and still touch the fire; only slide
      // the hand across when the rod cannot reach on its own.
      pivot: reach > rodLength ? offset(flame, -rodLength, angleDeg) : layout.restPivot,
      angleDeg: shortWayTo(angleDeg, layout.heldDeg),
      inTray: false,
      dragged: false,
      stiffness: STIFFNESS_REACH,
      angleStiffness: STIFFNESS_TURN,
    };
  }
  if (state === 'IDLE') {
    return {
      pivot: layout.table,
      angleDeg: ANGLES.tableDeg,
      inTray: false,
      dragged: false,
      stiffness: STIFFNESS_TRAY,
    };
  }
  if (state === 'DISCARDED' || state === 'EXTINGUISHED') {
    // A stub cools in the tray; while it is still going out it stays under the thumb.
    const trayEdge = { x: layout.ashtray.x - 0.02, y: layout.ashtray.y - 0.015 };
    return {
      pivot: state === 'DISCARDED' ? layout.ashtray : trayEdge,
      angleDeg: ANGLES.trayDeg,
      inTray: true,
      dragged: false,
      stiffness: STIFFNESS_TRAY,
    };
  }
  return {
    pivot: layout.restPivot,
    angleDeg: layout.heldDeg,
    inTray: false,
    dragged: false,
    stiffness: STIFFNESS_HELD,
  };
}

/** Recompute derived endpoints. Call after any pose, rod or ash change. */
export function refreshPose(pose: CigarettePose, rodRemaining: number, ashLength: number): void {
  const rod = CIGARETTE_LENGTH * clamp01(rodRemaining);
  pose.rodLength = rod;
  pose.ashLength = ashLength;
  pose.length = rod + ashLength;
  pose.thickness = CIGARETTE_THICKNESS;
  pose.tip = offset(pose.pivot, rod, pose.angleDeg);
  pose.ashTip = offset(pose.tip, ashLength, pose.angleDeg + pose.wobbleDeg);
  pose.visible = pose.length > 0.002;
}

/** Move one step toward the target. Returns travelled distance, for impact cues. */
export function integratePose(
  pose: CigarettePose,
  target: PoseTarget,
  rodRemaining: number,
  ashLength: number,
  dtMs: number,
): number {
  const beforeX = pose.pivot.x;
  const beforeY = pose.pivot.y;
  pose.pivot.x = approach(pose.pivot.x, target.pivot.x, target.stiffness, dtMs);
  pose.pivot.y = approach(pose.pivot.y, target.pivot.y, target.stiffness, dtMs);
  pose.angleDeg = approach(
    pose.angleDeg,
    target.angleDeg + pose.wobbleDeg,
    target.angleStiffness ?? STIFFNESS_ANGLE,
    dtMs,
  );
  pose.inTray = target.inTray;
  pose.dragged = target.dragged;
  refreshPose(pose, rodRemaining, ashLength);
  return Math.hypot(pose.pivot.x - beforeX, pose.pivot.y - beforeY);
}

/**
 * Two detuned sines make a lean that never repeats identically, without needing a noise texture in
 * the pure layer (§59: organic, non-linear, imperfect) — but both rates have to stay below the
 * speed a bright edge can travel without the picture appearing to swim. At 0.7 and 1.93 rad/s the
 * lean turned over 0.019 deg per frame at unit amplitude, which is a new sub-pixel of the rod's
 * white edge every frame for the whole break; these two give 0.008. The slower pair also beats on a
 * ~40 s cycle rather than a ~1 s one, so what reads on screen is a hand settling, not shivering.
 */
export function updateWobble(pose: CigarettePose, phaseMs: number, amplitudeDeg: number): void {
  const t = phaseMs / 1000;
  pose.wobbleDeg =
    Math.sin(t * 0.31) * amplitudeDeg * 0.7 + Math.sin(t * 0.83 + 0.9) * amplitudeDeg * 0.3;
}
