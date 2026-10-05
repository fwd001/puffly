/**
 * @vitest-environment jsdom
 */

/**
 * The IndexedDB adapter against `fake-indexeddb` (§72): a round trip through the real
 * request/transaction API, the `startedAt` index behind §34's windowed reads, the
 * `migrations: Array<{ version, up }>` runner, and the rejection shapes §63 depends on.
 */

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { StorageError } from '../adapter';
import {
  BASE_IDB_MIGRATIONS,
  SCHEMA_META_ID,
  META_STORE,
  PROFILE_STORE,
  SESSIONS_STORE,
  SESSION_STARTED_AT_INDEX,
  SETTINGS_STORE,
  PROGRESS_STORE,
  createIdbStorage,
  type IdbMigration,
  type IdbStorage,
  type StorageIssue,
} from '../idb';
import {
  at,
  makeChosenSettings,
  makeProfile,
  makeProgress,
  makeSave,
  makeSettings,
  sampleSessions,
} from './fixture';

/** Every test gets its own database, so none of them can see another's stores. */
let counter = 0;
function uniqueName(stem: string): string {
  counter += 1;
  return `puffly-test-${stem}-${String(counter)}`;
}

function storesOf(layout: { stores: { name: string }[] }): string[] {
  return layout.stores.map((store) => store.name).sort();
}

/** A raw open, so a test can look at what the adapter wrote without using its own code. */
function openRaw(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(new Error('the raw open failed')));
  });
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(new Error('the raw read failed')));
  });
}

describe('createIdbStorage: the v1 layout (§50)', () => {
  it('creates one database with the four record stores plus a schema marker', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('layout') });
    const layout = await storage.layout();
    expect(storesOf(layout)).toEqual(
      [META_STORE, PROFILE_STORE, PROGRESS_STORE, SESSIONS_STORE, SETTINGS_STORE].sort(),
    );
    expect(layout.version).toBe(1);
    const sessions = layout.stores.find((store) => store.name === SESSIONS_STORE);
    expect(sessions?.indexes).toEqual([SESSION_STARTED_AT_INDEX]);
    expect(storage.version).toBe(1);
    storage.close();
  });

  it('is ready before the first read and satisfies the seam', async () => {
    const storage: StorageAdapter & IdbStorage = createIdbStorage({
      databaseName: uniqueName('ready'),
    });
    await expect(storage.ready()).resolves.toBeUndefined();
    expect(await storage.listSessions()).toEqual([]);
    storage.close();
  });

  it('opens with the base migrations only', () => {
    expect(BASE_IDB_MIGRATIONS.map((migration) => migration.version)).toEqual([1]);
  });
});

