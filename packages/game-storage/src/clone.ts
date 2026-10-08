/**
 * Copying and serialising records — SPEC.md §51, §74.
 *
 * Two rules drive this file:
 *  - a stored record is never the caller's object (an adapter that kept the reference
 *    would let the engine mutate history behind its back), and
 *  - serialising is stable, so two exports of the same data diff to nothing (§51).
 */

import {
  CollectionCategory,
  type GameInput,
  type Progress,
  type Session,
  type SessionEvent,
  type Settings,
  type UserProfile,
} from '@puffly/game-core';

/** Payloads are free-form JSON (§69); a hostile depth must not blow the stack. */
export const MAX_JSON_DEPTH = 16;

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Bounded deep copy of a JSON-ish value. `null` stands in for anything unusable. */
export function copyJson(value: unknown, depth = 0): JsonValue {
  if (depth >= MAX_JSON_DEPTH) return null;
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'object':
      break;
    default:
      // undefined / bigint / function / symbol: nothing sane to store
      return null;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (const entry of value) out.push(copyJson(entry, depth + 1));
    return out;
  }
  const out: { [key: string]: JsonValue } = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || entry === undefined) continue;
    out[key] = copyJson(entry, depth + 1);
  }
  return out;
}

export function cloneProfile(profile: UserProfile): UserProfile {
  const copy: UserProfile = { id: profile.id, createdAt: profile.createdAt };
  const displayName = profile.displayName;
  if (typeof displayName === 'string' && displayName.length > 0) copy.displayName = displayName;
  return copy;
}

export function cloneSettings(settings: Settings): Settings {
  const copy: Settings = {
    volume: settings.volume,
    ambientVolume: settings.ambientVolume,
    muted: settings.muted,
    reducedMotion: settings.reducedMotion,
    contrast: settings.contrast,
    textScale: settings.textScale,
    quality: settings.quality,
    sessionTargetMs: settings.sessionTargetMs,
    hints: settings.hints,
    utcOffsetMinutes: settings.utcOffsetMinutes,
    haptics: settings.haptics,
    realism: settings.realism,
    reverb: settings.reverb,
    idleFlourishes: settings.idleFlourishes,
    // A palette is four arrays, so a shallow copy would let an imported file share its colours
    // with the live settings one layer deep.
    customBackground: settings.customBackground
      ? {
          skyTop: [...settings.customBackground.skyTop],
          skyBottom: [...settings.customBackground.skyBottom],
          horizon: [...settings.customBackground.horizon],
          silhouette: [...settings.customBackground.silhouette],
        }
      : null,
  };
  // Keep "absent" absent: an export must not turn an unset anchor into `undefined`.
  if (typeof settings.quitAnchorTimestamp === 'number') {
    copy.quitAnchorTimestamp = settings.quitAnchorTimestamp;
  }
  // What the player is holding is as much their state as the volume they chose; both have to
  // survive the copy, or the next reload quietly puts the default rod back on the table.
  const selection = settings.selection;
  if (selection !== undefined) {
    copy.selection = {
      cigarette: selection.cigarette,
      environment: selection.environment,
      lighter: selection.lighter,
      ashtray: selection.ashtray,
    };
  }
  if (typeof settings.language === 'string' && settings.language.length > 0) {
    copy.language = settings.language;
  }
  if (typeof settings.skin === 'string' && settings.skin.length > 0) {
    copy.skin = settings.skin;
  }
  if (typeof settings.dailyLimitSticks === 'number') {
    copy.dailyLimitSticks = settings.dailyLimitSticks;
  }
  if (typeof settings.puffDurationSec === 'number') {
    copy.puffDurationSec = settings.puffDurationSec;
  }
  return copy;
}

export function cloneProgress(progress: Progress): Progress {
  return {
    version: 1,
    startedAt: progress.startedAt,
    dayNumber: progress.dayNumber,
    sessions: progress.sessions,
    puffs: progress.puffs,
    ashDropped: progress.ashDropped,
    longestStreakDays: progress.longestStreakDays,
    unlocked: {
      [CollectionCategory.CIGARETTES]: [
        ...(progress.unlocked[CollectionCategory.CIGARETTES] ?? []),
      ],
      [CollectionCategory.LIGHTERS]: [...(progress.unlocked[CollectionCategory.LIGHTERS] ?? [])],
      [CollectionCategory.ENVIRONMENTS]: [
        ...(progress.unlocked[CollectionCategory.ENVIRONMENTS] ?? []),
      ],
      [CollectionCategory.ASHTRAYS]: [...(progress.unlocked[CollectionCategory.ASHTRAYS] ?? [])],
      [CollectionCategory.SMOKE]: [...(progress.unlocked[CollectionCategory.SMOKE] ?? [])],
      [CollectionCategory.SOUNDS]: [...(progress.unlocked[CollectionCategory.SOUNDS] ?? [])],
    },
    acknowledgedUnlocks: [...progress.acknowledgedUnlocks],
    ...(progress.collectedPacks === undefined
      ? {}
      : { collectedPacks: [...progress.collectedPacks] }),
    // Each tally is a small record, so the rows themselves are copied: a shared object would let an
    // imported file's count be written by the live one on the next 替代动作.
    ...(progress.substitutes === undefined
      ? {}
      : { substitutes: progress.substitutes.map((tally) => ({ ...tally })) }),
    lastActiveDayKey: progress.lastActiveDayKey,
    activeDays: [...progress.activeDays],
  };
}

