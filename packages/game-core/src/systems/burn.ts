/**
 * Consumption: how the rod turns into ash and time — SPEC.md §11, §12.
 */

import { BURN } from '../constants';
import { CIGARETTE_LENGTH } from '../types/geometry';
import { isLit } from '../stateMachine';
import type { EngineRuntime } from '../runtime';

/**
 * Burn is measured in *burning milliseconds*, not wall time, so a cigarette that was
 * lit and put down still finishes eventually, and one that was puffed hard finishes
 * sooner (§14: drawing feeds the cherry).
 */
export function tickBurn(rt: EngineRuntime, dtMs: number): void {
  const cigarette = rt.state.cigarette;
  if (!isLit(cigarette.state)) return;

  const previousRod = cigarette.rodRemaining;
  const puffFactor = cigarette.puff.active ? BURN.puffRateMultiplier : 1;
  const loadFactor = 1 + cigarette.puff.load * BURN.loadRateMultiplier;
  const rate = (1 + rt.burnJitter) * puffFactor * loadFactor;

  cigarette.burnMsElapsed = Math.min(cigarette.burnMsTotal, cigarette.burnMsElapsed + dtMs * rate);
  cigarette.rodRemaining = Math.max(0, 1 - cigarette.burnMsElapsed / cigarette.burnMsTotal);

  const consumedUnits = CIGARETTE_LENGTH * Math.max(0, previousRod - cigarette.rodRemaining);
  rt.ashCarry += consumedUnits * BURN.ashYield;
}

/** True once there is no rod left: the cherry has nothing to eat and must die. */
export function isBurnedOut(rt: EngineRuntime): boolean {
  return rt.state.cigarette.rodRemaining <= 0.0005;
}

export function burnFraction(rt: EngineRuntime): number {
  const { burnMsElapsed, burnMsTotal } = rt.state.cigarette;
  return burnMsTotal > 0 ? burnMsElapsed / burnMsTotal : 1;
}
