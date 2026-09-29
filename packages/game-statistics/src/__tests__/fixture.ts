/**
 * Hand-built session log for the derivation tests. The numbers in here are chosen so the
 * expected statistics can be computed with pencil and paper (§72) — see
 * `EXPECTED` below, which is the arithmetic the tests assert against.
 *
 * All timestamps are January 2026 UTC and every test uses `utcOffsetMinutes: 0`, so a
 * day key is the calendar date you read off the timestamp.
 */

import {
  SessionEventType,
  type GameInput,
  type Progress,
  type Session,
  type SessionEvent,
  type TimeOfDayId,
  type WeatherId,
  CollectionCategory,
  type CollectionCategoryValue,
} from '@puffly/game-core';

/** `at(5, 9, 0)` = 2026-01-05T09:00:00Z. */
export function at(day: number, hour: number, minute = 0, second = 0): number {
  return Date.UTC(2026, 0, day, hour, minute, second);
}

export const DAY_MS = 86_400_000;

export interface EventSpec {
  readonly type: string;
  readonly at: number;
  readonly payload?: Record<string, unknown>;
}

export function ev(type: string, at: number, payload?: Record<string, unknown>): EventSpec {
  return payload === undefined ? { type, at } : { type, at, payload };
}

/** §69 ids are sequential and stable, so a diff of two runs reads cleanly. */
function withIds(specs: readonly EventSpec[]): SessionEvent[] {
  return specs.map((spec, index) => ({
    id: `evt-${index + 1}`,
    type: spec.type,
    timestamp: spec.at,
    ...(spec.payload === undefined ? {} : { payload: spec.payload }),
  }));
}

export interface SessionSeed {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly events?: readonly EventSpec[];
  readonly timeOfDay?: TimeOfDayId;
  readonly weather?: WeatherId;
  readonly targetMs?: number;
  readonly cravingBefore?: number;
  readonly cravingAfter?: number;
  readonly triggers?: readonly string[];
  readonly completed?: boolean;
  readonly seed?: number;
  readonly inputs?: readonly GameInput[];
}

export function makeSession(seed: SessionSeed): Session {
  const base = {
    id: seed.id,
    seed: seed.seed ?? 7,
    cigaretteId: 'test-rod',
    environmentId: 'test-room',
    lighterId: 'test-lighter',
    ashtrayId: 'test-tray',
    startedAt: seed.startedAt,
    targetMs: seed.targetMs ?? 180_000,
    timeOfDay: seed.timeOfDay ?? 'morning',
    weather: seed.weather ?? 'clear',
    events: withIds(seed.events ?? []),
    engineStartWallClockMs: seed.startedAt - 1_000,
    startedAtEngineMs: 0,
    inputs: [...(seed.inputs ?? [])],
    triggers: [...(seed.triggers ?? [])],
    completed: seed.completed ?? false,
  };
  return {
    ...base,
    ...(seed.endedAt === undefined ? {} : { endedAt: seed.endedAt }),
    ...(seed.cravingBefore === undefined ? {} : { cravingBefore: seed.cravingBefore }),
    ...(seed.cravingAfter === undefined ? {} : { cravingAfter: seed.cravingAfter }),
  };
}

/**
 * Five sessions, four active days, one of which is only reachable by crossing midnight.
 *
 *   ses-1  01-05 09:00 -> 09:05  300_000 ms  morning  puffs 3  target + craving 7->3
 *   ses-2  01-05 21:30 -> 21:36  360_000 ms  night    puffs 2  craving 5 (before only)
 *   ses-3  01-06 23:58 -> 00:04  360_000 ms  night    puffs 1  spans midnight -> 01-07
 *   ses-4  01-08 07:00 -> 07:30  1_800_000ms morning  puffs 4  craving 9->2, no target
 *   ses-5  01-08 21:00 -> 23:00  7_200_000ms night    puffs 0  craving 4 (before only)
 */
