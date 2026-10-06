/**
 * Fixtures for the storage tests. The session shape is written by hand rather than
 * produced by the engine, so a test can say exactly which record came from where.
 */

import {
  SessionEventType,
  createDefaultSettings,
  type OpenBreak,
  type Progress,
  type SaveFile,
  type Session,
  type SessionEvent,
  type Settings,
  type UserProfile,
} from '@puffly/game-core';

/** `at(5, 9, 0)` = 2026-01-05T09:00:00Z. */
export function at(day: number, hour: number, minute = 0, second = 0): number {
  return Date.UTC(2026, 0, day, hour, minute, second);
}

export interface EventSeed {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly payload?: Record<string, unknown>;
}

export function makeEvent(seed: EventSeed): SessionEvent {
  return {
    id: seed.id,
    type: seed.type,
    timestamp: seed.timestamp,
    ...(seed.payload === undefined ? {} : { payload: seed.payload }),
  };
}

export interface SessionSeed {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly puffs?: number;
  readonly cravingBefore?: number;
  readonly cravingAfter?: number;
  readonly triggers?: readonly string[];
  readonly targetReached?: boolean;
  readonly timeOfDay?: Session['timeOfDay'];
  readonly completed?: boolean;
  readonly seed?: number;
}

export function makeSession(seed: SessionSeed): Session {
  const puffs = seed.puffs ?? 0;
  const events: SessionEvent[] = [
    makeEvent({
      id: `${seed.id}-e1`,
      type: SessionEventType.SESSION_START,
      timestamp: seed.startedAt,
    }),
  ];
  let index = 2;
  if (puffs > 0)
    events.push(
      makeEvent({
        id: `${seed.id}-e${String(index)}`,
        type: SessionEventType.LIGHT,
        timestamp: seed.startedAt + 1_000,
      }),
    );
  index += 1;
  for (let puff = 0; puff < puffs; puff += 1) {
    events.push(
      makeEvent({
        id: `${seed.id}-e${String(index)}`,
        type: SessionEventType.PUFF,
        timestamp: seed.startedAt + (puff + 1) * 10_000,
        payload: { intensity: 0.5, count: puff + 1 },
      }),
    );
    index += 1;
  }
  if (seed.targetReached === true) {
    events.push(
      makeEvent({
        id: `${seed.id}-e${String(index)}`,
        type: SessionEventType.SESSION_TARGET,
        timestamp: seed.startedAt + 60_000,
      }),
    );
    index += 1;
  }
  const endedAt = seed.endedAt ?? seed.startedAt + 60_000;
  events.push(
    makeEvent({
      id: `${seed.id}-e${String(index)}`,
      type: SessionEventType.SESSION_END,
      timestamp: endedAt,
    }),
  );

  const session: Session = {
    id: seed.id,
    seed: seed.seed ?? 42,
    cigaretteId: 'test-rod',
    environmentId: 'test-room',
    lighterId: 'test-lighter',
    ashtrayId: 'test-tray',
    startedAt: seed.startedAt,
    endedAt,
    targetMs: 180_000,
    timeOfDay: seed.timeOfDay ?? 'morning',
    weather: 'clear',
    events,
    engineStartWallClockMs: seed.startedAt - 2_000,
    startedAtEngineMs: 0,
    inputs: [
      { type: 'tap', x: 0.5, y: 0.42, timestamp: 120, source: 'pointer', target: 'cigarette' },
      {
        type: 'hold',
        x: 0.51,
        y: 0.44,
        timestamp: 900,
        target: 'ember',
        velocity: { vx: 0.01, vy: -0.02 },
      },
      { type: 'release', x: 0.51, y: 0.44, timestamp: 1_400 },
    ],
    triggers: [...(seed.triggers ?? [])],
    completed: seed.completed ?? seed.targetReached === true,
  };
  if (seed.cravingBefore !== undefined) session.cravingBefore = seed.cravingBefore;
  if (seed.cravingAfter !== undefined) session.cravingAfter = seed.cravingAfter;
  return session;
}

/** Four sessions: short, long, midnight-crossing and one with nothing but a start. */
export function sampleSessions(): Session[] {
  return [
    makeSession({
      id: 'ses-a',
      startedAt: at(5, 9, 0),
      endedAt: at(5, 9, 5),
      puffs: 3,
      cravingBefore: 8,
      cravingAfter: 3,
      triggers: ['coffee'],
      targetReached: true,
    }),
    makeSession({
      id: 'ses-b',
      startedAt: at(5, 22, 0),
      endedAt: at(5, 22, 12),
      puffs: 2,
      cravingBefore: 5,
      triggers: ['night', 'work'],
      timeOfDay: 'night',
    }),
    makeSession({
      id: 'ses-c',
      startedAt: at(6, 23, 55),
      endedAt: at(7, 0, 3),
      puffs: 4,
      cravingBefore: 6,
      cravingAfter: 1,
      triggers: ['drink'],
      timeOfDay: 'night',
      seed: 1_001,
    }),
    makeSession({
      id: 'ses-d',
      startedAt: at(8, 7, 30),
      endedAt: at(8, 7, 31),
      puffs: 0,
      triggers: [],
    }),
  ];
}

export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { id: 'pro-local-1', createdAt: at(1, 8, 0), ...overrides };
}

export function makeSettings(nowMs = at(5, 9, 0)): Settings {
  return { ...createDefaultSettings(nowMs), utcOffsetMinutes: 0, volume: 0.4 };
}

/**
 * Settings the way a player actually leaves them: an anchor set, something in the hand, and a
 * language asked for. The three fields a store loses silently, because each of the two
 * adapters rebuilds `Settings` from a list of keys someone typed out.
 */
