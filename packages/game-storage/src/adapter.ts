/**
 * The persistence seam — SPEC.md §50, §63.
 *
 * Game Core only ever sees this interface (§50): the web build hands it IndexedDB, a
 * desktop build can hand it SQLite or a file, and §63's memory fallback hands it a Map.
 * Nothing here throws on a missing platform: an unavailable store rejects with a
 * `StorageError` so `createFallbackStorage` can decide what to do about it.
 */

import type { OpenBreak, Progress, Session, Settings, UserProfile } from '@puffly/game-core';

/** §51's optional narrowing for the session log. */
export interface SessionFilter {
  /** Newest-first cap: the `limit` most recent sessions. */
  limit?: number;
  /** Only sessions whose `startedAt` is at or after this wall-clock millisecond. */
  since?: number;
}

/** §50: the one shape the rest of the app is allowed to depend on. */
export interface StorageAdapter {
  loadProfile(): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  loadSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;
  loadProgress(): Promise<Progress | null>;
  saveProgress(progress: Progress): Promise<void>;
  /** Newest first. §34 only ever needs the tail of the log, so `limit` matters (§54). */
  listSessions(filter?: SessionFilter): Promise<Session[]>;
  putSession(session: Session): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /**
   * The break that is running right now, so an app the operating system kills can come back
   * to the rod it was burning. Optional by nature: absent means no break was interrupted.
   */
  loadOpenBreak(): Promise<OpenBreak | null>;
  saveOpenBreak(record: OpenBreak): Promise<void>;
  clearOpenBreak(): Promise<void>;
  /** Wipes everything: this is the "delete my data" path §52 implies. */
  clear(): Promise<void>;
}

export type StorageErrorCode =
  /** No IndexedDB in this environment (private mode, old browser, non-browser host). */
  | 'unavailable'
  | 'open-failed'
  | 'blocked'
  | 'transaction-failed'
  | 'invalid-record'
  | 'aborted'
  | 'closed'
  | 'migration-failed';

/**
 * §63: errors are codes, not sentences. The shell shows a visual state (a dimmed icon, a
 * dot), never this string — "错误也尽量不要出现技术文字".
 */
export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'StorageError';
    this.code = code;
  }
}

export function isStorageError(value: unknown): value is StorageError {
  return value instanceof StorageError;
}

/** A stable, loggable reason for a failure — still never shown as UI text (§63). */
export function storageFailureCode(value: unknown): StorageErrorCode {
  return isStorageError(value) ? value.code : 'transaction-failed';
}

/** The single-record keys used by every adapter. Sessions are keyed by their own `id`. */
export const RECORD_KEY = 'current' as const;

/** The `meta` row the interrupted break lives in: a key, not a schema change. */
export const OPEN_BREAK_ID = 'openBreak' as const;

/** Shared filter behaviour so IndexedDB, memory and the fallback agree (§72). */
export function applySessionFilter(
  sessions: readonly Session[],
  filter: SessionFilter | undefined,
): Session[] {
  const since =
    typeof filter?.since === 'number' && Number.isFinite(filter.since) ? filter.since : null;
  const limit =
    typeof filter?.limit === 'number' && Number.isFinite(filter.limit)
      ? Math.max(0, Math.floor(filter.limit))
      : null;

  const selected: Session[] = [];
  for (const session of sessions) {
    if (since !== null && !(session.startedAt >= since)) continue;
    selected.push(session);
  }
  selected.sort((a, b) => b.startedAt - a.startedAt);
  return limit === null ? selected : selected.slice(0, limit);
}