/** A §69 payload copied into plain JSON, dropping anything that cannot be stored. */
export function copyPayload(payload: Record<string, unknown>): Record<string, JsonValue> {
  const copy: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(payload)) {
    if (key === '__proto__' || entry === undefined) continue;
    copy[key] = copyJson(entry);
  }
  return copy;
}

export function cloneEvent(event: SessionEvent): SessionEvent {
  const copy: SessionEvent = { id: event.id, type: event.type, timestamp: event.timestamp };
  const payload = event.payload;
  if (typeof payload === 'object' && payload !== null) copy.payload = copyPayload(payload);
  return copy;
}

export function cloneInput(input: GameInput): GameInput {
  const copy: GameInput = { type: input.type, x: input.x, y: input.y, timestamp: input.timestamp };
  if (typeof input.source === 'string') copy.source = input.source;
  if (typeof input.target === 'string') copy.target = input.target;
  const velocity = input.velocity;
  if (velocity !== undefined) copy.velocity = { vx: velocity.vx, vy: velocity.vy };
  return copy;
}

export function cloneSession(session: Session): Session {
  const copy: Session = {
    id: session.id,
    seed: session.seed,
    cigaretteId: session.cigaretteId,
    environmentId: session.environmentId,
    lighterId: session.lighterId,
    ashtrayId: session.ashtrayId,
    startedAt: session.startedAt,
    targetMs: session.targetMs,
    timeOfDay: session.timeOfDay,
    weather: session.weather,
    events: (Array.isArray(session.events) ? session.events : []).map(cloneEvent),
    engineStartWallClockMs: session.engineStartWallClockMs,
    startedAtEngineMs: session.startedAtEngineMs,
    inputs: (Array.isArray(session.inputs) ? session.inputs : []).map(cloneInput),
    triggers: (Array.isArray(session.triggers) ? session.triggers : []).filter(
      (tag): tag is string => typeof tag === 'string',
    ),
    completed: session.completed === true,
  };
  if (typeof session.endedAt === 'number') copy.endedAt = session.endedAt;
  if (typeof session.cravingBefore === 'number') copy.cravingBefore = session.cravingBefore;
  if (typeof session.cravingAfter === 'number') copy.cravingAfter = session.cravingAfter;
  return copy;
}

export function cloneSessions(sessions: readonly Session[]): Session[] {
  return sessions.map(cloneSession);
}

/**
 * Key-sorted JSON, so an export is a stable artefact: same data, byte-identical file,
 * `diff`-able by a human (§51). Arrays keep their order — a session log is a timeline.
 */
export function stableStringify(value: unknown, indentText = '  '): string {
  const lines: string[] = [];
  writeValue(value, 0, indentText, lines);
  return lines.join('\n');
}

function indent(depth: number, indentText: string): string {
  return indentText.repeat(depth);
}

function writeValue(value: unknown, depth: number, indentText: string, out: string[]): void {
  if (value === null) {
    out.push('null');
    return;
  }
  switch (typeof value) {
    case 'string':
      out.push(JSON.stringify(value));
      return;
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number':
      // Never emit a bare `NaN`/`Infinity`: that is not JSON and would poison the file.
      out.push(Number.isFinite(value) ? String(value) : 'null');
      return;
    case 'object':
      break;
    default:
      out.push('null');
      return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push('[]');
      return;
    }
    const items: string[] = [];
    for (const entry of value) {
      const nested: string[] = [];
      writeValue(entry, depth + 1, indentText, nested);
      items.push(`${indent(depth + 1, indentText)}${nested.join('')}`);
    }
    out.push('[\n', items.join(',\n'), '\n', indent(depth, indentText), ']');
    return;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => key !== '__proto__' && record[key] !== undefined)
    .sort();
  if (keys.length === 0) {
    out.push('{}');
    return;
  }
  const entries: string[] = [];
  for (const key of keys) {
    const nested: string[] = [];
    writeValue(record[key], depth + 1, indentText, nested);
    entries.push(`${indent(depth + 1, indentText)}${JSON.stringify(key)}: ${nested.join('')}`);
  }
  out.push('{\n', entries.join(',\n'), '\n', indent(depth, indentText), '}');
}
