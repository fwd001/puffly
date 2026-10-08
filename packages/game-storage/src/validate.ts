/**
 * The §51 validator: JSON in, a trustworthy `SaveFile` out — or a list of readable
 * problems. It is strict about what it accepts and total about what it reports, and it
 * never throws, whatever string arrives (§63: an import that explodes on hostile input is
 * a data-loss bug waiting to happen).
 *
 * Readers return `null` when they could not build a value and push one message shaped
 * `path: expectation`, e.g. `sessions[1].cravingBefore: expected an integer 0-10`.
 */

import {
  CRAVING_SCALE_MAX,
  CollectionCategory,
  SAVE_SCHEMA_VERSION,
  type CollectionCategoryValue,
  type ContrastMode,
  type GameInput,
  type InputSource,
  type InputTarget,
  type InputType,
  type Progress,
  type QualityMode,
  type ScenePalette,
  type SaveFile,
  type Selection,
  type Session,
  type SessionEvent,
  type Settings,
  type TimeOfDayId,
  type UserProfile,
  type WeatherId,
} from '@puffly/game-core';
import { copyPayload } from './clone';
import type { Rgb } from '@puffly/shared';

export type SaveFileResult = { ok: true; save: SaveFile } | { ok: false; errors: string[] };

/** Enough detail to fix an import, small enough to show without a scroll bar. */
export const MAX_REPORTED_ISSUES = 40;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const TIME_OF_DAY_VALUES: readonly TimeOfDayId[] = [
  'morning',
  'afternoon',
  'sunset',
  'night',
  'late-night',
];
const WEATHER_VALUES: readonly WeatherId[] = ['clear', 'cloudy', 'rain', 'wind', 'storm'];
const INPUT_TYPES: readonly InputType[] = ['tap', 'hold', 'release', 'drag', 'swipe', 'pinch'];
const INPUT_SOURCES: readonly InputSource[] = ['pointer', 'touch', 'mouse', 'keyboard', 'shortcut'];
const INPUT_TARGETS: readonly InputTarget[] = [
  'cigarette',
  'ember',
  'ash',
  'lighter',
  'ashtray',
  'stage',
];
const QUALITY_MODES: readonly QualityMode[] = ['auto', 'high', 'balanced', 'light'];
const CONTRAST_MODES: readonly ContrastMode[] = ['normal', 'high'];

/** The messages a reader appended; `path: expectation` per problem (§51). */
export type ValidationErrors = string[];

