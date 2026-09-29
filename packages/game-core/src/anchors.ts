/**
 * Anchor layout and hit resolution.
 *
 * Game Core owns geometry so hit-testing and drawing can never disagree, and so a
 * desktop shell gets the same anchors as the web one (SPEC.md §79). Coordinates are
 * normalised stage units (SPEC.md §55); the adapter converts pixels into them.
 */

import { HIT } from './constants';
import { offset, type Point } from './types/geometry';
import { stageDistance } from './stage';
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
    ashtrayRadius: layout.ashtrayRadius,
  };
}

interface Candidate {
  target: InputTarget;
  at: Point;
  radius: number;
}

export function hitCandidates(anchors: StageAnchors, ashLength: number): Candidate[] {
  const list: Candidate[] = [
    { target: 'ember', at: anchors.ember, radius: HIT.ember },
    { target: 'cigarette', at: anchors.body, radius: HIT.body },
    { target: 'lighter', at: anchors.lighter, radius: HIT.lighter },
    {
      target: 'ashtray',
      at: anchors.ashtray,
      radius: Math.max(anchors.ashtrayRadius, HIT.ashtray),
    },
  ];
  if (ashLength > ASH_MIN_LENGTH)
    list.splice(1, 0, { target: 'ash', at: anchors.ash, radius: HIT.ash });
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
 * The winner is the candidate the point sits *furthest inside*, so a large target that
 * merely reaches over a small one does not steal it: on a phone the tray's widened radius
 * overlaps the rod lying next to it, and a finger on the cigarette stays on the cigarette.
 */
export function resolveTarget(
  at: Point,
  anchors: StageAnchors,
  ashLength: number,
  aspect = 1,
  tolerance = 1,
): InputTarget | null {
  let best: { target: InputTarget; slack: number } | null = null;
  for (const candidate of hitCandidates(anchors, ashLength)) {
    const distance = stageDistance(at, candidate.at, aspect);
    const slack = distance - candidate.radius * tolerance;
    if (slack > 0) continue;
    if (best === null || slack < best.slack) best = { target: candidate.target, slack };
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
