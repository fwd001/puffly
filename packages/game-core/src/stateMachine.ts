/**
 * The cigarette lifecycle state machine — SPEC.md §11.
 *
 * Two kinds of state:
 *  - interaction-driven (`IDLE`, `PICKED_UP`, `LIGHTING`, `PUFFING`, `EXTINGUISHING`,
 *    `EXTINGUISHED`, `DISCARDED`): entered and left by handlers, because they last
 *    exactly as long as the player is doing the thing;
 *  - derived (`BURNING`, `RESTING`, `ASH_READY`, `NEAR_END`): recomputed every tick
 *    from the simulation, in the priority order encoded by `deriveAmbientState`.
 */

import { STEP_MS, THRESHOLDS, TIMING } from './constants';
import type { CigaretteStateId } from './types/state';

export const CIGARETTE_STATES: readonly CigaretteStateId[] = [
  'IDLE',
  'PICKED_UP',
  'LIGHTING',
  'BURNING',
  'PUFFING',
  'RESTING',
  'ASH_READY',
  'NEAR_END',
  'EXTINGUISHING',
  'EXTINGUISHED',
  'DISCARDED',
];

export const AMBIENT_STATES: readonly CigaretteStateId[] = [
  'BURNING',
  'RESTING',
  'ASH_READY',
  'NEAR_END',
];

/**
 * Every legal edge. The derived states may replace each other freely, and every lit
 * state allows being put out or dropped — the table is exhaustive because a missing
 * edge would silently strand a cigarette.
 */
export const TRANSITIONS: Record<CigaretteStateId, readonly CigaretteStateId[]> = {
  IDLE: ['PICKED_UP'],
  PICKED_UP: ['IDLE', 'LIGHTING', 'DISCARDED'],
  LIGHTING: ['PICKED_UP', 'BURNING'],
  BURNING: ['PUFFING', 'RESTING', 'ASH_READY', 'NEAR_END', 'EXTINGUISHING', 'DISCARDED'],
  PUFFING: ['BURNING', 'RESTING', 'ASH_READY', 'NEAR_END', 'EXTINGUISHING', 'DISCARDED'],
  RESTING: ['BURNING', 'PUFFING', 'ASH_READY', 'NEAR_END', 'EXTINGUISHING', 'DISCARDED'],
  ASH_READY: ['BURNING', 'PUFFING', 'RESTING', 'NEAR_END', 'EXTINGUISHING', 'DISCARDED'],
  NEAR_END: ['BURNING', 'PUFFING', 'RESTING', 'ASH_READY', 'EXTINGUISHING', 'DISCARDED'],
  EXTINGUISHING: [
    'EXTINGUISHED',
    'BURNING',
    'RESTING',
    'ASH_READY',
    'NEAR_END',
    'PUFFING',
    'DISCARDED',
  ],
  EXTINGUISHED: ['DISCARDED'],
  DISCARDED: ['IDLE'],
};

export function canTransition(from: CigaretteStateId, to: CigaretteStateId): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Legal targets from `from`, for handlers and the exhaustive transition test. */
export function allowedNext(from: CigaretteStateId): readonly CigaretteStateId[] {
  return TRANSITIONS[from] ?? [];
}

export interface AmbientSignals {
  /** 0..1 unburnt paper portion. */
  rodRemaining: number;
  /** Ash length as a fraction of `ashProfile.maxLength`. */
  ashRatio: number;
  /** Milliseconds since the last puff was released. */
  sinceReleaseMs: number;
}

/**
 * Priority: a stub reads as `NEAR_END` even with a long column, a long column reads
 * as `ASH_READY` even while settling, and settling beats plain smouldering.
 */
export function deriveAmbientState(signals: AmbientSignals): CigaretteStateId {
  if (signals.rodRemaining <= THRESHOLDS.nearEndRodFraction) return 'NEAR_END';
  if (signals.ashRatio >= THRESHOLDS.ashCriticalRatio) return 'ASH_READY';
  if (signals.sinceReleaseMs < TIMING.restSettleMs) return 'RESTING';
  return 'BURNING';
}

/** States in which the ember is hot enough to burn rod and make smoke. */
export function isLit(state: CigaretteStateId): boolean {
  return (
    state === 'BURNING' ||
    state === 'PUFFING' ||
    state === 'RESTING' ||
    state === 'ASH_READY' ||
    state === 'NEAR_END'
  );
}

/** States in which the cigarette is off the table and in play. */
export function isHeld(state: CigaretteStateId): boolean {
  return state !== 'IDLE' && state !== 'DISCARDED';
}

/** The tick is a fixed step, so timers read as multiples of it (SPEC.md §71). */
export const MIN_STEP_MS = STEP_MS;