describe('createIdbStorage: round trips', () => {
  it('stores and reads the three singleton records', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('singletons') });
    const profile = makeProfile({ displayName: 'Local' });
    const settings = makeChosenSettings();
    const progress = makeProgress();

    await storage.saveProfile(profile);
    await storage.saveSettings(settings);
    await storage.saveProgress(progress);

    expect(await storage.loadProfile()).toEqual(profile);
    expect(await storage.loadSettings()).toEqual(settings);
    expect(await storage.loadProgress()).toEqual(progress);
    storage.close();
  });

  it('returns null for a record that was never stored', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('empty') });
    expect(await storage.loadProfile()).toBeNull();
    expect(await storage.loadSettings()).toBeNull();
    expect(await storage.loadProgress()).toBeNull();
    storage.close();
  });

  it('round-trips the session log through structured storage', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('sessions') });
    const sessions = sampleSessions();
    for (const session of sessions) await storage.putSession(session);

    const listed = await storage.listSessions();
    expect(listed.map((session) => session.id)).toEqual(['ses-d', 'ses-c', 'ses-b', 'ses-a']);
    expect(listed[0]).toEqual(sessions[3]);
    storage.close();
  });

  it('uses the startedAt index for since and limit', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('index') });
    for (const session of sampleSessions()) await storage.putSession(session);

    expect((await storage.listSessions({ since: at(6, 0, 0) })).map((s) => s.id)).toEqual([
      'ses-d',
      'ses-c',
    ]);
    expect((await storage.listSessions({ limit: 2 })).map((s) => s.id)).toEqual(['ses-d', 'ses-c']);
    expect((await storage.listSessions({ limit: 1, since: at(5, 0, 0) })).map((s) => s.id)).toEqual(
      ['ses-d'],
    );
    expect(await storage.listSessions({ limit: 0 })).toEqual([]);
    expect(await storage.listSessions({ since: at(20, 0, 0) })).toEqual([]);
    storage.close();
  });

  it('replaces a session by id rather than appending a duplicate', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('replace') });
    const sessions = sampleSessions();
    const first = sessions[0];
    if (first === undefined) throw new Error('fixture lost a session');
    await storage.putSession(first);
    await storage.putSession({ ...first, completed: true, cravingBefore: 2 });

    const listed = await storage.listSessions();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.completed).toBe(true);
    expect(listed[0]?.cravingBefore).toBe(2);
    storage.close();
  });

  it('deletes one session and clears them all (§52)', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('delete') });
    for (const session of sampleSessions()) await storage.putSession(session);
    await storage.saveProfile(makeProfile());

    await storage.deleteSession('ses-b');
    expect((await storage.listSessions()).map((s) => s.id)).toEqual(['ses-d', 'ses-c', 'ses-a']);

    await storage.clear();
    expect(await storage.listSessions()).toEqual([]);
    expect(await storage.loadProfile()).toBeNull();
    // the layout survives a clear: only the player's records go
    expect(storesOf(await storage.layout())).toContain(SESSIONS_STORE);
    storage.close();
  });

  it('survives closing and reopening the same database', async () => {
    const name = uniqueName('reopen');
    const first = createIdbStorage({ databaseName: name });
    await first.saveSettings(makeSettings());
    await first.putSession(sampleSessions()[0] ?? firstSessionFallback());
    first.close();

    const second = createIdbStorage({ databaseName: name });
    expect(await second.loadSettings()).toEqual(makeSettings());
    expect((await second.listSessions()).map((s) => s.id)).toEqual(['ses-a']);
    second.close();
  });

  it('drops the database entirely', async () => {
    const name = uniqueName('drop');
    const storage = createIdbStorage({ databaseName: name });
    await storage.saveProgress(makeProgress());
    await storage.deleteDatabase();

    const rebuilt = createIdbStorage({ databaseName: name });
    expect(await rebuilt.loadProgress()).toBeNull();
    rebuilt.close();
  });
});

describe('createIdbStorage: the migration runner (§50)', () => {
  it('runs a new version once, and only for databases that need it', async () => {
    const name = uniqueName('migrate');
    let runs = 0;
    const archive: IdbMigration = {
      version: 2,
      up(database) {
        runs += 1;
        if (!database.objectStoreNames.contains('archive')) database.createObjectStore('archive');
      },
    };

    const upgraded = createIdbStorage({ databaseName: name, migrations: [archive] });
    expect(upgraded.version).toBe(2);
    const layout = await upgraded.layout();
    expect(layout.version).toBe(2);
    expect(storesOf(layout)).toContain('archive');
    expect(runs).toBe(1);
    upgraded.close();

    // Reopening the same database must not run the upgrade again.
    const again = createIdbStorage({ databaseName: name, migrations: [archive] });
    await again.ready();
    expect(runs).toBe(1);
    expect(storesOf(await again.layout())).toContain('archive');
    again.close();
  });

  it('records the schema version in the meta store', async () => {
    const name = uniqueName('meta');
    const marker: IdbMigration = {
      version: 3,
      up(database) {
        if (!database.objectStoreNames.contains('notes')) database.createObjectStore('notes');
      },
    };
    const storage = createIdbStorage({ databaseName: name, migrations: [marker] });
    await storage.ready();
    storage.close();

    expect(storesOf(await storage.layout())).toEqual(
      ['notes', META_STORE, PROFILE_STORE, PROGRESS_STORE, SESSIONS_STORE, SETTINGS_STORE].sort(),
    );
    // the runner wrote its own record, so a later build can tell what it is holding
    const connection = await openRaw(name, 3);
    const meta = await readRequest<unknown>(
      connection.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(SCHEMA_META_ID),
    );
    connection.close();
    expect(meta).toMatchObject({ id: SCHEMA_META_ID, schemaVersion: 3, migratedFrom: 0 });
  });

  it('refuses to open a database that is newer than this build', async () => {
    const name = uniqueName('future');
    const ahead = createIdbStorage({
      databaseName: name,
      migrations: [{ version: 4, up: (database) => void database.createObjectStore('ahead') }],
    });
    await ahead.ready();
    ahead.close();

    const behind = createIdbStorage({ databaseName: name });
    await expect(behind.ready()).rejects.toBeInstanceOf(StorageError);
    behind.close();
  });

  it('aborts the transaction when a migration throws, and reports it (§63)', async () => {
    const storage = createIdbStorage({
      databaseName: uniqueName('broken-migration'),
      migrations: [
        {
          version: 2,
          up() {
            throw new Error('this version is not implementable');
          },
        },
      ],
    });
    const error = await storage.ready().then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect(error instanceof StorageError && error.code).toBe('migration-failed');
  });

  it('rejects a migration list that claims the same version twice (§74)', () => {
    expect(() =>
      createIdbStorage({
        databaseName: uniqueName('duplicate'),
        migrations: [
          { version: 2, up: () => undefined },
          { version: 2, up: () => undefined },
        ],
      }),
    ).toThrow(StorageError);
  });
});

