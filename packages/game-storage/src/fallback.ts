/**
 * §63's storage failure story: "如果 Storage 出错：使用内存 fallback，并提供恢复".
 *
 * A primary adapter (IndexedDB, a desktop file store) is wrapped with a fallback
 * adapter (in memory). Any method that rejects on the primary is retried against the
 * fallback, the player keeps playing, and the shell gets a *visual* signal through
 * `degraded` plus an injectable `onError` — never a console line (§63). Writes that only
 * reached the fallback are journaled, so `recover()` can replay them onto the primary
 * once it answers again: "并提供恢复".
 */

import type { OpenBreak, Progress, Session, Settings, UserProfile } from '@puffly/game-core';
import {
  StorageError,
  storageFailureCode,
  type SessionFilter,
  type StorageAdapter,
  type StorageErrorCode,
} from './adapter';
import { createMemoryStorage, type MemoryStorage } from './memory';

/** Every call the wrapper can make, plus the recovery pass itself. */
export type StorageCallName = keyof StorageAdapter | 'recover';

export interface StorageFailure {
  method: StorageCallName;
  /** A code, not a sentence: the shell dims an icon rather than showing a stack (§63). */
  code: StorageErrorCode;
  /** The underlying message, for a developer reading a bug report — never UI text. */
  message: string;
  /** True when the fallback answered, so the player did not lose the call. */
  recovered: boolean;
  atMs: number;
}

export interface FallbackStorageOptions {
  /** Required in spirit: this is how §63's failure becomes a visual state. */
  onError?: (failure: StorageFailure) => void;
  /** Called after `recover()` successfully replayed the journal. */
  onRecovered?: (info: { atMs: number; replayedSessions: number; replayedRecords: number }) => void;
  /** Injectable clock, so a test can assert `atMs` without waiting (§74). */
  nowMs?: () => number;
  /**
   * While degraded, calls go straight to the fallback instead of paying a failing
   * primary round trip again. Defaults to true.
   */
  sticky?: boolean;
}

export interface DegradedStorage extends StorageAdapter {
  /** False until the first primary failure. The shell may show a small dot (§63). */
  readonly degraded: boolean;
  readonly failures: readonly StorageFailure[];
  /** Writes held only in the fallback, waiting for `recover()`. */
  readonly bufferedCount: number;
  /** Retry the primary and replay the journal onto it. True when everything is stored. */
  recover(): Promise<boolean>;
}

interface Journal {
  cleared: boolean;
  profile: UserProfile | null;
  settings: Settings | null;
  progress: Progress | null;
  sessions: Map<string, Session>;
  deleted: Set<string>;
}

function emptyJournal(): Journal {
  return {
    cleared: false,
    profile: null,
    settings: null,
    progress: null,
    sessions: new Map(),
    deleted: new Set(),
  };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'the store did not answer';
}

