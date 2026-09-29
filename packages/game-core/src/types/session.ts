/** §31-33, §71: what a session is, and what must be stored to replay it. */

import type { GameInput } from './input';
import type { SessionEvent } from './events';
import type { TimeOfDayId, WeatherId } from './content';

/** §32: one number on a slider, no questionnaire text. */
export const CRAVING_SCALE_MAX = 10;

export interface Session {
  id: string;
  /** Everything random descends from this (§71). */
  seed: number;
  cigaretteId: string;
  environmentId: string;
  lighterId: string;
  ashtrayId: string;
  startedAt: number;
  endedAt?: number;
  targetMs: number;
  timeOfDay: TimeOfDayId;
  weather: WeatherId;
  events: SessionEvent[];
  /**
   * Engine bookkeeping that makes §71 replay exact: a replay rebuilds the engine from
   * `engineStartWallClockMs` and `seed`, then feeds each input at its recorded
   * `GameInput.timestamp`, which is engine-clock milliseconds.
   */
  engineStartWallClockMs: number;
  startedAtEngineMs: number;
  inputs: GameInput[];
  cravingBefore?: number;
  cravingAfter?: number;
  /** §36: visual tag ids, empty when the player did not say. */
  triggers: string[];
  /** Set when the player let the countdown finish rather than walking away. */
  completed: boolean;
}

/** §36's visual tags — icon-only, so they need no translation (§5). */
export const TriggerTag = {
  COFFEE: 'coffee',
  DRINK: 'drink',
  WORK: 'work',
  ANGRY: 'angry',
  NIGHT: 'night',
  PEOPLE: 'people',
  DRIVE: 'drive',
  MEAL: 'meal',
} as const;

export type TriggerTagValue = (typeof TriggerTag)[keyof typeof TriggerTag];

export const TRIGGER_TAGS: readonly TriggerTagValue[] = Object.values(TriggerTag);
