/**
 * Pose: where the cigarette is, in normalised stage units.
 *
 * Core integrates it (movement is simulation, not decoration) so the ashtray catch,
 * the flame proximity check and the renderer all agree (SPEC.md §48, §79). Motion is
 * eased and slightly imperfect, never linear (SPEC.md §59).
 */

import { approach, clamp01 } from '@puffly/shared';
import { ANGLES } from '../constants';
import type { StageLayout } from '../stage';
import { CIGARETTE_LENGTH, CIGARETTE_THICKNESS, offset, type Point } from '../types/geometry';
import type { CigarettePose, CigaretteStateId } from '../types/state';

export interface PoseTarget {
  pivot: Point;
  angleDeg: number;
  inTray: boolean;
  dragged: boolean;
  /** Per-second smoothing rate; lower feels heavier. */
  stiffness: number;
}

const STIFFNESS_HELD = 14;
const STIFFNESS_DRAG = 24;
const STIFFNESS_TRAY = 9;
const STIFFNESS_ANGLE = 8;

export function restingTarget(
  state: CigaretteStateId,
  dragPointer: Point | null,
  layout: StageLayout,
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
  pose.angleDeg = approach(pose.angleDeg, target.angleDeg + pose.wobbleDeg, STIFFNESS_ANGLE, dtMs);
  pose.inTray = target.inTray;
  pose.dragged = target.dragged;
  refreshPose(pose, rodRemaining, ashLength);
  return Math.hypot(pose.pivot.x - beforeX, pose.pivot.y - beforeY);
}

/**
 * Two detuned sines make a lean that never repeats identically, without needing a
 * noise texture in the pure layer (§59: organic, non-linear, imperfect).
 */
export function updateWobble(pose: CigarettePose, phaseMs: number, amplitudeDeg: number): void {
  const t = phaseMs / 1000;
  pose.wobbleDeg =
    Math.sin(t * 0.7) * amplitudeDeg * 0.65 + Math.sin(t * 1.93 + 0.9) * amplitudeDeg * 0.35;
}