export function createFallbackStorage(
  primary: StorageAdapter,
  fallback: StorageAdapter,
  options: FallbackStorageOptions = {},
): DegradedStorage {
  const sticky = options.sticky ?? true;
  const nowMs = options.nowMs ?? (() => Date.now());
  const failures: StorageFailure[] = [];
  const journal = emptyJournal();
  let degraded = false;

  function note(method: StorageCallName, error: unknown, recovered: boolean): void {
    const failure: StorageFailure = {
      method,
      code: storageFailureCode(error),
      message: messageOf(error),
      recovered,
      atMs: nowMs(),
    };
    failures.push(failure);
    options.onError?.(failure);
  }

  /** The fallback is kept warm by mirroring every successful write, so a store that
   * dies half way through a session still has what came before it (§63). */
  async function mirror(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch {
      // A failed mirror is not something the player can act on; the primary answered.
    }
  }

  async function attempt<T>(
    method: StorageCallName,
    primaryCall: () => Promise<T>,
    fallbackCall: () => Promise<T>,
  ): Promise<{ value: T; usedFallback: boolean }> {
    if (degraded && sticky) {
      return { value: await fallbackCall(), usedFallback: true };
    }
    try {
      const value = await primaryCall();
      return { value, usedFallback: false };
    } catch (error) {
      degraded = true;
      note(method, error, true);
      try {
        return { value: await fallbackCall(), usedFallback: true };
      } catch (fallbackError) {
        // Both stores are down. Report it as an unrecovered failure and let the shell
        // decide what to show; nothing is silently dropped (§63).
        note(method, fallbackError, false);
        throw fallbackError;
      }
    }
  }

  const storage: DegradedStorage = {
    get degraded() {
      return degraded;
    },
    get failures() {
      return failures;
    },
    get bufferedCount() {
      return (
        (journal.cleared ? 1 : 0) +
        (journal.profile === null ? 0 : 1) +
        (journal.settings === null ? 0 : 1) +
        (journal.progress === null ? 0 : 1) +
        journal.sessions.size +
        journal.deleted.size
      );
    },

    async loadProfile() {
      return (
        await attempt(
          'loadProfile',
          () => primary.loadProfile(),
          () => fallback.loadProfile(),
        )
      ).value;
    },

    async saveProfile(profile: UserProfile) {
      const outcome = await attempt(
        'saveProfile',
        () => primary.saveProfile(profile),
        () => fallback.saveProfile(profile),
      );
      if (outcome.usedFallback) journal.profile = profile;
      else await mirror(() => fallback.saveProfile(profile));
    },

    async loadSettings() {
      return (
        await attempt(
          'loadSettings',
          () => primary.loadSettings(),
          () => fallback.loadSettings(),
        )
      ).value;
    },

    async saveSettings(settings: Settings) {
      const outcome = await attempt(
        'saveSettings',
        () => primary.saveSettings(settings),
        () => fallback.saveSettings(settings),
      );
      if (outcome.usedFallback) journal.settings = settings;
      else await mirror(() => fallback.saveSettings(settings));
    },

    async loadProgress() {
      return (
        await attempt(
          'loadProgress',
          () => primary.loadProgress(),
          () => fallback.loadProgress(),
        )
      ).value;
    },

    async saveProgress(progress: Progress) {
      const outcome = await attempt(
        'saveProgress',
        () => primary.saveProgress(progress),
        () => fallback.saveProgress(progress),
      );
      if (outcome.usedFallback) journal.progress = progress;
      else await mirror(() => fallback.saveProgress(progress));
    },

    async loadOpenBreak() {
      return (
        await attempt(
          'loadOpenBreak',
          () => primary.loadOpenBreak(),
          () => fallback.loadOpenBreak(),
        )
      ).value;
    },

    async saveOpenBreak(record: OpenBreak) {
      const outcome = await attempt(
        'saveOpenBreak',
        () => primary.saveOpenBreak(record),
        () => fallback.saveOpenBreak(record),
      );
      if (!outcome.usedFallback) await mirror(() => fallback.saveOpenBreak(record));
    },

    async clearOpenBreak() {
      await attempt(
        'clearOpenBreak',
        () => primary.clearOpenBreak(),
        () => fallback.clearOpenBreak(),
      );
    },

    async listSessions(filter?: SessionFilter) {
      const outcome = await attempt(
        'listSessions',
        () => primary.listSessions(filter),
        () => fallback.listSessions(filter),
      );
      // Journaled writes are merged in whatever answered, so a session saved a moment ago
      // can never vanish from the journey line (§51: nothing the player did goes missing).
      return mergeVisible(outcome.value, journal);
    },

    async putSession(session: Session) {
      const outcome = await attempt(
        'putSession',
        () => primary.putSession(session),
        () => fallback.putSession(session),
      );
      if (outcome.usedFallback) {
        journal.sessions.set(session.id, session);
        journal.deleted.delete(session.id);
      } else {
        await mirror(() => fallback.putSession(session));
      }
    },

    async deleteSession(id: string) {
      const outcome = await attempt(
        'deleteSession',
        () => primary.deleteSession(id),
        () => fallback.deleteSession(id),
      );
      if (outcome.usedFallback) {
        journal.deleted.add(id);
        journal.sessions.delete(id);
      } else {
        await mirror(() => fallback.deleteSession(id));
      }
    },

    async clear() {
      const outcome = await attempt(
        'clear',
        () => primary.clear(),
        () => fallback.clear(),
      );
      if (outcome.usedFallback) {
        Object.assign(journal, emptyJournal());
        journal.cleared = true;
      } else {
        await mirror(() => fallback.clear());
      }
    },

    async recover() {
      if (!degraded) return true;
      try {
        await primary.listSessions({ limit: 1 });
      } catch (error) {
        note('recover', error, false);
        return false;
      }

      try {
        if (journal.cleared) await primary.clear();
        if (journal.profile !== null) await primary.saveProfile(journal.profile);
        if (journal.settings !== null) await primary.saveSettings(journal.settings);
        if (journal.progress !== null) await primary.saveProgress(journal.progress);
        for (const id of journal.deleted) await primary.deleteSession(id);
        for (const session of journal.sessions.values()) await primary.putSession(session);
      } catch (error) {
        // Keep the journal: the player's writes are still held in the fallback (§63).
        note('recover', error, false);
        return false;
      }

      const replayedSessions = journal.sessions.size;
      const replayedRecords =
        (journal.profile === null ? 0 : 1) +
        (journal.settings === null ? 0 : 1) +
        (journal.progress === null ? 0 : 1);
      Object.assign(journal, emptyJournal());
      degraded = false;
      options.onRecovered?.({ atMs: nowMs(), replayedSessions, replayedRecords });
      return true;
    },
  };

  return storage;
}

/** Fallback contents plus the journal, newest-first, without duplicating an id. */
function mergeVisible(sessions: readonly Session[], journal: Journal): Session[] {
  const byId = new Map<string, Session>();
  for (const session of sessions) byId.set(session.id, session);
  if (!journal.cleared) {
    for (const session of journal.sessions.values()) byId.set(session.id, session);
  }
  for (const id of journal.deleted) byId.delete(id);
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * The §63 pairing a web shell actually wants: IndexedDB in front, a `Map` behind it.
 * Both are returned so the shell can read what survived after a failure, and so a test
 * can assert the fallback really holds the data.
 */
export function withMemoryFallback(
  primary: StorageAdapter,
  options: FallbackStorageOptions = {},
): { storage: DegradedStorage; fallback: MemoryStorage } {
  const fallback = createMemoryStorage();
  return { storage: createFallbackStorage(primary, fallback, options), fallback };
}

/** A primary that is simply not there, for tests and for a platform with no store at all. */
export function createUnavailableStorage(
  reason = 'no storage in this environment',
): StorageAdapter {
  const unavailable = (): Promise<never> => Promise.reject(new StorageError('unavailable', reason));
  return {
    loadProfile: unavailable,
    saveProfile: unavailable,
    loadSettings: unavailable,
    saveSettings: unavailable,
    loadProgress: unavailable,
    saveProgress: unavailable,
    loadOpenBreak: unavailable,
    saveOpenBreak: unavailable,
    clearOpenBreak: unavailable,
    listSessions: unavailable,
    putSession: unavailable,
    deleteSession: unavailable,
    clear: unavailable,
  };
}