function fail(errors: ValidationErrors, path: string, expectation: string): void {
  if (errors.length < MAX_REPORTED_ISSUES * 2) errors.push(`${path}: ${expectation}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(
  value: unknown,
  path: string,
  errors: ValidationErrors,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    fail(errors, path, 'expected an object');
    return null;
  }
  return value;
}

function requireString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): string | null {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail(errors, `${path}.${key}`, 'expected a non-empty string');
    return null;
  }
  return value;
}

function requireNumber(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): number | null {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(errors, `${path}.${key}`, 'expected a finite number');
    return null;
  }
  return value;
}

function requireInteger(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): number | null {
  const value = requireNumber(source, key, path, errors);
  if (value === null) return null;
  if (!Number.isInteger(value)) {
    fail(errors, `${path}.${key}`, 'expected a whole number');
    return null;
  }
  return value;
}

function requireRange(
  source: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  path: string,
  errors: ValidationErrors,
): number | null {
  const value = requireNumber(source, key, path, errors);
  if (value === null) return null;
  if (value < min || value > max) {
    fail(errors, `${path}.${key}`, `expected ${min}-${max}, got ${value}`);
    return null;
  }
  return value;
}

function requireBoolean(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): boolean | null {
  const value = source[key];
  if (typeof value !== 'boolean') {
    fail(errors, `${path}.${key}`, 'expected true or false');
    return null;
  }
  return value;
}

/**
 * A field that did not exist when the save was written: absent reads as `fallback` rather than
 * throwing the whole settings record away.
 */
function booleanWithDefault(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean,
  path: string,
  errors: ValidationErrors,
): boolean {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    fail(errors, `${path}.${key}`, 'expected true or false');
    return fallback;
  }
  return value;
}

/**
 * One of the deck's 0..1 knobs (`haptics`, `realism`), read the same way whatever key it lives
 * under: an absent field means that key's own default, a boolean is the legacy shape (S23 wrote
 * true/false before it wrote a number) and comes back as 1 or 0 so the player keeps the feedback
 * they had, a number out of range is clamped *and* named, and anything else falls back to that
 * default rather than discarding the whole settings record over one lying field.
 *
 * Both knobs go through here on purpose. Two near-identical readers is how one of them ends up
 * accepting a string the other rejects.
 */
function readLevel(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  path: string,
  errors: ValidationErrors,
): number {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 1) fail(errors, `${path}.${key}`, 'expected a level between 0 and 1');
    return Math.min(1, Math.max(0, value));
  }
  fail(errors, `${path}.${key}`, 'expected 0..1, true or false');
  return fallback;
}

/**
 * The player's own room colours, or `null` for "use the place's". Each of the four is a 0..255
 * triple; one malformed layer drops the whole palette rather than painting three quarters of a
 * sky, because half an override is a scene that looks broken and not like a choice.
 */
function readScenePalette(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): ScenePalette | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail(errors, `${path}.${key}`, 'expected an object of four colours, or null');
    return null;
  }
  const record = value as Record<string, unknown>;
  const layer = (name: keyof ScenePalette): Rgb | null => {
    const raw = record[name];
    if (!Array.isArray(raw) || raw.length !== 3) {
      fail(errors, `${path}.${key}.${name}`, 'expected [red, green, blue]');
      return null;
    }
    const parts = raw.map((part) =>
      typeof part === 'number' && Number.isFinite(part)
        ? Math.round(Math.min(255, Math.max(0, part)))
        : -1,
    );
    if (parts.some((part) => part < 0)) {
      fail(errors, `${path}.${key}.${name}`, 'expected three numbers from 0 to 255');
      return null;
    }
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] as Rgb;
  };
  const skyTop = layer('skyTop');
  const skyBottom = layer('skyBottom');
  const horizon = layer('horizon');
  const silhouette = layer('silhouette');
  if (!skyTop || !skyBottom || !horizon || !silhouette) return null;
  return { skyTop, skyBottom, horizon, silhouette };
}

/**
 * The four ids the cabinet writes, or nothing at all. A half-written selection is reported
 * rather than kept: a rod with no ashtray is not a preference anyone chose.
 */
function optionalSelection(
  source: Record<string, unknown>,
  path: string,
  errors: ValidationErrors,
): Selection | undefined {
  const value: unknown = source['selection'];
  if (value === undefined) return undefined;
  const record = requireRecord(value, `${path}.selection`, errors);
  if (record === null) return undefined;
  const at = `${path}.selection`;
  const cigarette = requireString(record, 'cigarette', at, errors);
  const environment = requireString(record, 'environment', at, errors);
  const lighter = requireString(record, 'lighter', at, errors);
  const ashtray = requireString(record, 'ashtray', at, errors);
  if (cigarette === null || environment === null || lighter === null || ashtray === null) {
    return undefined;
  }
  return { cigarette, environment, lighter, ashtray };
}

/**
 * A language tag, or the literal `icons`. Deliberately not checked against a list: which
 * languages exist is the shell's copy table, and an unreadable value simply means "ask the
 * device" there. Long enough for a tag, short enough that nonsense cannot fill a save.
 */
const MAX_LANGUAGE_LENGTH = 20;

/** One short, non-empty token: a language tag, a skin id, nothing longer than an id could be. */
function optionalToken(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): string | undefined {
  const value: unknown = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LANGUAGE_LENGTH) {
    fail(errors, `${path}.${key}`, 'expected a short token or nothing at all');
    return undefined;
  }
  return value;
}

function requireOneOf<K extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly K[],
  path: string,
  errors: ValidationErrors,
): K | null {
  return pickOneOf(source[key], allowed, `${path}.${key}`, errors);
}
function pickOneOf<K extends string>(
  value: unknown,
  allowed: readonly K[],
  path: string,
  errors: ValidationErrors,
): K | null {
  for (const candidate of allowed) {
    if (candidate === value) return candidate;
  }
  fail(errors, path, `expected one of ${allowed.map((entry) => `"${entry}"`).join(', ')}`);
  return null;
}

/** Keep at most `MAX_REPORTED_ISSUES` messages, then say how many were left out. */
function report(errors: ValidationErrors): string[] {
  if (errors.length <= MAX_REPORTED_ISSUES) return errors;
  const head = errors.slice(0, MAX_REPORTED_ISSUES);
  head.push(`… and ${String(errors.length - MAX_REPORTED_ISSUES)} more problem(s)`);
  return head;
}

/** Absent or `undefined` is fine; anything else must satisfy `check`. */
function optionalNumber(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  integer = false,
): number | undefined {
  const value: unknown = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(errors, `${path}.${key}`, 'expected a finite number or nothing at all');
    return undefined;
  }
  if (integer && !Number.isInteger(value)) {
    fail(errors, `${path}.${key}`, 'expected a whole number');
    return undefined;
  }
  if (value < min || value > max) {
    fail(errors, `${path}.${key}`, `expected ${min}-${max}, got ${value}`);
    return undefined;
  }
  return value;
}

function requireStringArray(
  value: unknown,
  path: string,
  errors: ValidationErrors,
): string[] | null {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array of strings');
    return null;
  }
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.length === 0) {
      fail(errors, `${path}[${String(index)}]`, 'expected a non-empty string');
      return null;
    }
    out.push(entry);
  }
  return out;
}

/** Absent, or present-but-invalid, both come back `undefined`; the second also reports. */
function optionalStringArray(
  source: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationErrors,
): string[] | undefined {
  const value: unknown = source[key];
  if (value === undefined) return undefined;
  const found = requireStringArray(value, `${path}.${key}`, errors);
  return found === null ? undefined : found;
}

// --------------------------------------------------------------------------- §69 events

function readEvent(value: unknown, path: string, errors: ValidationErrors): SessionEvent | null {
  const record = requireRecord(value, path, errors);
  if (record === null) return null;
  const id = requireString(record, 'id', path, errors);
  const type = requireString(record, 'type', path, errors);
  const timestamp = requireNumber(record, 'timestamp', path, errors);
  if (id === null || type === null || timestamp === null) return null;

  const event: SessionEvent = { id, type, timestamp };
  const payload: unknown = record['payload'];
  if (payload !== undefined && payload !== null) {
    const object = requireRecord(payload, `${path}.payload`, errors);
    if (object !== null) event.payload = copyPayload(object);
  }
  return event;
}

function readEvents(value: unknown, path: string, errors: ValidationErrors): SessionEvent[] | null {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array of events');
    return null;
  }
  const events: SessionEvent[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const eventPath = `${path}[${String(index)}]`;
    const event = readEvent(entry, eventPath, errors);
    if (event === null) continue;
    if (seen.has(event.id)) {
      fail(errors, eventPath, `duplicate event id "${event.id}"`);
      continue;
    }
    seen.add(event.id);
    events.push(event);
  }
  return events;
}

// -------------------------------------------------------------------------- §49 inputs

function readInput(value: unknown, path: string, errors: ValidationErrors): GameInput | null {
  const record = requireRecord(value, path, errors);
  if (record === null) return null;
  const type = requireOneOf(record, 'type', INPUT_TYPES, path, errors);
  const x = requireRange(record, 'x', 0, 1, path, errors);
  const y = requireRange(record, 'y', 0, 1, path, errors);
  const timestamp = requireNumber(record, 'timestamp', path, errors);
  if (type === null || x === null || y === null || timestamp === null) return null;

  const input: GameInput = { type, x, y, timestamp };
  const source = record['source'];
  if (source !== undefined && source !== null) {
    const found = requireOneOf({ source }, 'source', INPUT_SOURCES, path, errors);
    if (found !== null) input.source = found;
  }
  const target = record['target'];
  if (target !== undefined && target !== null) {
    const found = requireOneOf({ target }, 'target', INPUT_TARGETS, path, errors);
    if (found !== null) input.target = found;
  }
  const velocity: unknown = record['velocity'];
  if (velocity !== undefined && velocity !== null) {
    const object = requireRecord(velocity, `${path}.velocity`, errors);
    if (object !== null) {
      const vx = requireNumber(object, 'vx', `${path}.velocity`, errors);
      const vy = requireNumber(object, 'vy', `${path}.velocity`, errors);
      if (vx !== null && vy !== null) input.velocity = { vx, vy };
    }
  }
  return input;
}

function readInputs(value: unknown, path: string, errors: ValidationErrors): GameInput[] | null {
  if (!Array.isArray(value)) {
    fail(errors, path, 'expected an array of inputs (§71 replay needs them)');
    return null;
  }
  const inputs: GameInput[] = [];
  for (const [index, entry] of value.entries()) {
    const input = readInput(entry, `${path}[${String(index)}]`, errors);
    if (input !== null) inputs.push(input);
  }
  return inputs;
}

// --------------------------------------------------------------------------- §31 session

/** One §68 `Session`. Returns null (and has reported why) when the record is unusable. */
export function readSession(
  value: unknown,
  path: string,
  errors: ValidationErrors,
): Session | null {
  const record = requireRecord(value, path, errors);
  if (record === null) return null;

  const id = requireString(record, 'id', path, errors);
  const seed = requireNumber(record, 'seed', path, errors);
  const cigaretteId = requireString(record, 'cigaretteId', path, errors);
  const environmentId = requireString(record, 'environmentId', path, errors);
  const lighterId = requireString(record, 'lighterId', path, errors);
  const ashtrayId = requireString(record, 'ashtrayId', path, errors);
  const startedAt = requireNumber(record, 'startedAt', path, errors);
  const targetMs = requireRange(record, 'targetMs', 0, 24 * 60 * 60_000, path, errors);
  const engineStartWallClockMs = requireNumber(record, 'engineStartWallClockMs', path, errors);
  const startedAtEngineMs = requireNumber(record, 'startedAtEngineMs', path, errors);
  const completed = requireBoolean(record, 'completed', path, errors);
  const timeOfDay = requireOneOf(record, 'timeOfDay', TIME_OF_DAY_VALUES, path, errors);
  const weather = requireOneOf(record, 'weather', WEATHER_VALUES, path, errors);
  const events = readEvents(record['events'], `${path}.events`, errors);
  const inputs = readInputs(record['inputs'], `${path}.inputs`, errors);
  const triggers = requireStringArray(record['triggers'], `${path}.triggers`, errors);

  const endedAt = optionalNumber(record, 'endedAt', path, errors);
  let endedAtBad = false;
  if (endedAt !== undefined && startedAt !== null && endedAt < startedAt) {
    fail(errors, `${path}.endedAt`, 'expected a timestamp at or after startedAt');
    endedAtBad = true;
  }
  // §32 is one slider on a 0..10 scale; anything else is a corrupt or hand-edited file.
  const cravingBefore = optionalNumber(
    record,
    'cravingBefore',
    path,
    errors,
    0,
    CRAVING_SCALE_MAX,
    true,
  );
  const cravingAfter = optionalNumber(
    record,
    'cravingAfter',
    path,
    errors,
    0,
    CRAVING_SCALE_MAX,
    true,
  );

  if (
    id === null ||
    seed === null ||
    cigaretteId === null ||
    environmentId === null ||
    lighterId === null ||
    ashtrayId === null ||
    startedAt === null ||
    targetMs === null ||
    engineStartWallClockMs === null ||
    startedAtEngineMs === null ||
    completed === null ||
    timeOfDay === null ||
    weather === null ||
    events === null ||
    inputs === null ||
    triggers === null ||
    endedAtBad
  ) {
    return null;
  }

  const session: Session = {
    id,
    seed,
    cigaretteId,
    environmentId,
    lighterId,
    ashtrayId,
    startedAt,
    targetMs,
    timeOfDay,
    weather,
    events,
    engineStartWallClockMs,
    startedAtEngineMs,
    inputs,
    triggers,
    completed,
  };
  if (endedAt !== undefined) session.endedAt = endedAt;
  if (cravingBefore !== undefined) session.cravingBefore = cravingBefore;
  if (cravingAfter !== undefined) session.cravingAfter = cravingAfter;
  return session;
}

// ------------------------------------------------------------------------ §37 progress

/** §37 progress, read the same way from a save file or from disk (§63). */
export function readProgress(
  value: unknown,
  path: string,
  errors: ValidationErrors,
): Progress | null {
  const record = requireRecord(value, path, errors);
  if (record === null) return null;

  const version = requireInteger(record, 'version', path, errors);
  const startedAt = requireNumber(record, 'startedAt', path, errors);
  const dayNumber = requireInteger(record, 'dayNumber', path, errors);
  const sessions = requireNumber(record, 'sessions', path, errors);
  const puffs = requireNumber(record, 'puffs', path, errors);
  const ashDropped = requireNumber(record, 'ashDropped', path, errors);
  const longestStreakDays = requireInteger(record, 'longestStreakDays', path, errors);
  const lastActiveDayKey: unknown = record['lastActiveDayKey'];
  const acknowledgedUnlocks = optionalStringArray(record, 'acknowledgedUnlocks', path, errors);
  const collectedPacks = optionalStringArray(record, 'collectedPacks', path, errors);
  const activeDays = optionalStringArray(record, 'activeDays', path, errors);

  if (version !== null && version !== 1) {
    fail(
      errors,
      `${path}.version`,
      `expected 1 (migrate the save file first), got ${String(version)}`,
    );
  }
  // §37's counters are engine bookkeeping, not statistics: they must still be whole and
  // non-negative, or the ladder would unlock from nonsense.
  for (const [key, value] of [
    ['sessions', sessions],
    ['puffs', puffs],
    ['ashDropped', ashDropped],
    ['longestStreakDays', longestStreakDays],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      fail(errors, `${path}.${key}`, 'expected a whole number of 0 or more');
    }
  }
  if (dayNumber !== null && (!Number.isInteger(dayNumber) || dayNumber < 1)) {
    fail(errors, `${path}.dayNumber`, 'expected a whole number of 1 or more (§37 starts at day 1)');
  }
  if (startedAt !== null && startedAt < 0)
    fail(errors, `${path}.startedAt`, 'expected a non-negative timestamp');
  if (
    version !== 1 ||
    startedAt === null ||
    dayNumber === null ||
    sessions === null ||
    puffs === null ||
    ashDropped === null ||
    longestStreakDays === null ||
    acknowledgedUnlocks === undefined ||
    activeDays === undefined
  ) {
    return null;
  }
  if (
    typeof lastActiveDayKey !== 'string' ||
    (lastActiveDayKey !== '' && !DAY_KEY.test(lastActiveDayKey))
  ) {
    fail(errors, `${path}.lastActiveDayKey`, 'expected a YYYY-MM-DD day key or ""');
    return null;
  }
  for (const day of activeDays) {
    if (!DAY_KEY.test(day)) {
      fail(errors, `${path}.activeDays`, `expected YYYY-MM-DD day keys, got "${day}"`);
      return null;
    }
  }

  const unlocked = requireRecord(record['unlocked'], `${path}.unlocked`, errors);
  if (unlocked === null) return null;
  // Categories are content-driven (§77): a missing one simply means the player has
  // nothing there yet, and an unknown one is ignored rather than rejected.
  const readList = (category: CollectionCategoryValue): string[] => {
    const list = unlocked[category];
    if (list === undefined) return [];
    return requireStringArray(list, `${path}.unlocked.${category}`, errors) ?? [];
  };

  return {
    version: 1,
    startedAt,
    dayNumber,
    sessions,
    puffs,
    ashDropped,
    longestStreakDays,
    unlocked: {
      [CollectionCategory.CIGARETTES]: readList(CollectionCategory.CIGARETTES),
      [CollectionCategory.LIGHTERS]: readList(CollectionCategory.LIGHTERS),
      [CollectionCategory.ENVIRONMENTS]: readList(CollectionCategory.ENVIRONMENTS),
      [CollectionCategory.ASHTRAYS]: readList(CollectionCategory.ASHTRAYS),
      [CollectionCategory.SMOKE]: readList(CollectionCategory.SMOKE),
      [CollectionCategory.SOUNDS]: readList(CollectionCategory.SOUNDS),
    },
    acknowledgedUnlocks,
    ...(collectedPacks === undefined ? {} : { collectedPacks }),
    lastActiveDayKey,
    activeDays,
  };
}

// ------------------------------------------------------------------------ §64 settings

/** §64 settings, read the same way whether it came from a save file or from disk (§63). */
export function readSettings(
  value: unknown,
  path: string,
  errors: ValidationErrors,
): Settings | null {
  const record = requireRecord(value, path, errors);
  if (record === null) return null;

  const volume = requireRange(record, 'volume', 0, 1, path, errors);
  const ambientVolume = requireRange(record, 'ambientVolume', 0, 1, path, errors);
  const muted = requireBoolean(record, 'muted', path, errors);
  const reducedMotion = requireBoolean(record, 'reducedMotion', path, errors);
  const contrast = requireOneOf(record, 'contrast', CONTRAST_MODES, path, errors);
  const textScale = requireRange(record, 'textScale', 0.5, 3, path, errors);
  const quality = requireOneOf(record, 'quality', QUALITY_MODES, path, errors);
  const sessionTargetMs = requireRange(record, 'sessionTargetMs', 0, 60 * 60_000, path, errors);
  // ±14 hours covers every civil offset on the planet (§71).
  const utcOffsetMinutes = requireRange(
    record,
    'utcOffsetMinutes',
    -14 * 60,
    14 * 60,
    path,
    errors,
  );
  const haptics = readLevel(record, 'haptics', 0, path, errors);
  // S6's dial. A save written before the row has no opinion, and the deck's own 80/20 is also what
  // the game looked like before it, so the default keeps the scene rather than replacing it.
  const realism = readLevel(record, 'realism', 0.8, path, errors);
  // A save written before §28's hint word existed has no opinion about it: the default stands.
  const hints = booleanWithDefault(record, 'hints', true, path, errors);
  // Same reason as `hints`: a save written before the lighter was allowed to play with itself has no
  // opinion about it, and losing the whole settings record over one absent key is not an option.
  const idleFlourishes = booleanWithDefault(record, 'idleFlourishes', true, path, errors);
  // S6's room: a save written before the reverb row existed has no opinion about it, and the
  // deck's own default is 关.
  const reverb = booleanWithDefault(record, 'reverb', false, path, errors);
  const customBackground = readScenePalette(record, 'customBackground', path, errors);
  const selection = optionalSelection(record, path, errors);
  const language = optionalToken(record, 'language', path, errors);
  const skin = optionalToken(record, 'skin', path, errors);
  // The player's own ceiling: a whole number of sticks, or nothing at all.
  const dailyLimit = optionalNumber(record, 'dailyLimitSticks', path, errors, 0, 999, true);
  // S14's 单口时长. The bounds are the deck's own 吸入 segment (S7's 1.0 - 4.0 s), so a save that
  // claims otherwise is named rather than believed, and an absent one keeps the rod's authored draw.
  const puffDurationSec = optionalNumber(record, 'puffDurationSec', path, errors, 1, 4);

  if (
    volume === null ||
    ambientVolume === null ||
    muted === null ||
    reducedMotion === null ||
    contrast === null ||
    textScale === null ||
    quality === null ||
    sessionTargetMs === null ||
    utcOffsetMinutes === null
  ) {
    return null;
  }

  const settings: Settings = {
    volume,
    ambientVolume,
    muted,
    reducedMotion,
    contrast,
    textScale,
    quality,
    sessionTargetMs,
    hints,
    utcOffsetMinutes,
    haptics,
    realism,
    idleFlourishes,
    reverb,
    customBackground,
  };
  // §84: the quit anchor is the player's own statement, so it is optional, never defaulted.
  const quitAnchor = optionalNumber(
    record,
    'quitAnchorTimestamp',
    path,
    errors,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (quitAnchor !== undefined) settings.quitAnchorTimestamp = quitAnchor;
  if (selection !== undefined) settings.selection = selection;
  if (language !== undefined) settings.language = language;
  if (skin !== undefined) settings.skin = skin;
  if (dailyLimit !== undefined) settings.dailyLimitSticks = dailyLimit;
  if (puffDurationSec !== undefined) settings.puffDurationSec = puffDurationSec;
  return settings;
}

// ----------------------------------------------------------------------- §68 profile

/** §68 profile. */
export function readProfile(
  value: unknown,
  path: string,
  errors: ValidationErrors,
): UserProfile | null {
  const record = requireRecord(value, path, errors);
  if (record === null) return null;
  const id = requireString(record, 'id', path, errors);
  const createdAt = requireNumber(record, 'createdAt', path, errors);
  if (id === null || createdAt === null) return null;

  const profile: UserProfile = { id, createdAt };
  const displayName: unknown = record['displayName'];
  if (displayName !== undefined && displayName !== null) {
    if (typeof displayName !== 'string') {
      fail(errors, `${path}.displayName`, 'expected a string or nothing at all');
      return null;
    }
    if (displayName.length > 0) profile.displayName = displayName;
  }
  return profile;
}

// ------------------------------------------------------------------------ §68 save file

/** The keys a legal save must carry, so §51 can reject an envelope that smuggles extras. */
export const SAVE_FILE_KEYS: readonly string[] = [
  'version',
  'app',
  'exportedAt',
  'profile',
  'settings',
  'progress',
  'sessions',
];

/**
 * Validate a parsed JSON value as a `SaveFile` at `SAVE_SCHEMA_VERSION`. Older versions
 * must go through `migrateSaveFile` first, which calls this when it is done.
 */
export function validateSaveFile(value: unknown): SaveFileResult {
  const errors: ValidationErrors = [];
  const record = requireRecord(value, 'save', errors);
  if (record === null) return { ok: false, errors: report(errors) };

  const version = requireInteger(record, 'version', 'save', errors);
  const app = requireString(record, 'app', 'save', errors);
  const exportedAt = requireNumber(record, 'exportedAt', 'save', errors);

  if (version !== null && version !== SAVE_SCHEMA_VERSION) {
    fail(
      errors,
      'save.version',
      `expected schema version ${String(SAVE_SCHEMA_VERSION)}, got ${String(version)} — run migrateSaveFile first`,
    );
  }
  if (app !== null && app !== 'puffly') fail(errors, 'save.app', `expected "puffly", got "${app}"`);

  if (version === null || app === null || exportedAt === null)
    return { ok: false, errors: report(errors) };

  const profile = readProfile(record['profile'], 'save.profile', errors);
  const settings = readSettings(record['settings'], 'save.settings', errors);
  const progress = readProgress(record['progress'], 'save.progress', errors);
  const rawSessions: unknown = record['sessions'];
  if (!Array.isArray(rawSessions)) {
    fail(errors, 'save.sessions', 'expected an array of sessions');
    return { ok: false, errors: report(errors) };
  }

  const sessions: Session[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of rawSessions.entries()) {
    const path = `save.sessions[${String(index)}]`;
    const session = readSession(entry, path, errors);
    if (session === null) continue;
    if (seen.has(session.id)) {
      fail(errors, path, `duplicate session id "${session.id}"`);
      continue;
    }
    seen.add(session.id);
    sessions.push(session);
  }

  if (profile === null || settings === null || progress === null || errors.length > 0) {
    return { ok: false, errors: report(errors) };
  }

  return {
    ok: true,
    save: {
      version: SAVE_SCHEMA_VERSION,
      app: 'puffly',
      exportedAt,
      profile,
      settings,
      progress,
      sessions,
    },
  };
}
