/**
 * §63's fallback store, and the §72 reference implementation of `StorageAdapter`: the
 * same interface the IndexedDB adapter must satisfy, with no platform under it.
 */

import { describe, expect, it } from 'vitest';
import { StorageError, applySessionFilter, isStorageError, type StorageAdapter } from '../adapter';
import { createMemoryStorage } from '../memory';
import {
  at,
  makeChosenSettings,
  makeProfile,
  makeProgress,
  makeSave,
  makeSettings,
  sampleSessions,
} from './fixture';

describe('createMemoryStorage (§63)', () => {
  it('is a StorageAdapter, and starts empty', async () => {
    const adapter: StorageAdapter = createMemoryStorage();
    expect(await adapter.loadProfile()).toBeNull();
    expect(await adapter.loadSettings()).toBeNull();
    expect(await adapter.loadProgress()).toBeNull();
    expect(await adapter.listSessions()).toEqual([]);
  });

  it('round-trips the three records', async () => {
    const storage = createMemoryStorage();
    const profile = makeProfile({ displayName: 'Local' });
    const settings = makeChosenSettings();
    const progress = makeProgress();

    await storage.saveProfile(profile);
    await storage.saveSettings(settings);
    await storage.saveProgress(progress);

    expect(await storage.loadProfile()).toEqual(profile);
    expect(await storage.loadSettings()).toEqual(settings);
    expect(await storage.loadProgress()).toEqual(progress);
    expect(storage.size).toEqual({
      sessions: 0,
      hasProfile: true,
      hasSettings: true,
      hasProgress: true,
    });
  });

  it('stores and lists the session log newest-first', async () => {
    const storage = createMemoryStorage();
    for (const session of sampleSessions()) await storage.putSession(session);
    const listed = await storage.listSessions();
    expect(listed.map((session) => session.id)).toEqual(['ses-d', 'ses-c', 'ses-b', 'ses-a']);
    expect(storage.size.sessions).toBe(4);
  });

  it('filters by `since` and by `limit` the way §34 asks', async () => {
    const storage = createMemoryStorage({ sessions: sampleSessions() });
    const since = at(6, 0, 0);
    const recent = await storage.listSessions({ since });
    expect(recent.map((session) => session.id)).toEqual(['ses-d', 'ses-c']);

    const one = await storage.listSessions({ limit: 1 });
    expect(one.map((session) => session.id)).toEqual(['ses-d']);
    expect(await storage.listSessions({ limit: 0 })).toEqual([]);
    expect((await storage.listSessions({ since: at(5, 9, 1), limit: 2 })).map((s) => s.id)).toEqual(
      ['ses-d', 'ses-c'],
    );
  });

  it('replaces a session with the same id instead of duplicating it', async () => {
    const storage = createMemoryStorage();
    const [session] = sampleSessions();
    if (session === undefined) throw new Error('fixture lost a session');
    await storage.putSession(session);
    await storage.putSession({ ...session, completed: true });
    const listed = await storage.listSessions();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.completed).toBe(true);
  });

  it('deletes a session, and an unknown id is a no-op (§63: idempotent beats noisy)', async () => {
    const storage = createMemoryStorage({ sessions: sampleSessions() });
    await storage.deleteSession('ses-b');
    expect((await storage.listSessions()).map((session) => session.id)).toEqual([
      'ses-d',
      'ses-c',
      'ses-a',
    ]);
    await expect(storage.deleteSession('never-existed')).resolves.toBeUndefined();
  });

  it('keeps copies, so neither side can reach into the other', async () => {
    const storage = createMemoryStorage();
    const session = sampleSessions()[0];
    if (session === undefined) throw new Error('fixture lost a session');
    await storage.putSession(session);
    session.events.push({ id: 'afterwards', type: 'PUFF', timestamp: at(9, 9, 9) });
    session.cravingBefore = 0;

    const stored = (await storage.listSessions())[0];
    expect(stored?.events.some((event) => event.id === 'afterwards')).toBe(false);
    expect(stored?.cravingBefore).toBe(8);

    // and what comes back out is a copy too
    if (stored !== undefined) stored.targetMs = 1;
    expect((await storage.listSessions())[0]?.targetMs).toBe(180_000);
  });

  it('refuses a session with no id, as a StorageError (§63)', async () => {
    const storage = createMemoryStorage();
    const session = sampleSessions()[0];
    if (session === undefined) throw new Error('fixture lost a session');
    await expect(storage.putSession({ ...session, id: '' })).rejects.toBeInstanceOf(StorageError);
    try {
      await storage.putSession({ ...session, id: '' });
    } catch (error) {
      expect(isStorageError(error) && error.code).toBe('invalid-record');
    }
  });

  it('clears everything, because §52 says the player can', async () => {
    const storage = createMemoryStorage({
      profile: makeProfile(),
      settings: makeSettings(),
      progress: makeProgress(),
      sessions: sampleSessions(),
    });
    await storage.clear();
    expect(await storage.loadProfile()).toBeNull();
    expect(await storage.loadSettings()).toBeNull();
    expect(await storage.loadProgress()).toBeNull();
    expect(await storage.listSessions()).toEqual([]);
    expect(storage.size).toEqual({
      sessions: 0,
      hasProfile: false,
      hasSettings: false,
      hasProgress: false,
    });
    expect(storage.dump().sessions).toEqual([]);
  });

  it('seeds from a §51 save without aliasing it', async () => {
    const save = makeSave();
    const storage = createMemoryStorage({ ...save, sessions: save.sessions });
    expect((await storage.listSessions()).map((session) => session.id)).toEqual([
      'ses-d',
      'ses-c',
      'ses-b',
      'ses-a',
    ]);
    save.sessions.pop();
    expect((await storage.listSessions()).length).toBe(4);
  });

  it('orders and filters through the same helper the other adapters use', () => {
    const filtered = applySessionFilter(sampleSessions(), { since: at(5, 0, 0), limit: 3 });
    expect(filtered.map((session) => session.id)).toEqual(['ses-d', 'ses-c', 'ses-b']);
    expect(applySessionFilter([], { limit: 5 })).toEqual([]);
    expect(applySessionFilter(sampleSessions(), { since: at(20, 0, 0) })).toEqual([]);
  });
});
