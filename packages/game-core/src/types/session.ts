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

/**
 * A break that is still running, written down so the app can be killed and come back to it.
 *
 * Deliberately *not* a replay. The cherry catches before §31's break begins, so the inputs that
 * picked the rod up are not part of the recording, and a replay from them cannot rebuild a
 * burning cigarette. What is honest here is the burn position itself — how much rod is left, how
 * much ash, when the cherry caught — restored, and the simulation carries on from there.
 */
export interface OpenBreak {
  /** The id this break will be recorded under when it ends. */
  id: string;
  seed: number;
  cigaretteId: string;
  environmentId: string;
  lighterId: string;
  ashtrayId: string;
  /** Wall clock, matching `Session.startedAt`. */
  startedAt: number;
  targetMs: number;
  /** Wall clock at the moment the cherry caught: the burn is measured from here. */
  litAtWallMs: number;
  /** 0..1 of the rod still unburnt, and the length of the ash column, when this was written. */
  rodRemaining: number;
  ashLength: number;
  emberLit: boolean;
  /** What the player had already done, so the finished record is not a lie. */
  events: SessionEvent[];
  triggers: string[];
  cravingBefore?: number;
  cravingAfter?: number;
  /** Wall clock of the last write, so a stale record can be recognised as one. */
  savedAtWallMs: number;
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
