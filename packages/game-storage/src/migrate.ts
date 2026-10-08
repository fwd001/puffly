/**
 * §51's schema ladder for the save file.
 *
 * An export is a artefact that outlives the build that wrote it, so importing must be
 * able to walk old files forward. Each step is a plain function over `unknown`: a step
 * that does not recognise its input passes it through untouched and lets `validateSaveFile`
 * produce the readable complaint (§63 — never throw on somebody's five-year-old file).
 */

import { SAVE_SCHEMA_VERSION, SessionEventType } from '@puffly/game-core';
import { isRecord, validateSaveFile, type SaveFileResult } from './validate';

/** One `from` -> `to` step. `upgrade` must be total: it may not throw. */
export interface SaveMigration {
  readonly from: number;
  readonly to: number;
  /** For developers and §74; never shown to a player (§63). */
  readonly describe: string;
  upgrade(value: unknown): unknown;
}

/**
 * The version 0 envelope, kept here as documentation of what a real old export looked
 * like. Two things about it matter: it stored §70 counters (`stats`), and its sessions
 * carried none of the §71 replay fields.
 */
export interface SaveFileShapeV0 {
  readonly version: 0;
  readonly app: string;
  readonly exportedAt: number;
  readonly profile: unknown;
  readonly settings: unknown;
  readonly progress: unknown;
  readonly sessions: readonly unknown[];
  /** Dropped by the 0 -> 1 step: §70 forbids storing derived numbers. */
  readonly stats: { totalPuffs: number; totalSessions: number; cravingsHandled: number };
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOr = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

/** §31's target event is the only thing that made a v0 session "completed". */
function targetReachedInV0Events(events: readonly unknown[]): boolean {
  for (const entry of events) {
    if (isRecord(entry) && entry['type'] === SessionEventType.SESSION_TARGET) return true;
  }
  return false;
}

function upgradeSessionV0(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const startedAt = numberOr(value['startedAt'], 0);
  const events = Array.isArray(value['events']) ? value['events'] : [];
  // v0 stored the duration as a number instead of an end timestamp.
  const durationMs =
    typeof value['durationMs'] === 'number' && Number.isFinite(value['durationMs'])
      ? value['durationMs']
      : null;
  const endedAt =
    typeof value['endedAt'] === 'number'
      ? value['endedAt']
      : durationMs === null
        ? null
        : startedAt + durationMs;
  // v0 kept one `craving` object; §68 wants the two optional numbers.
  const craving = isRecord(value['craving']) ? value['craving'] : null;

  const session: Record<string, unknown> = {
    id: value['id'],
    seed: numberOr(value['seed'], 0),
    cigaretteId: stringOr(value['cigaretteId'], 'default'),
    environmentId: stringOr(value['environmentId'], 'default'),
    lighterId: stringOr(value['lighterId'], 'default'),
    ashtrayId: stringOr(value['ashtrayId'], 'default'),
    startedAt,
    targetMs: numberOr(value['targetMs'], 180_000),
    timeOfDay: value['timeOfDay'],
    weather: value['weather'],
    events,
    engineStartWallClockMs: numberOr(value['engineStartWallClockMs'], startedAt),
    startedAtEngineMs: numberOr(value['startedAtEngineMs'], 0),
    inputs: Array.isArray(value['inputs']) ? value['inputs'] : [],
    triggers: Array.isArray(value['triggers']) ? value['triggers'] : [],
    // §70 again: "completed" is derived from the event log, not trusted from the file.
    completed:
      typeof value['completed'] === 'boolean'
        ? value['completed']
        : targetReachedInV0Events(events),
  };
  if (endedAt !== null) session['endedAt'] = endedAt;
  const before = craving === null ? value['cravingBefore'] : craving['before'];
  const after = craving === null ? value['cravingAfter'] : craving['after'];
  if (typeof before === 'number') session['cravingBefore'] = before;
  if (typeof after === 'number') session['cravingAfter'] = after;
  return session;
}

function upgradeProgressV0(value: unknown): unknown {
  const record = isRecord(value) ? value : {};
  const unlocked = record['unlocked'] ?? record['collection'];
  return {
    // §68 progress grew a `version` so a later build can tell what it is holding.
    version: 1,
    startedAt: record['startedAt'],
    dayNumber: record['dayNumber'],
    sessions: record['sessions'],
    puffs: record['puffs'],
    ashDropped: record['ashDropped'] ?? record['ashes'],
    // Nothing to convert: a save written before the tray had a mass simply has no figure, and the
    // reader treats that as "none weighed yet". Renaming anything here would be inventing a history.
    ashGrams: record['ashGrams'],
    longestStreakDays: record['longestStreakDays'] ?? record['streak'],
    unlocked,
    acknowledgedUnlocks: Array.isArray(record['acknowledgedUnlocks'])
      ? record['acknowledgedUnlocks']
      : [],
    lastActiveDayKey: stringOr(record['lastActiveDayKey'], stringOr(record['lastDay'], '')),
    activeDays: Array.isArray(record['activeDays']) ? record['activeDays'] : [],
  };
}

/**
 * version 0 -> 1 (§51).
 *
 * What actually changes: the stored `stats` counters are dropped (§70 says they must be
 * derived, and this is the version that stopped keeping them), sessions gain the §71
 * replay fields and §36's tag list, `progress` gains its own `version` plus
 * `acknowledgedUnlocks`, and §32's single `craving` object becomes two numbers.
 */
export const UPGRADE_V0_TO_V1: SaveMigration = {
  from: 0,
  to: 1,
  describe:
    'drop stored statistics counters, add §71 replay fields to sessions, version §37 progress',
  upgrade(value: unknown): unknown {
    if (!isRecord(value)) return value;
    return {
      version: 1,
      app: stringOr(value['app'], 'puffly'),
      exportedAt: numberOr(value['exportedAt'], 0),
      profile: value['profile'],
      settings: value['settings'],
      progress: upgradeProgressV0(value['progress']),
      sessions: Array.isArray(value['sessions'])
        ? value['sessions'].map(upgradeSessionV0)
        : value['sessions'],
      // `value.stats` is deliberately not carried over — see §70.
    };
  },
};

/** Every step this build knows, in ascending order. */
export const SAVE_MIGRATIONS: readonly SaveMigration[] = [UPGRADE_V0_TO_V1];

/** The version a parsed value claims, or null when it does not say. */
export function saveFileVersion(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const version = value['version'];
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : null;
}

export function migrationFor(
  from: number,
  migrations: readonly SaveMigration[] = SAVE_MIGRATIONS,
): SaveMigration | null {
  for (const migration of migrations) {
    if (migration.from === from) return migration;
  }
  return null;
}

/** Which versions this build can upgrade from, for an honest error message. */
export function supportedVersions(
  migrations: readonly SaveMigration[] = SAVE_MIGRATIONS,
): number[] {
  const versions = new Set<number>([SAVE_SCHEMA_VERSION]);
  for (const migration of migrations) {
    versions.add(migration.from);
    versions.add(migration.to);
  }
  return [...versions].sort((a, b) => a - b);
}

/**
 * Upgrade any known version to `SAVE_SCHEMA_VERSION`, then validate the result.
 * A file from a *newer* build is refused rather than silently downgraded.
 */
export function migrateSaveFile(
  value: unknown,
  migrations: readonly SaveMigration[] = SAVE_MIGRATIONS,
): SaveFileResult {
  if (!isRecord(value)) return { ok: false, errors: ['save: expected an object'] };
  const version = saveFileVersion(value);
  if (version === null) {
    return { ok: false, errors: ['save.version: expected an integer schema version'] };
  }
  if (version > SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `save.version: this build understands version ${String(SAVE_SCHEMA_VERSION)} at most, the file says ${String(version)} — update Puffly to import it`,
      ],
    };
  }

  let current: unknown = value;
  let from = version;
  while (from < SAVE_SCHEMA_VERSION) {
    const step = migrationFor(from, migrations);
    if (step === null) {
      return {
        ok: false,
        errors: [
          `save.version: no migration path from version ${String(from)}; this build can read ${supportedVersions(migrations).join(', ')}`,
        ],
      };
    }
    current = step.upgrade(current);
    from = step.to;
  }
  return validateSaveFile(current);
}

/** True when a parsed JSON value is at the version this build writes. */
export function isCurrentVersion(value: unknown): boolean {
  return saveFileVersion(value) === SAVE_SCHEMA_VERSION;
}
