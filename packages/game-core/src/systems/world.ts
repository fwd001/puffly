/**
 * Environment, time of day, weather and the random event system — SPEC.md §21-25.
 *
 * Three rules drive this file:
 *  - events are *scheduled by sampling*, never by a period (§81 (8));
 *  - most of them are so small the player does not register them as system events (§22);
 *  - the environment reaches smoke, ember and audio only as multipliers, so a new
 *    environment is data, not code (§23, §77).
 */

import { approach, clamp01, lerp, type Rng } from '@puffly/shared';
import { TIME_OF_DAY_HOURS, WORLD } from '../constants';
import { emit, record, setState } from '../emit';
import { isLit } from '../stateMachine';
import {
  SessionEventType,
  WorldEventId,
  WORLD_EVENT_IDS,
  type WorldEventIdValue,
  type WorldEventOccurrence,
  type WorldEventRule,
} from '../types/events';
import type {
  AmbientAudioSpec,
  Environment,
  LightingSpec,
  TimeOfDayId,
  WeatherId,
  WindSpec,
} from '../types/content';
import type { LightingField, WorldSnapshot } from '../types/state';
import { dropAsh, weatherMayTakeAsh } from './ash';
import { forceFlare } from './ember';
import { windGustBurst } from './emissions';
import type { EngineRuntime, WorldBoost } from '../runtime';

export const WORLD_EVENT_RULES: Record<WorldEventIdValue, WorldEventRule> = {
  [WorldEventId.WIND]: {
    id: WorldEventId.WIND,
    weight: 22,
    gapMs: { min: 5000, max: 15000 },
    durationMs: { min: 1800, max: 5200 },
    strength: { min: 0.3, max: 1 },
    states: ['LIGHTING', 'BURNING', 'PUFFING', 'RESTING', 'ASH_READY', 'NEAR_END', 'EXTINGUISHED'],
  },
  [WorldEventId.RAIN]: {
    id: WorldEventId.RAIN,
    weight: 9,
    gapMs: { min: 9000, max: 22000 },
    durationMs: { min: 6000, max: 16000 },
    strength: { min: 0.3, max: 0.9 },
    weathers: ['rain', 'storm'],
  },
  [WorldEventId.ASH_FALL]: {
    id: WorldEventId.ASH_FALL,
    weight: 11,
    gapMs: { min: 6000, max: 18000 },
    durationMs: { min: 1, max: 1 },
    strength: { min: 0.4, max: 1 },
    states: ['BURNING', 'PUFFING', 'RESTING', 'ASH_READY', 'NEAR_END'],
  },
  [WorldEventId.EMBER_FLARE]: {
    id: WorldEventId.EMBER_FLARE,
    weight: 13,
    gapMs: { min: 4000, max: 14000 },
    durationMs: { min: 1, max: 1 },
    strength: { min: 0.45, max: 1 },
    states: ['BURNING', 'PUFFING', 'RESTING', 'ASH_READY', 'NEAR_END'],
  },
  [WorldEventId.SMOKE_SWIRL]: {
    id: WorldEventId.SMOKE_SWIRL,
    weight: 12,
    gapMs: { min: 5000, max: 16000 },
    durationMs: { min: 1400, max: 4200 },
    strength: { min: 0.3, max: 0.9 },
    states: ['BURNING', 'PUFFING', 'RESTING', 'ASH_READY', 'NEAR_END', 'EXTINGUISHING'],
  },
  [WorldEventId.LIGHTER_FAILURE]: {
    id: WorldEventId.LIGHTER_FAILURE,
    /**
     * §21 lists this event, but a dead lighter is decided by `LighterContent.failureChance`
     * at the end of each ignition attempt (SPEC.md §12: behaviour comes from the object it
     * belongs to). Weight 0 keeps this rule from becoming a second, competing coin flip.
     */
    weight: 0,
    gapMs: { min: 1200, max: 3000 },
    durationMs: { min: 500, max: 1100 },
    strength: { min: 0.6, max: 1 },
    states: ['LIGHTING'],
  },
  [WorldEventId.ENVIRONMENT_NOISE]: {
    id: WorldEventId.ENVIRONMENT_NOISE,
    weight: 18,
    gapMs: { min: 6000, max: 20000 },
    durationMs: { min: 900, max: 3600 },
    strength: { min: 0.15, max: 0.6 },
  },
  [WorldEventId.LIGHT_CHANGE]: {
    id: WorldEventId.LIGHT_CHANGE,
    weight: 16,
    gapMs: { min: 5000, max: 19000 },
    durationMs: { min: 1200, max: 5200 },
    strength: { min: 0.15, max: 0.8 },
  },
  [WorldEventId.SHADOW_CHANGE]: {
    id: WorldEventId.SHADOW_CHANGE,
    weight: 14,
    gapMs: { min: 6000, max: 21000 },
    durationMs: { min: 1600, max: 6000 },
    strength: { min: 0.2, max: 0.9 },
  },
  [WorldEventId.AMBIENT_EVENT]: {
    id: WorldEventId.AMBIENT_EVENT,
    weight: 20,
    gapMs: { min: 4000, max: 15000 },
    durationMs: { min: 2200, max: 8000 },
    strength: { min: 0.1, max: 0.5 },
  },
};

