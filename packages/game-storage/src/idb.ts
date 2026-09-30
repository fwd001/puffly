/**
 * IndexedDB, with the raw platform API and nothing else — SPEC.md §50, §75.
 *
 * One database, five stores: three singletons (`profile`, `settings`, `progress`), the
 * append-only `sessions` log keyed by `id` with a `startedAt` index for §34's windowed
 * reads, and `meta`, which records the schema version so a later build can tell what it
 * is looking at. `migrations: Array<{ version, up }>` is the seam that makes a future
 * version possible without a rewrite (§50), and every failure surfaces as a rejected
 * promise with a `StorageError` code so §63's fallback can take over.
 */

import type { OpenBreak, Progress, Session, Settings, UserProfile } from '@puffly/game-core';
import {
  OPEN_BREAK_ID,
  RECORD_KEY,
  StorageError,
  applySessionFilter,
  type SessionFilter,
  type StorageAdapter,
  type StorageErrorCode,
} from './adapter';
import { cloneProgress, cloneSession, cloneSettings, cloneProfile } from './clone';
import { readProfile, readProgress, readSession, readSettings } from './validate';

export const PROFILE_STORE = 'profile';
export const SETTINGS_STORE = 'settings';
export const PROGRESS_STORE = 'progress';
export const SESSIONS_STORE = 'sessions';
export const META_STORE = 'meta';
/** §34/§54: the log is read newest-first, so the only index worth having is the clock. */
export const SESSION_STARTED_AT_INDEX = 'startedAt';
export const SCHEMA_META_ID = 'schema';

/** The `meta` row for an interrupted break: the store's key, then the record itself. */
interface OpenBreakRow {
  id: typeof OPEN_BREAK_ID;
  record: OpenBreak;
}

export interface IdbMigration {
  /** The schema version this migration produces. */
  readonly version: number;
  /** Runs inside the `versionchange` transaction; may create stores and indexes (§50). */
  up(database: IDBDatabase, transaction: IDBTransaction): void;
}

/** The v1 layout. Everything a later version needs must come from here. */
export function createStoresV1(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(PROFILE_STORE)) database.createObjectStore(PROFILE_STORE);
  if (!database.objectStoreNames.contains(SETTINGS_STORE))
    database.createObjectStore(SETTINGS_STORE);
  if (!database.objectStoreNames.contains(PROGRESS_STORE))
    database.createObjectStore(PROGRESS_STORE);
  if (!database.objectStoreNames.contains(META_STORE))
    database.createObjectStore(META_STORE, { keyPath: 'id' });
  if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
    const sessions = database.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
    if (!sessions.indexNames.contains(SESSION_STARTED_AT_INDEX)) {
      sessions.createIndex(SESSION_STARTED_AT_INDEX, 'startedAt', { unique: false });
    }
  }
}

export const BASE_IDB_MIGRATIONS: readonly IdbMigration[] = [
  { version: 1, up: (database) => createStoresV1(database) },
];

/** The schema version a build with no extra migrations opens at. */
export const CURRENT_IDB_SCHEMA_VERSION = 1;

/** A record that came off disk but no longer reads as a record (§63: report, do not crash). */
export interface StorageIssue {
  store: string;
  key: string;
  errors: string[];
}

export interface IdbStorageOptions {
  databaseName?: string;
  /** Appended to `BASE_IDB_MIGRATIONS`; versions must be unique and above the base one. */
  migrations?: readonly IdbMigration[];
  /** Inject a factory — tests pass fake-indexeddb's. Defaults to the platform's IndexedDB. */
  factory?: IDBFactory;
  /** Called for unreadable records instead of writing to a console (§63). */
  onIssue?: (issue: StorageIssue) => void;
}

export interface IdbStoreLayout {
  name: string;
  indexes: string[];
}

export interface IdbLayout {
  databaseName: string;
  version: number;
  stores: IdbStoreLayout[];
}

export interface IdbStorage extends StorageAdapter {
  readonly databaseName: string;
  /** The schema version this adapter opens (highest migration version). */
  readonly version: number;
  /** Opens and migrates the database; await it to know §63's state before drawing. */
  ready(): Promise<void>;
  /** Diagnostics for the migration runner's tests and for a settings screen. */
  layout(): Promise<IdbLayout>;
  close(): void;
  deleteDatabase(): Promise<void>;
}

