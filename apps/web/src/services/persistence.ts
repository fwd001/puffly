/**
 * Local persistence wiring — SPEC.md §50-52, §63.
 *
 * IndexedDB is the real store; if it is missing, blocked, or throws (private mode), the
 * memory fallback takes over so the game still runs and still remembers the current
 * break. `degraded` is reported visually, never as an error message.
 */

import {
  createDefaultSettings,
  SAVE_SCHEMA_VERSION,
  type OpenBreak,
  type Progress,
  type SaveFile,
  type Session,
  type Settings,
  type UserProfile,
} from '@puffly/game-core';
import {
  createFallbackStorage,
  createIdbStorage,
  createMemoryStorage,
  exportSaveFile,
  mergeSaveFiles,
  parseSaveFile,
  serializeSaveFile,
  type StorageAdapter,
} from '@puffly/game-storage';

export interface LoadedSave {
  profile: UserProfile;
  settings: Settings;
  progress: Progress;
  sessions: Session[];
  /** Lets the shell apply an OS-level reduced-motion default only on a first run (§64). */
  hadStoredSettings: boolean;
}

export interface Persistence {
  storage: StorageAdapter;
  load(nowMs: number): Promise<LoadedSave>;
  saveSettings(settings: Settings): Promise<void>;
  saveProgress(progress: Progress): Promise<void>;
  putSession(session: Session): Promise<void>;
  /**
   * The break that was running when the app last went away. Transient by nature: it is not part
   * of §52's export, because a finished record of it is already in the session log.
   */
  loadOpenBreak(): Promise<OpenBreak | null>;
  saveOpenBreak(record: OpenBreak): Promise<void>;
  clearOpenBreak(): Promise<void>;
  download(): Promise<string>;
  restore(json: string): Promise<{ ok: boolean; errors: string[] }>;
  isDegraded(): boolean;
}
/** Reading the player's zone is a shell job, not a core one (§47). */
function localUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

function newProfile(nowMs: number): UserProfile {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `p-${nowMs.toString(36)}`;
  return { id, createdAt: nowMs };
}

function newProgress(nowMs: number): Progress {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return {
    version: 1,
    startedAt: nowMs,
    dayNumber: 1,
    sessions: 0,
    puffs: 0,
    ashDropped: 0,
    longestStreakDays: 1,
    unlocked: {
      cigarettes: [],
      lighters: [],
      environments: [],
      ashtrays: [],
      smoke: [],
      sounds: [],
    },
    acknowledgedUnlocks: [],
    lastActiveDayKey: day,
    activeDays: [day],
  };
}

export function createPersistence(): Persistence {
  const primary = createIdbStorage();
  const memory = createMemoryStorage();
  let degraded = false;
  const storage = createFallbackStorage(primary, memory, {
    onError: (error: unknown) => {
      // §63: storage trouble must not surface as technical text. Remember it visually later.
      degraded = true;
      void error;
    },
  });

  const load = async (nowMs: number): Promise<LoadedSave> => {
    const [profile, storedSettings, progress, sessions] = await Promise.all([
      storage.loadProfile(),
      storage.loadSettings(),
      storage.loadProgress(),
      storage.listSessions({}),
    ]);
    return {
      profile: profile ?? newProfile(nowMs),
      settings: storedSettings ?? createDefaultSettings(localUtcOffsetMinutes()),
      progress: progress ?? newProgress(nowMs),
      sessions,
      hadStoredSettings: storedSettings !== null,
    };
  };

  return {
    storage,
    load,
    saveSettings: (settings) => storage.saveSettings(settings),
    saveProgress: (progress) => storage.saveProgress(progress),
    putSession: (session) => storage.putSession(session),
    loadOpenBreak: () => storage.loadOpenBreak(),
    saveOpenBreak: (record) => storage.saveOpenBreak(record),
    clearOpenBreak: () => storage.clearOpenBreak(),
    async download() {
      const [profile, settings, progress, sessions] = await Promise.all([
        storage.loadProfile(),
        storage.loadSettings(),
        storage.loadProgress(),
        storage.listSessions({}),
      ]);
      const save: SaveFile = exportSaveFile({
        profile: profile ?? newProfile(Date.now()),
        settings: settings ?? createDefaultSettings(localUtcOffsetMinutes()),
        progress: progress ?? newProgress(Date.now()),
        sessions,
      });
      return serializeSaveFile(save);
    },
    async restore(json) {
      const parsed = parseSaveFile(json);
      if (!parsed.ok) return { ok: false, errors: parsed.errors };
      if (parsed.save.version !== SAVE_SCHEMA_VERSION) {
        return { ok: false, errors: [`unsupported schema version ${parsed.save.version}`] };
      }
      const current = await Promise.all([
        storage.loadProfile(),
        storage.loadSettings(),
        storage.loadProgress(),
        storage.listSessions({}),
      ]);
      const { save: merged } = mergeSaveFiles(
        {
          version: SAVE_SCHEMA_VERSION,
          app: 'puffly',
          exportedAt: Date.now(),
          profile: current[0] ?? newProfile(Date.now()),
          settings: current[1] ?? createDefaultSettings(localUtcOffsetMinutes()),
          progress: current[2] ?? newProgress(Date.now()),
          sessions: current[3],
        },
        parsed.save,
      );
      await storage.saveProfile(merged.profile);
      await storage.saveSettings(merged.settings);
      await storage.saveProgress(merged.progress);
      for (const session of merged.sessions) await storage.putSession(session);
      return { ok: true, errors: [] };
    },
    isDegraded() {
      return degraded;
    },
  };
}
