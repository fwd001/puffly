/**
 * The three phases the design's rail names — 点燃 / 吸烟 / 烟灰缸 (§9.2 of the Smoke Ritual brief).
 *
 * A phase is a *reading* of the state machine, never a mode the player can be stuck in: the same
 * eleven states always map to the same phase, so the rail, the head-up ring and the hint graphic
 * cannot disagree with each other or with the scene. `settings` is not here because that is a
 * sheet the shell opens, not something the cigarette can cause.
 */

import type { CigaretteStateId } from '@puffly/game-core';

export type Phase = 'light' | 'puff' | 'tray' | 'out';

const PHASES: Record<CigaretteStateId, Phase> = {
  IDLE: 'light',
  PICKED_UP: 'light',
  LIGHTING: 'light',
  BURNING: 'puff',
  PUFFING: 'puff',
  RESTING: 'puff',
  NEAR_END: 'puff',
  /** Standing ash is the news, so the interface moves to the tray while it is worth flicking. */
  ASH_READY: 'tray',
  EXTINGUISHING: 'out',
  EXTINGUISHED: 'out',
  DISCARDED: 'out',
};

export function phaseOf(state: CigaretteStateId): Phase {
  return PHASES[state];
}

/**
 * Whether the big pill should be *held* rather than tapped. Drawing and pressing the rod out are
 * sustained gestures; everything else is one decision. Same split the space bar already uses
 * (§65), so the pill and the keyboard never disagree about what pressing means.
 */
export function isSustained(affordance: string): boolean {
  return affordance === 'puff' || affordance === 'extinguish';
}
