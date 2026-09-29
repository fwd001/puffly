/**
 * §51's import merge: two save files become one without losing anything the player did.
 *
 * The rules are the boring, defensible ones: the session log is a union keyed by `id`
 * (an incoming record replaces the one it matches, because the incoming file is the newer
 * statement about that session), progress keeps the earliest `startedAt` so §37's day
 * counting can only get more accurate, and every other field is a union or a maximum.
 *
 * Statistics are never merged — they are derived from the log by
 * `@puffly/game-statistics` (§70), so there is nothing here to double-count.
 */

import {
  CollectionCategory,
  SAVE_SCHEMA_VERSION,
  type Progress,
  type SaveFile,
  type Session,
  type UserProfile,
} from '@puffly/game-core';
import { cloneProfile, cloneSession, cloneSettings } from './clone';

export interface MergeSummary {
  /** Sessions only the current file had. */
  keptSessionIds: string[];
  /** Sessions only the incoming file had. */
  addedSessionIds: string[];
  /** Sessions both had; the incoming copy won (§51). */
  replacedSessionIds: string[];
  /** Length of the merged log. */
  totalSessions: number;
  /** Always 0: dropping a session would be data loss, so the merge measures itself. */
  droppedSessions: number;
  /** The earliest `progress.startedAt` of the two — §37's day 1. */
  progressStartedAtMs: number;
  /** Which profile identity won: the older one, because a local id is not a name to overwrite. */
  profileIdSource: 'current' | 'incoming';
}

export interface MergeOutcome {
  save: SaveFile;
  summary: MergeSummary;
}

export interface MergeOptions {
  /** Pass a clock for a deterministic merge (§74); defaults to the wall clock. */
  nowMs?: number;
}

function unionSorted(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])].sort();
}

function maxNumber(left: number, right: number): number {
  const a = Number.isFinite(left) ? left : 0;
  const b = Number.isFinite(right) ? right : 0;
  return Math.max(a, b);
}

/** The later local day key wins; `YYYY-MM-DD` sorts as text (§71). */
function laterDayKey(left: string, right: string): string {
  if (left === '') return right;
  if (right === '') return left;
  return left >= right ? left : right;
}

/** The earliest of the two, ignoring a side that has lost its timestamp. */
function earliestStartedAt(left: number, right: number): number {
  const a = Number.isFinite(left) && left >= 0 ? left : null;
  const b = Number.isFinite(right) && right >= 0 ? right : null;
  if (a === null) return b ?? 0;
  if (b === null) return a;
  return Math.min(a, b);
}

function mergeProgress(current: Progress, incoming: Progress): Progress {
  return {
    version: 1,
    startedAt: earliestStartedAt(current.startedAt, incoming.startedAt),
    dayNumber: maxNumber(current.dayNumber, incoming.dayNumber),
    // These are §37 unlock counters, not §33 statistics: a maximum is the safe merge, and
    // the numbers a player actually sees are re-derived from the merged log anyway (§70).
    sessions: maxNumber(current.sessions, incoming.sessions),
    puffs: maxNumber(current.puffs, incoming.puffs),
    ashDropped: maxNumber(current.ashDropped, incoming.ashDropped),
    longestStreakDays: maxNumber(current.longestStreakDays, incoming.longestStreakDays),
    unlocked: {
      [CollectionCategory.CIGARETTES]: unionSorted(
        current.unlocked[CollectionCategory.CIGARETTES] ?? [],
        incoming.unlocked[CollectionCategory.CIGARETTES] ?? [],
      ),
      [CollectionCategory.LIGHTERS]: unionSorted(
        current.unlocked[CollectionCategory.LIGHTERS] ?? [],
        incoming.unlocked[CollectionCategory.LIGHTERS] ?? [],
      ),
      [CollectionCategory.ENVIRONMENTS]: unionSorted(
        current.unlocked[CollectionCategory.ENVIRONMENTS] ?? [],
        incoming.unlocked[CollectionCategory.ENVIRONMENTS] ?? [],
      ),
      [CollectionCategory.ASHTRAYS]: unionSorted(
        current.unlocked[CollectionCategory.ASHTRAYS] ?? [],
        incoming.unlocked[CollectionCategory.ASHTRAYS] ?? [],
      ),
      [CollectionCategory.SMOKE]: unionSorted(
        current.unlocked[CollectionCategory.SMOKE] ?? [],
        incoming.unlocked[CollectionCategory.SMOKE] ?? [],
      ),
      [CollectionCategory.SOUNDS]: unionSorted(
        current.unlocked[CollectionCategory.SOUNDS] ?? [],
        incoming.unlocked[CollectionCategory.SOUNDS] ?? [],
      ),
    },
    acknowledgedUnlocks: unionSorted(current.acknowledgedUnlocks, incoming.acknowledgedUnlocks),
    lastActiveDayKey: laterDayKey(current.lastActiveDayKey, incoming.lastActiveDayKey),
    activeDays: unionSorted(current.activeDays, incoming.activeDays),
  };
}

/** The older of the two profiles: a local identity is not something an import overwrites. */
function chooseProfile(
  current: UserProfile,
  incoming: UserProfile,
): { profile: UserProfile; source: 'current' | 'incoming' } {
  return current.createdAt <= incoming.createdAt
    ? { profile: current, source: 'current' }
    : { profile: incoming, source: 'incoming' };
}

export function mergeSaveFiles(
  current: SaveFile,
  incoming: SaveFile,
  options: MergeOptions = {},
): MergeOutcome {
  const byId = new Map<string, Session>();
  for (const session of current.sessions) byId.set(session.id, cloneSession(session));
  const currentIds = [...byId.keys()];

  const addedSessionIds: string[] = [];
  const replacedSessionIds: string[] = [];
  for (const session of incoming.sessions) {
    if (byId.has(session.id)) replacedSessionIds.push(session.id);
    else addedSessionIds.push(session.id);
    byId.set(session.id, cloneSession(session));
  }

  const sessions = [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
  const progress = mergeProgress(current.progress, incoming.progress);
  const chosen = chooseProfile(current.profile, incoming.profile);
  const nowMs =
    typeof options.nowMs === 'number' && Number.isFinite(options.nowMs)
      ? options.nowMs
      : Date.now();

  return {
    save: {
      version: SAVE_SCHEMA_VERSION,
      app: 'puffly',
      exportedAt: nowMs,
      profile: cloneProfile(chosen.profile),
      // Settings are a statement of taste: the file being imported carries the player's
      // latest choices, so incoming wins (§51).
      settings: cloneSettings(incoming.settings),
      progress,
      sessions,
    },
    summary: {
      keptSessionIds: currentIds.filter((id) => !replacedSessionIds.includes(id)).sort(),
      addedSessionIds: addedSessionIds.sort(),
      replacedSessionIds: replacedSessionIds.sort(),
      totalSessions: sessions.length,
      // Every id from either side is in `sessions` by construction; anything else is a bug,
      // so it is counted rather than assumed (§51).
      droppedSessions: Math.max(0, currentIds.length + addedSessionIds.length - sessions.length),
      progressStartedAtMs: progress.startedAt,
      profileIdSource: chosen.source,
    },
  };
}

/** The merged session log alone, for a shell that only stores sessions. */
export function mergeSessionLogs(
  current: readonly Session[],
  incoming: readonly Session[],
): Session[] {
  const byId = new Map<string, Session>();
  for (const session of current) byId.set(session.id, cloneSession(session));
  for (const session of incoming) byId.set(session.id, cloneSession(session));
  return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
}