export function sampleSessions(): Session[] {
  return [
    makeSession({
      id: 'ses-1',
      startedAt: at(5, 9, 0),
      endedAt: at(5, 9, 5),
      timeOfDay: 'morning',
      completed: true,
      cravingBefore: 7,
      cravingAfter: 3,
      triggers: ['coffee'],
      events: [
        ev(SessionEventType.SESSION_START, at(5, 9, 0)),
        ev(SessionEventType.CRAVING, at(5, 9, 0), { level: 7, phase: 'before' }),
        ev(SessionEventType.LIGHT, at(5, 9, 0, 10)),
        ev(SessionEventType.PUFF, at(5, 9, 1), { intensity: 0.5, count: 1 }),
        ev(SessionEventType.PUFF, at(5, 9, 2), { intensity: 0.6, count: 2 }),
        ev(SessionEventType.PUFF, at(5, 9, 3), { intensity: 0.4, count: 3 }),
        ev(SessionEventType.EXTINGUISH, at(5, 9, 4)),
        ev(SessionEventType.CRAVING, at(5, 9, 4, 10), { level: 3, phase: 'after' }),
        ev(SessionEventType.SESSION_TARGET, at(5, 9, 5)),
        ev(SessionEventType.SESSION_END, at(5, 9, 5)),
      ],
    }),
    makeSession({
      id: 'ses-2',
      startedAt: at(5, 21, 30),
      endedAt: at(5, 21, 36),
      timeOfDay: 'night',
      weather: 'rain',
      cravingBefore: 5,
      triggers: ['night', 'work'],
      events: [
        ev(SessionEventType.SESSION_START, at(5, 21, 30)),
        ev(SessionEventType.PICK_UP, at(5, 21, 30, 5)),
        ev(SessionEventType.LIGHT, at(5, 21, 31)),
        ev(SessionEventType.PUFF, at(5, 21, 32), { intensity: 0.7, count: 1 }),
        ev(SessionEventType.PUFF, at(5, 21, 34), { intensity: 0.3, count: 2 }),
        ev(SessionEventType.CRAVING, at(5, 21, 35), { level: 5, phase: 'before' }),
        ev(SessionEventType.TRIGGER, at(5, 21, 35, 10), { tag: 'night' }),
        ev(SessionEventType.EXTINGUISH, at(5, 21, 36)),
        ev(SessionEventType.SESSION_END, at(5, 21, 36)),
      ],
    }),
    makeSession({
      id: 'ses-3',
      startedAt: at(6, 23, 58),
      endedAt: at(7, 0, 4),
      timeOfDay: 'night',
      weather: 'wind',
      triggers: ['drink'],
      events: [
        ev(SessionEventType.SESSION_START, at(6, 23, 58)),
        ev(SessionEventType.PICK_UP, at(6, 23, 58, 5)),
        ev(SessionEventType.PUFF, at(6, 23, 59), { intensity: 0.5, count: 1 }),
        ev(SessionEventType.WIND, at(7, 0, 0), { strength: 0.4 }),
        ev(SessionEventType.ASH_FALL, at(7, 0, 1)),
        ev(SessionEventType.EXTINGUISH, at(7, 0, 3)),
        ev(SessionEventType.SESSION_END, at(7, 0, 4)),
      ],
    }),
    makeSession({
      id: 'ses-4',
      startedAt: at(8, 7, 0),
      endedAt: at(8, 7, 30),
      timeOfDay: 'morning',
      cravingBefore: 9,
      cravingAfter: 2,
      triggers: ['coffee', 'meal'],
      events: [
        ev(SessionEventType.SESSION_START, at(8, 7, 0)),
        ev(SessionEventType.LIGHT, at(8, 7, 0, 20)),
        ev(SessionEventType.PUFF, at(8, 7, 5), { intensity: 0.8, count: 1 }),
        ev(SessionEventType.PUFF, at(8, 7, 10), { intensity: 0.5, count: 2 }),
        ev(SessionEventType.PUFF, at(8, 7, 15), { intensity: 0.6, count: 3 }),
        ev(SessionEventType.PUFF, at(8, 7, 20), { intensity: 0.4, count: 4 }),
        ev(SessionEventType.ASH, at(8, 7, 25)),
        ev(SessionEventType.EXTINGUISH, at(8, 7, 29)),
        ev(SessionEventType.CRAVING, at(8, 7, 29, 20), { level: 9, phase: 'before' }),
        ev(SessionEventType.CRAVING, at(8, 7, 29, 30), { level: 2, phase: 'after' }),
        ev(SessionEventType.TRIGGER, at(8, 7, 29, 40), { tag: 'meal' }),
        ev(SessionEventType.SESSION_END, at(8, 7, 30)),
      ],
    }),
    makeSession({
      id: 'ses-5',
      startedAt: at(8, 21, 0),
      endedAt: at(8, 23, 0),
      timeOfDay: 'night',
      weather: 'storm',
      cravingBefore: 4,
      triggers: ['drive'],
      events: [
        ev(SessionEventType.SESSION_START, at(8, 21, 0)),
        ev(SessionEventType.CRAVING, at(8, 21, 1), { level: 4, phase: 'before' }),
        ev(SessionEventType.SESSION_END, at(8, 23, 0)),
      ],
    }),
  ];
}

/** A log with a single interrupted session: no `endedAt`, so only its events date it. */
export function openEndedSessions(): Session[] {
  return [
    makeSession({
      id: 'ses-open',
      startedAt: at(9, 6, 0),
      // deliberately no endedAt: a tab closed or a crash
      timeOfDay: 'morning',
      events: [
        ev(SessionEventType.SESSION_START, at(9, 6, 0)),
        ev(SessionEventType.PUFF, at(9, 6, 1)),
        ev(SessionEventType.PUFF, at(9, 6, 2)),
      ],
    }),
  ];
}

function emptyUnlocked(): Record<CollectionCategoryValue, string[]> {
  return {
    [CollectionCategory.CIGARETTES]: [],
    [CollectionCategory.LIGHTERS]: [],
    [CollectionCategory.ENVIRONMENTS]: [],
    [CollectionCategory.ASHTRAYS]: [],
    [CollectionCategory.SMOKE]: [],
    [CollectionCategory.SOUNDS]: [],
  };
}

export function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1,
    startedAt: at(5, 0, 0),
    dayNumber: 4,
    sessions: 5,
    puffs: 10,
    ashDropped: 1,
    longestStreakDays: 4,
    unlocked: emptyUnlocked(),
    acknowledgedUnlocks: [],
    lastActiveDayKey: '2026-01-08',
    activeDays: ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'],
    ...overrides,
  };
}

/** Frozen so any write-back from a derivation would throw instead of silently passing. */
export function deepFreeze<T>(value: T): T {
  freezeDeep(value);
  return value;
}

function freezeDeep(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) freezeDeep(Reflect.get(value, key));
}