const SESSION_TYPE_FOR: Record<WorldEventIdValue, string> = {
  [WorldEventId.WIND]: SessionEventType.WIND,
  [WorldEventId.RAIN]: SessionEventType.RAIN,
  [WorldEventId.ASH_FALL]: SessionEventType.ASH_FALL,
  [WorldEventId.EMBER_FLARE]: SessionEventType.EMBER_FLARE,
  [WorldEventId.SMOKE_SWIRL]: SessionEventType.SMOKE_SWIRL,
  [WorldEventId.LIGHTER_FAILURE]: SessionEventType.LIGHT_FAIL,
  [WorldEventId.ENVIRONMENT_NOISE]: SessionEventType.ENVIRONMENT_NOISE,
  [WorldEventId.LIGHT_CHANGE]: SessionEventType.LIGHT_CHANGE,
  [WorldEventId.SHADOW_CHANGE]: SessionEventType.SHADOW_CHANGE,
  [WorldEventId.AMBIENT_EVENT]: SessionEventType.AMBIENT_EVENT,
};

export function timeOfDayForHour(hour: number): TimeOfDayId {
  for (const [id, range] of Object.entries(TIME_OF_DAY_HOURS) as [
    TimeOfDayId,
    (typeof TIME_OF_DAY_HOURS)[TimeOfDayId],
  ][]) {
    if (hour >= range.min && hour < range.max) return id;
  }
  return 'night';
}

export function sampleWeather(environment: Environment, rng: Rng): WeatherId {
  const entries = Object.entries(environment.weather.bias) as [WeatherId, number][];
  if (entries.length === 0) return 'clear';
  const picked = rng.weighted(entries.map(([value, weight]) => ({ value, weight })));
  return picked ?? 'clear';
}

/** Environment plus this moment's time-of-day override — resolved once per tick group. */
export function resolveLighting(environment: Environment, timeOfDay: TimeOfDayId): LightingSpec {
  return { ...environment.lighting, ...environment.timeVariants?.[timeOfDay]?.lighting };
}

export function resolveWind(environment: Environment, timeOfDay: TimeOfDayId): WindSpec {
  return { ...environment.wind, ...environment.timeVariants?.[timeOfDay]?.wind };
}

export function resolveAmbient(environment: Environment, timeOfDay: TimeOfDayId): AmbientAudioSpec {
  return { ...environment.ambientAudio, ...environment.timeVariants?.[timeOfDay]?.ambientAudio };
}

export function weatherBiasFor(environment: Environment, timeOfDay: TimeOfDayId) {
  return environment.timeVariants?.[timeOfDay]?.weatherBias ?? environment.weather.bias;
}

export function createWorldState(
  environment: Environment,
  timeOfDay: TimeOfDayId,
  weather: WeatherId,
): WorldSnapshot {
  const lighting = resolveLighting(environment, timeOfDay);
  const wind = resolveWind(environment, timeOfDay);
  const scale =
    weather === 'storm' ? environment.weather.stormWindScale : weather === 'wind' ? 1.4 : 1;
  return {
    environmentId: environment.id,
    timeOfDay,
    weather,
    wind: wind.base * scale,
    windDirectionDeg: wind.directionDeg,
    light: {
      ambient: lighting.ambient,
      warmth: lighting.warmth,
      keyDirectionDeg: lighting.keyDirectionDeg,
      contrast: lighting.contrast,
      smokeVisibility: lighting.smokeVisibility,
      flash: 0,
    },
    shadow: 0,
    ambientGain: resolveAmbient(environment, timeOfDay).gain,
    activeEvents: [],
  };
}

