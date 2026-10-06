/**
 * `@puffly/game-statistics` — the derivation layer, SPEC.md §33-36 and §70.
 *
 * Raw Session[] -> Statistics Aggregator -> Derived Statistics. There is deliberately
 * nothing to import here that *keeps* a number: no counters, no cache, no module state,
 * no storage. §70 forbids sprinkling `totalPuffs++` around, so every figure in this
 * package is recomputed from the session log each call, which also makes §72's tests
 * plain arithmetic.
 *
 * Platform-free by construction (§47): the shell passes `nowMs` and `utcOffsetMinutes`
 * in, so this package never reaches for a clock, a locale, `window`, or storage.
 */

export type {
  JourneyOptions,
  JourneyStop,
  JourneySymbol,
  Statistics,
  StatisticsOptions,
  TodayView,
  TriggerCount,
} from './types';
export { JOURNEY_TOKENS } from './types';
export type { JourneyToken } from './types';

export { deriveStatistics, earliestStart } from './statistics';
export {
  JOURNEY_EVENT_TYPES,
  MILESTONE_DAY_VALUES,
  deriveJourney,
  journeyGlyphs,
  journeyMilestones,
  milestoneDayFor,
} from './journey';
export { deriveTriggerBreakdown, dominantTrigger, triggerCounts } from './triggers';
export { deriveReduction } from './reduction';
export type { ReductionDay, ReductionView } from './reduction';
export {
  DAYLIGHT_TIME_OF_DAY,
  NIGHT_TIME_OF_DAY,
  SMOKE_EVENT_TYPES,
  deriveTodayView,
  sessionsOnDay,
} from './today';

/** Exposed for shells that want the same calendar maths the derivations use (§71). */
export { dayIndexOfKey, sessionDayKeys, sessionDurationMs, sessionWindow } from './log';
