/**
 * Puff interaction — SPEC.md §14.
 *
 * `hold` is a draw: intensity, ember, smoke density and sound all rise together and
 * `release` lets the smoke expand. `tap` is a short sip. The numbers are gameified and
 * never surfaced to the player (§4).
 */

import { clamp, clamp01, lerp } from '@puffly/shared';
import { PUFF, TIMING } from '../constants';
import { emit, record, setState } from '../emit';
import { SessionEventType } from '../types/events';
import { exhaleBurst, puffBurst } from './emissions';
import type { EngineRuntime } from '../runtime';

export function beginPuff(rt: EngineRuntime): void {
  const puff = rt.state.cigarette.puff;
  if (puff.active) return;
  const profile = rt.cigarette.puffProfile;

  puff.active = true;
  puff.progress = 0;
  puff.heldMs = 0;
  puff.intensity = clamp01(profile.intensityMin);
  rt.timers.puffMs = 0;
  rt.timers.puffPlannedMs = rt.rng.range(profile.durationMin, profile.durationMax);
  setState(rt, 'PUFFING');
}

export function tickPuff(rt: EngineRuntime, dtMs: number): void {
  const puff = rt.state.cigarette.puff;
  const profile = rt.cigarette.puffProfile;

  if (!puff.active) {
    puff.sinceReleaseMs += dtMs;
    puff.progress = lerp(puff.progress, 0, clamp01(dtMs / 220));
    puff.intensity = lerp(puff.intensity, 0, clamp01(dtMs / 320));
    puff.heldMs = 0;
    puff.load = Math.max(0, puff.load - PUFF.loadDecayPerSecond * (dtMs / 1000));
    return;
  }

  rt.timers.puffMs += dtMs;
  puff.heldMs += dtMs;
  const planned = Math.max(1, rt.timers.puffPlannedMs);
  puff.progress = clamp01(rt.timers.puffMs / planned);
  // Sub-linear so a long hold reads as " fuller", not "twice as much" (§14).
  const shaped = Math.pow(puff.progress, PUFF.intensityCurve);
  puff.intensity = clamp(lerp(profile.intensityMin, profile.intensityMax, shaped), 0, 1);

  // A held draw leaks a little at the cherry the whole time it is held.
  if (rt.rng.bool(clamp01(dtMs / 1000) * 6 * (0.3 + puff.intensity))) {
    emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: puffBurst(rt) });
  }
}

export function endPuff(rt: EngineRuntime): void {
  const puff = rt.state.cigarette.puff;
  if (!puff.active) return;
  const intensity = puff.intensity;

  puff.active = false;
  puff.sinceReleaseMs = 0;
  puff.count += 1;
  puff.load = clamp01(puff.load + intensity * PUFF.loadPerPuff);
  rt.state.cigarette.ember.flare = Math.max(rt.state.cigarette.ember.flare, intensity * 0.55);

  emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: exhaleBurst(rt, intensity) });
  record(rt, SessionEventType.PUFF, {
    intensity: Math.round(intensity * 1000) / 1000,
    heldMs: Math.round(puff.heldMs),
    plannedMs: Math.round(rt.timers.puffPlannedMs),
    count: puff.count,
  });
  rt.progress.puffs += 1;
}

/** A tap is a sip: a short draw that ends immediately (§14 tap vs hold). */
export function tapPuff(rt: EngineRuntime): void {
  beginPuff(rt);
  const puff = rt.state.cigarette.puff;
  const profile = rt.cigarette.puffProfile;
  puff.progress = clamp01(TIMING.microPuffMs / Math.max(1, rt.timers.puffPlannedMs));
  puff.intensity = clamp01(profile.intensityMin * 0.9);
  puff.heldMs = TIMING.microPuffMs;
  endPuff(rt);
}

export function isPuffing(rt: EngineRuntime): boolean {
  return rt.state.cigarette.puff.active;
}