/** The pool is cigarette ∪ environment; weights and guards come from the core rules. */
export function eventPool(rt: EngineRuntime): WorldEventRule[] {
  const ids = new Set<string>([...rt.cigarette.eventPool, ...rt.environment.eventPool]);
  const rules: WorldEventRule[] = [];
  for (const id of WORLD_EVENT_IDS) {
    if (!ids.has(id)) continue;
    rules.push(WORLD_EVENT_RULES[id]);
  }
  return rules;
}

function matches(rule: WorldEventRule, rt: EngineRuntime): boolean {
  const state = rt.state.cigarette.state;
  if (rule.states && !rule.states.includes(state)) return false;
  if (rule.weathers && !rule.weathers.includes(rt.state.world.weather)) return false;
  if (rule.times && !rule.times.includes(rt.state.world.timeOfDay)) return false;
  if (rule.id === WorldEventId.ASH_FALL && rt.state.cigarette.ash.length <= 0) return false;
  // A gust takes a column that is already too long to be sure of standing — the same line that
  // lights ASH_READY. Short ash survives a draught; that is what makes it stand at all. Before this,
  // the event could fire on a column of a few millimetres every 6–18 seconds, and once the deck's own
  // durations were in (a 10-minute rod) the player could never out-run it: 磕灰 stopped being
  // reachable. See `weatherMayTakeAsh` for the other half — the rod's last column is never taken.
  if (rule.id === WorldEventId.ASH_FALL && !rt.state.cigarette.ash.ready) return false;
  // A gust may take the column, but not the rod's last chance at one: see `weatherMayTakeAsh`.
  if (rule.id === WorldEventId.ASH_FALL && !weatherMayTakeAsh(rt)) return false;
  return true;
}

/** Envelope: in and out smoothly, so a gust does not switch on like a light (§59). */
function envelope(occurrence: WorldEventOccurrence, nowMs: number): number {
  const span = Math.max(1, occurrence.endsAtMs - occurrence.startedAtMs);
  const t = clamp01((nowMs - occurrence.startedAtMs) / span);
  return Math.sin(Math.PI * t) * occurrence.strength;
}

/**
 * The single presentation of "the lighter did not catch". Reached either by the
 * lighter's own `failureChance` (engine) or, if content ever pools it, by the event
 * system — one mechanic, one place.
 */
export function failIgnition(rt: EngineRuntime, announce: boolean): void {
  rt.state.lighter.sputter = 1;
  rt.state.lighter.engaged = false;
  rt.state.lighter.flame = 0;
  rt.timers.ignitionMs = 0;
  rt.timers.lighterAutoHold = false;
  setState(rt, 'PICKED_UP');
  if (announce) {
    record(rt, SessionEventType.LIGHT_FAIL, {
      attempts: rt.timers.lighterAttempts,
      source: 'ignition-chance',
    });
  }
}

function applyStart(rt: EngineRuntime, occurrence: WorldEventOccurrence): void {
  switch (occurrence.type) {
    case WorldEventId.ASH_FALL:
      dropAsh(rt, 'event', false);
      break;
    case WorldEventId.EMBER_FLARE:
      forceFlare(rt, occurrence.strength, false);
      break;
    case WorldEventId.WIND:
      emit(rt, {
        kind: 'burst',
        atMs: rt.state.nowMs,
        burst: windGustBurst(rt, occurrence.strength),
      });
      break;
    case WorldEventId.LIGHTER_FAILURE:
      // The flame dies, the draw never catches, and the player simply tries again (§21).
      failIgnition(rt, false);
      break;
    default:
      break;
  }
}

function fireWorldEvent(rt: EngineRuntime, gapScale: number): void {
  const pool = eventPool(rt).filter((rule) => matches(rule, rt));
  if (pool.length === 0) {
    rt.timers.nextWorldEventMs = rt.state.nowMs + rt.rng.range(1200, 3000);
    return;
  }
  const rule = rt.rng.weighted(pool.map((value) => ({ value, weight: value.weight })));
  if (!rule) return;

  const occurrence: WorldEventOccurrence = {
    id: rt.ids.next('world'),
    type: rule.id,
    startedAtMs: rt.state.nowMs,
    endsAtMs: rt.state.nowMs + rt.rng.range(rule.durationMs.min, rule.durationMs.max),
    strength: rt.rng.range(rule.strength.min, rule.strength.max),
    at: { ...rt.state.cigarette.pose.tip },
  };
  rt.activeEvents.push(occurrence);
  if (rt.activeEvents.length > WORLD.maxActive) rt.activeEvents.shift();

  emit(rt, { kind: 'world', atMs: rt.state.nowMs, occurrence });
  record(rt, SESSION_TYPE_FOR[rule.id], {
    strength: Math.round(occurrence.strength * 100) / 100,
    durationMs: Math.round(occurrence.endsAtMs - occurrence.startedAtMs),
  });
  applyStart(rt, occurrence);

  const gap = rt.rng.range(WORLD.defaultGap.min, WORLD.defaultGap.max) * gapScale;
  rt.timers.nextWorldEventMs = rt.state.nowMs + gap;
}

