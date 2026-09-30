/**
 * Anchor layout and hit resolution.
 *
 * Game Core owns geometry so hit-testing and drawing can never disagree, and so a
 * desktop shell gets the same anchors as the web one (SPEC.md §79). Coordinates are
 * normalised stage units (SPEC.md §55); the adapter converts pixels into them.
 */

import { HIT } from './constants';
import { offset, type Point } from './types/geometry';
import { stageDistance, stageDistanceToSegment } from './stage';
import type { StageLayout } from './stage';
import type { GameInput, InputTarget } from './types/input';
import type { CigarettePose, StageAnchors } from './types/state';

/** Ash is only a target once there is something to flick. */
const ASH_MIN_LENGTH = 0.008;

export function computeAnchors(
  pose: CigarettePose,
  ashLength: number,
  layout: StageLayout,
): StageAnchors {
  const { pivot, angleDeg, length } = pose;
  const body = offset(pivot, length * 0.45, angleDeg);
  const tip = pose.tip;
  const ash = ashLength > ASH_MIN_LENGTH ? offset(tip, ashLength * 0.5, angleDeg) : tip;

  return {
    pack: { ...layout.pack },
    lighter: { ...layout.lighter },
    ashtray: { ...layout.ashtray },
    body,
    ember: tip,
    ash,
    rodStart: { ...pivot },
    ashEnd: ashLength > ASH_MIN_LENGTH ? pose.ashTip : tip,
    ashtrayRadius: layout.ashtrayRadius,
  };
}

interface Candidate {
  target: InputTarget;
  at: Point;
  radius: number;
  /**
   * When set, the target is this line rather than a dot: what the player sees is a 0.26-unit
   * rod, so the whole of it has to answer, not only the middle.
   */
  span?: readonly [Point, Point];
}

export function hitCandidates(anchors: StageAnchors, ashLength: number): Candidate[] {
  const list: Candidate[] = [
    { target: 'ember', at: anchors.ember, radius: HIT.ember },
    {
      target: 'cigarette',
      at: anchors.body,
      radius: HIT.body,
      span: [anchors.rodStart, anchors.ember],
    },
    { target: 'lighter', at: anchors.lighter, radius: HIT.lighter },
    {
      target: 'ashtray',
      at: anchors.ashtray,
      radius: Math.max(anchors.ashtrayRadius, HIT.ashtray),
    },
  ];
  if (ashLength > ASH_MIN_LENGTH)
    list.splice(1, 0, {
      target: 'ash',
      at: anchors.ash,
      radius: HIT.ash,
      span: [anchors.ember, anchors.ashEnd],
    });
  return list;
}

/**
 * The nearest anchor the point falls inside. `ember` and `ash` are checked before
 * `cigarette` because they sit on top of it.
 *
 * `aspect` keeps a hit area round on screen (the stage box is not square) and `tolerance`
 * widens every radius for a finger, which is how a 0.08-unit cherry stays hittable on a
 * 390 px phone (§66: no precise pixel targets).
 *
 * The winner is the candidate whose anchor the point is *closest to*, among those wide enough
 * to contain it. Ranking by leftover room instead would let a large target that merely reaches
 * over a small one steal the tap — the tray's widened touch radius overlaps the rod lying next
 * to it, and the cherry sits at the end of that rod — and the candidate order (ember, ash,
 * rod, lighter, tray) then breaks ties in the intuitive direction: what is on top answers.
 */
export function resolveTarget(
  at: Point,
  anchors: StageAnchors,
  ashLength: number,
  aspect = 1,
  tolerance = 1,
): InputTarget | null {
  let best: { target: InputTarget; distance: number } | null = null;
  for (const candidate of hitCandidates(anchors, ashLength)) {
    const distance = candidate.span
      ? stageDistanceToSegment(at, candidate.span[0], candidate.span[1], aspect)
      : stageDistance(at, candidate.at, aspect);
    if (distance > candidate.radius * tolerance) continue;
    const rank = stageDistance(at, candidate.at, aspect);
    if (best === null || rank < best.distance) best = { target: candidate.target, distance: rank };
  }
  return best?.target ?? null;
}

/**
 * Where an input really points. Keyboard/shortcut inputs name an anchor instead of a
 * pixel, which is what lets them reach the same target a touch user gets (§65, §66).
 */
export function inputPoint(input: GameInput, anchors: StageAnchors): Point {
  if (input.target === 'cigarette') return anchors.body;
  if (input.target === 'ember') return anchors.ember;
  if (input.target === 'ash') return anchors.ash;
  if (input.target === 'lighter') return anchors.lighter;
  if (input.target === 'ashtray') return anchors.ashtray;
  return { x: input.x, y: input.y };
}

export function isInside(point: Point, centre: Point, radius: number, aspect = 1): boolean {
  return stageDistance(point, centre, aspect) <= radius;
}