export function makeChosenSettings(nowMs = at(5, 9, 0)): Settings {
  return {
    ...makeSettings(nowMs),
    quitAnchorTimestamp: at(1, 8, 0),
    selection: {
      cigarette: 'long-thin',
      environment: 'balcony',
      lighter: 'wheel',
      ashtray: 'stone',
    },
    language: 'zh-CN',
    skin: 'copper',
    dailyLimitSticks: 12,
  };
}

export function makeOpenBreak(overrides: Partial<OpenBreak> = {}): OpenBreak {
  return {
    id: 'ses-open',
    seed: 4242,
    cigaretteId: 'classic',
    environmentId: 'balcony',
    lighterId: 'wheel',
    ashtrayId: 'stone',
    startedAt: at(5, 21, 4),
    targetMs: 180_000,
    litAtWallMs: at(5, 21, 4),
    rodRemaining: 0.62,
    ashLength: 0.014,
    emberLit: true,
    events: [],
    triggers: ['work'],
    savedAtWallMs: at(5, 21, 40),
    ...overrides,
  };
}

export function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1,
    startedAt: at(5, 9, 0),
    dayNumber: 4,
    sessions: 4,
    puffs: 9,
    ashDropped: 2,
    longestStreakDays: 3,
    unlocked: {
      cigarettes: ['test-rod'],
      lighters: ['test-lighter'],
      environments: ['test-room'],
      ashtrays: ['test-tray'],
      smoke: [],
      sounds: [],
    },
    acknowledgedUnlocks: ['cigarettes:test-rod'],
    collectedPacks: ['box-a', 'box-b'],
    lastActiveDayKey: '2026-01-08',
    activeDays: ['2026-01-05', '2026-01-06', '2026-01-08'],
    ...overrides,
  };
}

export function makeSave(overrides: Partial<SaveFile> = {}): SaveFile {
  return {
    version: 1,
    app: 'puffly',
    exportedAt: at(8, 12, 0),
    profile: makeProfile(),
    settings: makeSettings(),
    progress: makeProgress(),
    sessions: sampleSessions(),
    ...overrides,
  };
}

/**
 * A synthetic version 0 export (§51), written the way the first build did it: stored
 * §70 counters at the top level, `progress` without a version, and sessions with no §71
 * replay fields — a `durationMs` and a single `craving` object instead.
 */
export function saveFileV0(): Record<string, unknown> {
  return {
    version: 0,
    app: 'puffly',
    exportedAt: at(3, 18, 0),
    profile: { id: 'pro-legacy', createdAt: at(1, 8, 0), displayName: 'Legacy' },
    settings: {
      volume: 0.5,
      ambientVolume: 0.2,
      muted: true,
      reducedMotion: true,
      contrast: 'high',
      textScale: 1.25,
      quality: 'light',
      sessionTargetMs: 240_000,
      showClock: false,
      utcOffsetMinutes: -120,
      haptics: false,
    },
    progress: {
      startedAt: at(2, 20, 0),
      dayNumber: 2,
      sessions: 2,
      puffs: 5,
      ashes: 1,
      streak: 2,
      collection: {
        cigarettes: ['test-rod'],
        lighters: [],
        environments: [],
        ashtrays: [],
        smoke: [],
        sounds: [],
      },
      lastDay: '2026-01-03',
      activeDays: ['2026-01-02', '2026-01-03'],
    },
    sessions: [
      {
        id: 'ses-legacy-1',
        seed: 9,
        cigaretteId: 'test-rod',
        environmentId: 'test-room',
        lighterId: 'test-lighter',
        ashtrayId: 'test-tray',
        startedAt: at(2, 20, 0),
        durationMs: 90_000,
        targetMs: 180_000,
        timeOfDay: 'night',
        weather: 'clear',
        events: [
          { id: 'l-1', type: SessionEventType.SESSION_START, timestamp: at(2, 20, 0) },
          { id: 'l-2', type: SessionEventType.PUFF, timestamp: at(2, 20, 30) },
          { id: 'l-3', type: SessionEventType.SESSION_TARGET, timestamp: at(2, 20, 90) },
        ],
        craving: { before: 7, after: 2 },
      },
      {
        id: 'ses-legacy-2',
        seed: 10,
        cigaretteId: 'test-rod',
        environmentId: 'test-street',
        lighterId: 'test-lighter',
        ashtrayId: 'test-tray',
        startedAt: at(3, 12, 0),
        durationMs: 30_000,
        targetMs: 180_000,
        timeOfDay: 'afternoon',
        weather: 'rain',
        events: [
          { id: 'l-4', type: SessionEventType.SESSION_START, timestamp: at(3, 12, 0) },
          { id: 'l-5', type: SessionEventType.PUFF, timestamp: at(3, 12, 10) },
        ],
      },
    ],
    stats: { totalPuffs: 2, totalSessions: 2, cravingsHandled: 1 },
  };
}

export function saveFileV0Valid(): Record<string, unknown> {
  const legacy = saveFileV0();
  const sessions = legacy['sessions'];
  if (Array.isArray(sessions)) {
    for (const entry of sessions) {
      if (entry !== null && typeof entry === 'object')
        (entry as Record<string, unknown>)['timeOfDay'] = 'afternoon';
    }
  }
  return legacy;
}

export const NOT_JSON = '{ "version": 1, "app": puffly,,, }';
export const JSON_BUT_NOT_A_SAVE = '[1, 2, 3]';

/**
 * The same save as untyped JSON, for tests that need to hand the validator something no
 * `SaveFile` could ever be (§63: hostile input must come back as errors, not a throw).
 */
export function rawSave(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const value: Record<string, unknown> = JSON.parse(JSON.stringify(makeSave()));
  return { ...value, ...overrides };
}