const DEFAULT_DATABASE_NAME = 'puffly';

function listDomStringList(names: DOMStringList): string[] {
  const out: string[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const item = names.item(index);
    if (typeof item === 'string') out.push(item);
  }
  return out;
}

function requestFailure(code: StorageErrorCode, request: IDBRequest): StorageError {
  const error = request.error;
  return new StorageError(
    code,
    error === null ? 'IndexedDB request failed' : `${error.name}: ${error.message}`,
    error ?? undefined,
  );
}

function requestResult<T>(request: IDBRequest<T>, code: StorageErrorCode): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(requestFailure(code, request)));
  });
}

function transactionSettled(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('error', () => {
      const error = transaction.error;
      reject(
        new StorageError(
          'transaction-failed',
          error === null ? 'IndexedDB transaction failed' : `${error.name}: ${error.message}`,
          error ?? undefined,
        ),
      );
    });
    transaction.addEventListener('abort', () =>
      reject(
        new StorageError(
          'aborted',
          'IndexedDB transaction aborted',
          transaction.error ?? undefined,
        ),
      ),
    );
  });
}

function runMigrations(
  database: IDBDatabase,
  transaction: IDBTransaction,
  migrations: readonly IdbMigration[],
  fromVersion: number,
  targetVersion: number,
): void {
  const pending = migrations.filter((migration) => migration.version > fromVersion);
  for (const migration of pending) {
    try {
      migration.up(database, transaction);
    } catch (error) {
      // A migration that already knows how to classify its own failure keeps that code;
      // anything else is reported as a migration failure (§63).
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        'migration-failed',
        `migration ${String(migration.version)} failed`,
        error,
      );
    }
  }
  if (database.objectStoreNames.contains(META_STORE) && pending.length > 0) {
    transaction.objectStore(META_STORE).put({
      id: SCHEMA_META_ID,
      schemaVersion: targetVersion,
      migratedFrom: fromVersion,
    });
  }
}

function openDatabase(
  factory: IDBFactory,
  databaseName: string,
  targetVersion: number,
  migrations: readonly IdbMigration[],
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(databaseName, targetVersion);
    } catch (error) {
      reject(new StorageError('unavailable', 'IndexedDB refused to open this database', error));
      return;
    }
    request.addEventListener('upgradeneeded', (event) => {
      const transaction = request.transaction;
      if (transaction === null) return;
      try {
        runMigrations(request.result, transaction, migrations, event.oldVersion, targetVersion);
      } catch (error) {
        // Throwing out of the handler aborts the upgrade, which is exactly what we want:
        // half-migrated data must never be handed to the game (§63).
        reject(
          error instanceof Error
            ? error
            : new StorageError('migration-failed', 'migration failed', error),
        );
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(requestFailure('open-failed', request)));
    request.addEventListener('blocked', () =>
      reject(new StorageError('blocked', 'another tab is holding this database open')),
    );
    request.addEventListener('versionchange', () => {
      // A newer build asked for the database; let go so it can migrate (§50).
      if (request.transaction === null) {
        try {
          request.result.close();
        } catch {
          // nothing to do; the open promise has already settled
        }
      }
    });
  });
}

async function readSingleton<T>(
  connection: IDBDatabase,
  storeName: string,
  read: (value: unknown, path: string, errors: string[]) => T | null,
  onIssue: ((issue: StorageIssue) => void) | undefined,
): Promise<T | null> {
  const transaction = connection.transaction(storeName, 'readonly');
  const value = await requestResult<unknown>(
    transaction.objectStore(storeName).get(RECORD_KEY),
    'transaction-failed',
  );
  if (value === undefined || value === null) return null;
  const errors: string[] = [];
  const record = read(value, storeName, errors);
  if (record === null && onIssue !== undefined)
    onIssue({ store: storeName, key: RECORD_KEY, errors });
  return record;
}