/**
 * How much of the room's light a full shadow takes away. Exported because the claim "a passing
 * shadow is visible" has to be measured against this number rather than a copy of it.
 */
export const SHADOW_SHARE = 0.7;

export function tickWorld(rt: EngineRuntime, dtMs: number): void {
  const now = rt.state.nowMs;
  const world = rt.state.world;
  const boost: WorldBoost = { wind: 0, turbulence: 0, flash: 0, shadow: 0, ambient: 0, rain: 0 };

  rt.activeEvents = rt.activeEvents.filter((occurrence) => occurrence.endsAtMs > now);
  world.activeEvents = rt.activeEvents;

  for (const occurrence of rt.activeEvents) {
    const value = envelope(occurrence, now);
    switch (occurrence.type) {
      case WorldEventId.WIND:
        boost.wind += value;
        break;
      case WorldEventId.RAIN:
        boost.rain += value;
        boost.ambient += value * 0.5;
        break;
      case WorldEventId.SMOKE_SWIRL:
        boost.turbulence += value * 1.5;
        break;
      case WorldEventId.LIGHT_CHANGE:
        boost.flash += value;
        break;
      case WorldEventId.SHADOW_CHANGE:
        boost.shadow += value;
        break;
      case WorldEventId.ENVIRONMENT_NOISE:
        boost.ambient += value;
        break;
      case WorldEventId.AMBIENT_EVENT:
        boost.ambient += value * 0.6;
        boost.flash += value * 0.2;
        break;
      default:
        break;
    }
  }
  rt.worldBoost = boost;

  const environment = rt.environment;
  const wind = resolveWind(environment, world.timeOfDay);
  const lighting = resolveLighting(environment, world.timeOfDay);
  const weatherScale =
    world.weather === 'storm'
      ? environment.weather.stormWindScale
      : world.weather === 'wind'
        ? 1.4
        : 1;

  // The sample is taken every frame — the replay's numbers must not change — but the wind only
  // follows it slowly. Rolled straight into `world.wind` and the bearing at 60 Hz, this was the
  // shiver the whole background had: the drift vector leaned one way and then the other with no
  // weather behind it, so nothing on screen was ever at rest.
  const gustSample = rt.rng.range(-wind.variance, wind.variance) * 0.4;
  rt.windGust = approach(rt.windGust, gustSample, 0.45, dtMs);
  world.wind = Math.max(
    0,
    wind.base * weatherScale * (1 + boost.wind * 1.8) + rt.windGust + boost.wind * 0.25,
  );
  // A gust also swings the bearing a little, which is what makes smoke feel pushed.
  world.windDirectionDeg =
    wind.directionDeg + boost.wind * 24 * (boost.wind > 0.6 ? 1 : 0.4) + rt.windGust * 8;

  const light: LightingField = world.light;
  const rainDarkening = clamp01(boost.rain) * 0.14;
  world.shadow = clamp01(boost.shadow);
  // A shadow passing outside is the same kind of fact as rain: it takes light away. It folds into
  // `ambient` here rather than becoming a ninth place the renderer must remember to darken — every
  // one of the eight readers of `light.ambient` (sky, windows, floor pool, bokeh, the props' key
  // light, the dust) dims together, which is what a shadow is. Nothing downstream may subtract
  // `world.shadow` again.
  light.ambient = clamp01(
    lerp(lighting.ambient, lighting.ambient * 0.72, clamp01(boost.rain)) *
      (1 - world.shadow * SHADOW_SHARE),
  );
  light.warmth = lighting.warmth;
  light.keyDirectionDeg = lighting.keyDirectionDeg;
  light.contrast = lighting.contrast;
  light.smokeVisibility = lighting.smokeVisibility;
  light.flash = clamp01(boost.flash * 0.35 - rainDarkening);
  world.ambientGain = clamp01(
    resolveAmbient(environment, world.timeOfDay).gain * (1 + boost.ambient * 0.8) -
      (isLit(rt.state.cigarette.state) ? 0 : 0.05),
  );

  if (now >= rt.timers.nextWorldEventMs) {
    fireWorldEvent(rt, 1);
  }
}
