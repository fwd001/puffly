/**
 * Ember engine — SPEC.md §17.
 *
 * Brightness, a "temperature illusion" ramp, flicker, occasional flares and decay. The
 * flare is the moment a player later describes as 「刚才那个火星还挺真实」 (§82), so it is
 * rare, sharp, and always followed by a slow recovery.
 */

import { approach, clamp, clamp01, lerp } from '@puffly/shared';
import { EMBER, THRESHOLDS, TIMING } from '../constants';
import { emit, record } from '../emit';
import { isLit } from '../stateMachine';
import { SessionEventType } from '../types/events';
import { flareBurst, sparkBurst } from './emissions';
import type { EngineRuntime } from '../runtime';

function emberTarget(rt: EngineRuntime): number {
  const cigarette = rt.state.cigarette;
  const profile = rt.cigarette.emberProfile;
  switch (cigarette.state) {
    case 'PUFFING':
      return profile.brightness * (0.9 + 0.55 * cigarette.puff.intensity);
    case 'LIGHTING':
      return profile.brightness * 0.5 * rt.state.lighter.flame;
    case 'EXTINGUISHING':
      // Pressed, it flares first and only then goes dark (§19).
      return profile.brightness * (1.1 + 0.85 * cigarette.extinguishProgress);
    case 'BURNING':
    case 'ASH_READY':
    case 'NEAR_END':
      return profile.brightness * (0.62 + 0.3 * cigarette.puff.load);
    case 'RESTING':
      return profile.brightness * (0.55 + 0.35 * cigarette.puff.load);
    case 'EXTINGUISHED':
    case 'DISCARDED':
    case 'IDLE':
    case 'PICKED_UP':
      return 0;
    default:
      return 0;
  }
}

function tickFlare(rt: EngineRuntime, dtMs: number): void {
  const ember = rt.state.cigarette.ember;
  ember.flare = Math.max(0, ember.flare - dtMs * TIMING.flareDecayPerMs);

  if (!isLit(rt.state.cigarette.state)) return;
  const profile = rt.cigarette.emberProfile;
  const boost = 1 + rt.environment.emberModifier.flareBoost;

  rt.timers.emberFlareCheckMs += dtMs;
  while (rt.timers.emberFlareCheckMs >= EMBER.flareCheckMs) {
    rt.timers.emberFlareCheckMs -= EMBER.flareCheckMs;
    if (!rt.rng.bool(profile.flareChance * boost)) continue;
    forceFlare(rt, 1);
  }
}

/**
 * The one place a flare is produced, so the ember's own chance and a scheduled
 * `ember_flare` world event cannot grow into two different behaviours (§21, §77).
 */
export function forceFlare(rt: EngineRuntime, strength: number, announce = true): void {
  const ember = rt.state.cigarette.ember;
  ember.flare = Math.max(ember.flare, clamp01(strength));
  emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: flareBurst(rt) });
  if (announce) {
    record(rt, SessionEventType.EMBER_FLARE, { brightness: round(ember.brightness + ember.flare) });
  }
}

export function tickEmber(rt: EngineRuntime, dtMs: number): void {
  const cigarette = rt.state.cigarette;
  const ember = cigarette.ember;
  const profile = rt.cigarette.emberProfile;
  const modifier = rt.environment.emberModifier;

  const target = emberTarget(rt);
  // Brightens quickly while drawing, cools slowly — the asymmetry is the whole feel (§59).
  const rate = target > ember.brightness ? 9 : 2.4;
  ember.brightness = clamp01(approach(ember.brightness, target, rate, dtMs) * modifier.brightness);

  tickFlare(rt, dtMs);

  const phase = rt.timers.wobblePhaseMs / 1000;
  ember.flicker = clamp(
    Math.sin(phase * 11.3) * 0.5 * profile.flicker +
      Math.sin(phase * 26.7 + 1.7) * 0.28 * profile.flicker +
      rt.rng.gaussian(0, profile.flicker * 0.3),
    -1,
    1,
  );

  const total = clamp01(ember.brightness + ember.flare * 0.45);
  ember.temperature = clamp01(0.4 + 0.6 * total);
  ember.glowRadius =
    lerp(EMBER.baselineGlow, EMBER.maxGlow, total) * (1 + cigarette.puff.intensity * 0.35);
  ember.lit = total >= THRESHOLDS.litBrightness;
}

/** Ignition is the one place the ember is lit before the state says it is (§11 LIGHTING). */
export function ignite(rt: EngineRuntime): void {
  const ember = rt.state.cigarette.ember;
  ember.brightness = Math.max(ember.brightness, 0.55);
  ember.flare = 0.8;
  ember.lit = true;
  const spark = sparkBurst(rt, 1);
  emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: spark });
  record(rt, SessionEventType.LIGHT, {
    cigaretteId: rt.cigarette.id,
    lighterId: rt.lighter.id,
    burnMsTotal: round(rt.state.cigarette.burnMsTotal),
  });
}

const round = (value: number): number => Math.round(value * 1000) / 1000;