export function createIdbStorage(options: IdbStorageOptions = {}): IdbStorage {
  const databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const extras = options.migrations ?? [];
  const migrations = sortMigrations([...BASE_IDB_MIGRATIONS, ...extras]);
  const targetVersion = migrations[migrations.length - 1]?.version ?? CURRENT_IDB_SCHEMA_VERSION;
  const injectedFactory = options.factory;
  const reportIssue = options.onIssue;

  let open: Promise<IDBDatabase> | null = null;

  /** A missing platform is a rejection, never a throw out of `createIdbStorage` (§63). */
  function resolveFactory(): IDBFactory {
    return injectedFactory ?? globalIDB();
  }

  function database(): Promise<IDBDatabase> {
    if (open === null) {
      try {
        open = openDatabase(resolveFactory(), databaseName, targetVersion, migrations);
      } catch (error) {
        return Promise.reject(
          error instanceof StorageError
            ? error
            : new StorageError('unavailable', 'IndexedDB is not usable here', error),
        );
      }
    }
    const pending = open;
    // A failed open is not cached forever: §63's recovery must be allowed to try again.
    return pending.catch((error: unknown) => {
      if (open === pending) open = null;
      throw error;
    });
  }

  async function write(storeName: string, value: unknown, key?: string): Promise<void> {
    const connection = await database();
    const transaction = connection.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    if (key === undefined) store.put(value);
    else store.put(value, key);
    await transactionSettled(transaction);
  }

  return {
    databaseName,
    version: targetVersion,

    ready: () => database().then(() => undefined),

    async layout(): Promise<IdbLayout> {
      const connection = await database();
      const names = listDomStringList(connection.objectStoreNames);
      const transaction = connection.transaction(names, 'readonly');
      const stores: IdbStoreLayout[] = [];
      for (const name of names) {
        stores.push({ name, indexes: listDomStringList(transaction.objectStore(name).indexNames) });
      }
      return { databaseName, version: connection.version, stores };
    },

    async loadProfile(): Promise<UserProfile | null> {
      return readSingleton(await database(), PROFILE_STORE, readProfile, reportIssue);
    },

    async saveProfile(profile: UserProfile): Promise<void> {
      await write(PROFILE_STORE, cloneProfile(profile), RECORD_KEY);
    },

    async loadSettings(): Promise<Settings | null> {
      return readSingleton(await database(), SETTINGS_STORE, readSettings, reportIssue);
    },

    async saveSettings(settings: Settings): Promise<void> {
      await write(SETTINGS_STORE, cloneSettings(settings), RECORD_KEY);
    },

    async loadProgress(): Promise<Progress | null> {
      return readSingleton(await database(), PROGRESS_STORE, readProgress, reportIssue);
    },

    async saveProgress(progress: Progress): Promise<void> {
      await write(PROGRESS_STORE, cloneProgress(progress), RECORD_KEY);
    },

    async loadOpenBreak(): Promise<OpenBreak | null> {
      const connection = await database();
      // A database opened before `meta` existed has nowhere to keep it; "no interrupted
      // break" is the honest answer rather than a failed open.
      if (!connection.objectStoreNames.contains(META_STORE)) return null;
      const transaction = connection.transaction(META_STORE, 'readonly');
      const value = await requestResult<OpenBreakRow | undefined>(
        transaction.objectStore(META_STORE).get(OPEN_BREAK_ID),
        'transaction-failed',
      );
      return value?.record ?? null;
    },

    async saveOpenBreak(record: OpenBreak): Promise<void> {
      const connection = await database();
      if (!connection.objectStoreNames.contains(META_STORE))
        throw new StorageError('unavailable', 'this database has no room for an open break');
      // Wrapped, not spread: `meta` is keyed by `id`, and the break has an id of its own.
      await write(META_STORE, { id: OPEN_BREAK_ID, record } satisfies OpenBreakRow);
    },

    async clearOpenBreak(): Promise<void> {
      const connection = await database();
      if (!connection.objectStoreNames.contains(META_STORE)) return;
      const transaction = connection.transaction(META_STORE, 'readwrite');
      transaction.objectStore(META_STORE).delete(OPEN_BREAK_ID);
      await transactionSettled(transaction);
    },

    async listSessions(filter?: SessionFilter): Promise<Session[]> {
      const connection = await database();
      const since =
        typeof filter?.since === 'number' && Number.isFinite(filter.since) ? filter.since : null;
      const limit =
        typeof filter?.limit === 'number' && Number.isFinite(filter.limit)
          ? Math.max(0, Math.floor(filter.limit))
          : null;
      const range = since === null ? null : IDBKeyRange.lowerBound(since, false);
      const transaction = connection.transaction(SESSIONS_STORE, 'readonly');
      const index = transaction.objectStore(SESSIONS_STORE).index(SESSION_STARTED_AT_INDEX);

      const found: Session[] = [];
      // `prev` walks `startedAt` newest-first, so a `limit` stops after the tail §34 needs.
      const cursorDone = new Promise<void>((resolve, reject) => {
        const cursorRequest = limit === 0 ? null : index.openCursor(range, 'prev');
        if (cursorRequest === null) {
          resolve();
          return;
        }
        cursorRequest.addEventListener('success', () => {
          const cursor = cursorRequest.result;
          if (cursor === null) {
            resolve();
            return;
          }
          const errors: string[] = [];
          const session = readSession(
            cursor.value,
            `sessions/${String(cursor.primaryKey)}`,
            errors,
          );
          if (session === null) {
            reportIssue?.({ store: SESSIONS_STORE, key: String(cursor.primaryKey), errors });
          } else {
            found.push(session);
          }
          if (limit !== null && found.length >= limit) resolve();
          else cursor.continue();
        });
        cursorRequest.addEventListener('error', () =>
          reject(requestFailure('transaction-failed', cursorRequest)),
        );
      });
      await cursorDone;
      return applySessionFilter(found, undefined);
    },

    async putSession(session: Session): Promise<void> {
      if (typeof session.id !== 'string' || session.id.length === 0) {
        throw new StorageError('invalid-record', 'a session needs an id before it can be stored');
      }
      if (!Number.isFinite(session.startedAt)) {
        throw new StorageError('invalid-record', `session ${session.id} has no usable startedAt`);
      }
      await write(SESSIONS_STORE, cloneSession(session));
    },

    async deleteSession(id: string): Promise<void> {
      if (typeof id !== 'string' || id.length === 0)
        throw new StorageError('invalid-record', 'no session id given');
      const connection = await database();
      const transaction = connection.transaction(SESSIONS_STORE, 'readwrite');
      transaction.objectStore(SESSIONS_STORE).delete(id);
      await transactionSettled(transaction);
    },

    /** The four record stores only: `meta` stays, because it describes the layout, not the player. */
    async clear(): Promise<void> {
      const connection = await database();
      const stores = [PROFILE_STORE, SETTINGS_STORE, PROGRESS_STORE, SESSIONS_STORE];
      // A transaction can only touch the stores it was opened with, and `meta` also carries
      // the schema marker: the interrupted break is deleted from it, never the whole store.
      const hasMeta = connection.objectStoreNames.contains(META_STORE);
      if (hasMeta) stores.push(META_STORE);
      const transaction = connection.transaction(stores, 'readwrite');
      for (const name of stores) {
        if (name !== META_STORE) transaction.objectStore(name).clear();
      }
      if (hasMeta) transaction.objectStore(META_STORE).delete(OPEN_BREAK_ID);
      await transactionSettled(transaction);
    },

    close(): void {
      const pending = open;
      open = null;
      if (pending !== null) {
        void pending.then(
          (connection) => connection.close(),
          () => undefined,
        );
      }
    },

    async deleteDatabase(): Promise<void> {
      const pending = open;
      open = null;
      if (pending !== null) {
        await pending.then(
          (connection) => {
            connection.close();
          },
          () => undefined,
        );
      }
      const factory = resolveFactory();
      await new Promise<void>((resolve, reject) => {
        const request = factory.deleteDatabase(databaseName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(requestFailure('transaction-failed', request)),
        );
        request.addEventListener('blocked', () =>
          reject(new StorageError('blocked', 'another tab is holding this database open')),
        );
      });
    },
  };
}

/** Ascending, unique versions: a duplicated version is a developer mistake, so it is loud. */
function sortMigrations(migrations: readonly IdbMigration[]): IdbMigration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous !== undefined && current !== undefined && previous.version === current.version) {
      throw new StorageError(
        'migration-failed',
        `two IndexedDB migrations both claim version ${String(current.version)}`,
      );
    }
  }
  return sorted;
}

/** Only this adapter is allowed to look for a platform database (§47, §50). */
function globalIDB(): IDBFactory {
  if (typeof indexedDB === 'undefined') {
    throw new StorageError(
      'unavailable',
      'this environment has no IndexedDB; use createMemoryStorage() (§63)',
    );
  }
  return indexedDB;
}