describe('createIdbStorage: rejects that §63 can act on', () => {
  it('refuses a session it could never index', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('invalid') });
    const sessions = sampleSessions();
    const first = sessions[0];
    if (first === undefined) throw new Error('fixture lost a session');

    await expect(storage.putSession({ ...first, id: '' })).rejects.toBeInstanceOf(StorageError);
    await expect(storage.putSession({ ...first, startedAt: Number.NaN })).rejects.toMatchObject({
      code: 'invalid-record',
    });
    await expect(storage.deleteSession('')).rejects.toMatchObject({ code: 'invalid-record' });
    storage.close();
  });

  it('reports a record it cannot read instead of serving a broken session', async () => {
    const name = uniqueName('corrupt');
    const issues: StorageIssue[] = [];
    const storage = createIdbStorage({
      databaseName: name,
      onIssue: (issue) => issues.push(issue),
    });
    await storage.putSession(sampleSessions()[0] ?? firstSessionFallback());

    // Write a record that cannot be a session: no clock, junk shape.
    const connection = await openRaw(name, 1);
    const transaction = connection.transaction(SESSIONS_STORE, 'readwrite');
    transaction.objectStore(SESSIONS_STORE).put({ id: 'bogus', startedAt: 'not-a-number' });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () =>
        reject(new Error('the write should have settled')),
      );
    });
    connection.close();

    const listed = await storage.listSessions();
    expect(listed.map((session) => session.id)).toEqual(['ses-a']);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.store).toBe(SESSIONS_STORE);
    expect(issues[0]?.errors.join(' | ')).toContain('startedAt');
    storage.close();
  });

  it('does not throw out of `createIdbStorage` when the store is unusable (§63)', async () => {
    // A migration that cannot run stands in for a browser that refused the database:
    // the failure must arrive as a rejection the §63 fallback can react to.
    const storage = createIdbStorage({
      databaseName: uniqueName('unusable'),
      migrations: [
        {
          version: 2,
          up() {
            throw new StorageError('unavailable', 'this browser blocked IndexedDB');
          },
        },
      ],
    });
    const error = await storage.listSessions().then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect(error instanceof StorageError && error.code).toBe('unavailable');
    storage.close();
  });

  it('exports the whole store as a §51 save', async () => {
    const storage = createIdbStorage({ databaseName: uniqueName('export') });
    const save = makeSave();
    await storage.saveProfile(save.profile);
    await storage.saveSettings(save.settings);
    await storage.saveProgress(save.progress);
    for (const session of save.sessions) await storage.putSession(session);

    expect({
      version: save.version,
      app: save.app,
      exportedAt: save.exportedAt,
      profile: await storage.loadProfile(),
      settings: await storage.loadSettings(),
      progress: await storage.loadProgress(),
      sessions: (await storage.listSessions()).slice().reverse(),
    }).toEqual(save);
    storage.close();
  });
});

/** A clear failure rather than a `!` in the middle of an assertion. */
function firstSessionFallback(): never {
  throw new Error('fixture lost ses-a');
}
