/**
 * The same seam, in a `Map` — SPEC.md §63, §72.
 *
 * This is the store Puffly falls back to when IndexedDB is unavailable (private browsing,
 * a browser that blocked it, a platform with no database at all): the game keeps working
 * for the rest of the session and the shell can still offer §51's export. It is also the
 * adapter §72's tests use when they want the interface without a platform.
 *
 * Nothing is awaited on a timer and nothing leaks out of the process: every record is
 * copied on the way in and on the way out, exactly like the IndexedDB adapter.
 */

import type { OpenBreak, Progress, Session, Settings, UserProfile } from '@puffly/game-core';
import {
  StorageError,
  applySessionFilter,
  type SessionFilter,
  type StorageAdapter,
} from './adapter';
import { cloneProfile, cloneProgress, cloneSession, cloneSettings } from './clone';

export interface MemorySeed {
  profile?: UserProfile | null;
  settings?: Settings | null;
  progress?: Progress | null;
  sessions?: readonly Session[];
}

export interface MemoryStorage extends StorageAdapter {
  /** How much is held right now, so §63's shell can show a dot without a query. */
  readonly size: {
    sessions: number;
    hasProfile: boolean;
    hasSettings: boolean;
    hasProgress: boolean;
  };
  /** Everything in one object, ready for `exportSaveFile` (§51). */
  dump(): {
    profile: UserProfile | null;
    settings: Settings | null;
    progress: Progress | null;
    sessions: Session[];
  };
}

export function createMemoryStorage(seed: MemorySeed = {}): MemoryStorage {
  let profile =
    seed.profile === null || seed.profile === undefined ? null : cloneProfile(seed.profile);
  let settings =
    seed.settings === null || seed.settings === undefined ? null : cloneSettings(seed.settings);
  let openBreak: OpenBreak | null = null;
  let progress =
    seed.progress === null || seed.progress === undefined ? null : cloneProgress(seed.progress);
  const sessions = new Map<string, Session>();
  for (const session of seed.sessions ?? []) sessions.set(session.id, cloneSession(session));

  return {
    get size() {
      return {
        sessions: sessions.size,
        hasProfile: profile !== null,
        hasSettings: settings !== null,
        hasProgress: progress !== null,
      };
    },

    dump() {
      return {
        profile,
        settings,
        progress,
        sessions: [...sessions.values()]
          .sort((a, b) => a.startedAt - b.startedAt)
          .map(cloneSession),
      };
    },

    async loadProfile() {
      return profile;
    },

    async saveProfile(next: UserProfile) {
      profile = cloneProfile(next);
    },

    async loadSettings() {
      return settings;
    },

    async saveSettings(next: Settings) {
      settings = cloneSettings(next);
    },

    async loadProgress() {
      return progress;
    },

    async saveProgress(next: Progress) {
      progress = cloneProgress(next);
    },

    async loadOpenBreak() {
      return openBreak;
    },
    async saveOpenBreak(record: OpenBreak) {
      openBreak = { ...record };
    },
    async clearOpenBreak() {
      openBreak = null;
    },

    async listSessions(filter?: SessionFilter) {
      // Oldest first inside the map, newest first out: the same order the IndexedDB
      // adapter produces from its `startedAt` index, so §34 cannot tell them apart (§72).
      return applySessionFilter([...sessions.values()], filter).map(cloneSession);
    },

    async putSession(session: Session) {
      if (typeof session.id !== 'string' || session.id.length === 0) {
        throw new StorageError('invalid-record', 'a session needs an id before it can be stored');
      }
      sessions.set(session.id, cloneSession(session));
    },

    async deleteSession(id: string) {
      sessions.delete(id);
    },

    async clear() {
      profile = null;
      settings = null;
      progress = null;
      openBreak = null;
      sessions.clear();
    },
  };
}
