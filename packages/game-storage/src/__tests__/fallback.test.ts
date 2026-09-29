/**
 * §63: "如果 Storage 出错：使用内存 fallback，并提供恢复".
 *
 * The wrapper must never surface a technical error to the player: a failing primary is
 * retried against the fallback, reported through an injectable callback (not a console
 * line), flagged by `degraded` so the shell can show a dot, and recoverable once the
 * primary answers again — with the writes it missed replayed.
 */

import { describe, expect, it } from 'vitest';
import type { Progress, Session, Settings, UserProfile } from '@puffly/game-core';
import { StorageError, type SessionFilter, type StorageAdapter } from '../adapter';
import {
  createFallbackStorage,
  createUnavailableStorage,
  withMemoryFallback,
  type StorageCallName,
  type StorageFailure,
} from '../fallback';
import { at, makeProfile, makeProgress, makeSettings, sampleSessions } from './fixture';

interface FakeState {
  broken: boolean;
  calls: StorageCallName[];
  profile: UserProfile | null;
  settings: Settings | null;
  progress: Progress | null;
  sessions: Map<string, Session>;
}

function fakeStorage(state: FakeState): StorageAdapter {
  const guard = <T>(name: StorageCallName, run: () => T): Promise<T> => {
    state.calls.push(name);
    if (state.broken)
      return Promise.reject(new StorageError('unavailable', `${name} is not answering`));
    return Promise.resolve(run());
  };
  return {
    loadProfile: () => guard('loadProfile', () => state.profile),
    saveProfile: (profile) => guard('saveProfile', () => void (state.profile = profile)),
    loadSettings: () => guard('loadSettings', () => state.settings),
    saveSettings: (settings) => guard('saveSettings', () => void (state.settings = settings)),
    loadProgress: () => guard('loadProgress', () => state.progress),
    saveProgress: (progress) => guard('saveProgress', () => void (state.progress = progress)),
    listSessions: (filter?: SessionFilter) =>
      guard('listSessions', () => {
        const all = [...state.sessions.values()];
        const since = filter?.since;
        const limited = typeof since === 'number' ? all.filter((s) => s.startedAt >= since) : all;
        const sorted = [...limited].sort((a, b) => b.startedAt - a.startedAt);
        return typeof filter?.limit === 'number' ? sorted.slice(0, filter.limit) : sorted;
      }),
    putSession: (session) =>
      guard('putSession', () => void state.sessions.set(session.id, session)),
    deleteSession: (id) => guard('deleteSession', () => void state.sessions.delete(id)),
    clear: () =>
      guard('clear', () => {
        state.profile = null;
        state.settings = null;
        state.progress = null;
        state.sessions.clear();
      }),
  };
}

function freshState(): FakeState {
  return {
    broken: false,
    calls: [],
    profile: null,
    settings: null,
    progress: null,
    sessions: new Map(),
  };
}

const CLOCK = () => at(9, 12, 0);

describe('createFallbackStorage: the happy path', () => {
  it('passes everything through to the primary and stays healthy', async () => {
    const primary = freshState();
    const fallback = freshState();
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      nowMs: CLOCK,
    });

    await storage.saveSettings(makeSettings());
    expect(primary.settings).toEqual(makeSettings());
    // §63: the fallback is kept warm by a mirror, so a store that dies mid-session never
    // takes the records that came before it along.
    expect(fallback.settings).toEqual(makeSettings());
    expect(storage.degraded).toBe(false);
    expect(storage.failures).toEqual([]);
    expect(await storage.loadSettings()).toEqual(makeSettings());
  });
});

describe('createFallbackStorage: a primary that fails (§63)', () => {
  it('answers from the fallback, reports once and never throws', async () => {
    const primary = freshState();
    const fallback = freshState();
    fallback.settings = makeSettings();
    const failures: StorageFailure[] = [];
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      onError: (failure) => failures.push(failure),
      nowMs: CLOCK,
    });
    primary.broken = true;

    await expect(storage.loadSettings()).resolves.toEqual(makeSettings());
    expect(storage.degraded).toBe(true);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({
      method: 'loadSettings',
      code: 'unavailable',
      message: 'loadSettings is not answering',
      recovered: true,
      atMs: at(9, 12, 0),
    });
  });

  it('buffers writes made while degraded, and shows them in the log anyway', async () => {
    const primary = freshState();
    const fallback = freshState();
    const failures: StorageFailure[] = [];
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      onError: (failure) => failures.push(failure),
    });
    const sessions = sampleSessions();
    const first = sessions[0];
    if (first === undefined) throw new Error('fixture lost a session');

    await storage.putSession(first); // primary still healthy
    // ...and the fallback is kept warm by a mirror, so a store that dies mid-session
    // does not take yesterday's log with it (§63).
    expect([...fallback.sessions.keys()]).toEqual(['ses-a']);
    primary.broken = true;
    const second = sessions[1];
    if (second === undefined) throw new Error('fixture lost a session');
    await storage.putSession(second);

    expect(storage.degraded).toBe(true);
    expect(storage.bufferedCount).toBe(1);
    // the journey line must not lose a session that only reached the fallback
    expect((await storage.listSessions()).map((session) => session.id).sort()).toEqual([
      'ses-a',
      'ses-b',
    ]);

    // sticky: while degraded the failing primary is not asked again
    const callsBefore = primary.calls.length;
    await storage.listSessions();
    expect(primary.calls.length).toBe(callsBefore);
  });

  it('re-tries the primary on every call when sticky is off', async () => {
    const primary = freshState();
    const fallback = freshState();
    primary.broken = true;
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      sticky: false,
      onError: () => undefined,
    });

    await storage.listSessions();
    const afterFirst = primary.calls.length;
    await storage.listSessions();
    expect(primary.calls.length).toBe(afterFirst + 1);
    expect(storage.degraded).toBe(true);
  });

  it('reports an unrecovered failure when both stores are down', async () => {
    const primary = freshState();
    const fallback = freshState();
    primary.broken = true;
    fallback.broken = true;
    const failures: StorageFailure[] = [];
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      onError: (failure) => failures.push(failure),
    });

    await expect(storage.listSessions()).rejects.toBeInstanceOf(StorageError);
    expect(failures.map((failure) => failure.recovered)).toEqual([true, false]);
    expect(failures[1]?.method).toBe('listSessions');
    expect(storage.degraded).toBe(true);
  });
});

describe('createFallbackStorage: recovery (§63 "并提供恢复")', () => {
  it('replays the journal onto the primary and clears degraded', async () => {
    const primary = freshState();
    const fallback = freshState();
    const recovered: { atMs: number; replayedSessions: number; replayedRecords: number }[] = [];
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      nowMs: CLOCK,
      onError: () => undefined,
      onRecovered: (info) => recovered.push(info),
    });

    primary.broken = true;
    const settings = { ...makeSettings(), volume: 0.2 };
    await storage.saveSettings(settings);
    await storage.saveProgress(makeProgress());
    for (const session of sampleSessions()) await storage.putSession(session);
    expect(storage.bufferedCount).toBe(6);
    expect(primary.settings).toBeNull();

    primary.broken = false;
    await expect(storage.recover()).resolves.toBe(true);

    expect(storage.degraded).toBe(false);
    expect(storage.bufferedCount).toBe(0);
    expect(primary.settings).toEqual(settings);
    expect(primary.progress?.dayNumber).toBe(4);
    expect([...primary.sessions.keys()].sort()).toEqual(['ses-a', 'ses-b', 'ses-c', 'ses-d']);
    expect(recovered).toEqual([{ atMs: at(9, 12, 0), replayedSessions: 4, replayedRecords: 2 }]);
    // and normal service resumes through the primary
    expect(await storage.loadSettings()).toEqual(settings);
  });

  it('keeps everything buffered when the primary is still down', async () => {
    const primary = freshState();
    const fallback = freshState();
    const failures: StorageFailure[] = [];
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      onError: (failure) => failures.push(failure),
    });
    const first = sampleSessions()[0];
    if (first === undefined) throw new Error('fixture lost a session');

    primary.broken = true;
    await storage.putSession(first);
    expect(storage.degraded).toBe(true);

    await expect(storage.recover()).resolves.toBe(false);
    expect(storage.degraded).toBe(true);
    expect(storage.bufferedCount).toBe(1);
    expect(failures.some((failure) => failure.method === 'recover')).toBe(true);

    // when it comes back, the buffered session still lands
    primary.broken = false;
    await expect(storage.recover()).resolves.toBe(true);
    expect([...primary.sessions.keys()]).toEqual(['ses-a']);
  });

  it('is a no-op while healthy', async () => {
    const primary = freshState();
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(freshState()), {
      onError: () => undefined,
    });
    await expect(storage.recover()).resolves.toBe(true);
    expect(primary.calls).toEqual([]);
  });
});

describe('withMemoryFallback and createUnavailableStorage', () => {
  it('keeps a whole session working when the platform store never answers', async () => {
    const unavailable = createUnavailableStorage('this browser blocked IndexedDB');
    const failures: StorageFailure[] = [];
    const { storage, fallback } = withMemoryFallback(unavailable, {
      onError: (failure) => failures.push(failure),
    });

    const [first] = sampleSessions();
    if (first === undefined) throw new Error('fixture lost a session');
    await storage.saveProfile(makeProfile());
    await storage.putSession(first);
    await storage.saveSettings(makeSettings());

    expect(storage.degraded).toBe(true);
    expect(failures.every((failure) => failure.recovered)).toBe(true);
    expect((await storage.loadProfile())?.id).toBe('pro-local-1');
    expect((await storage.listSessions()).map((session) => session.id)).toEqual(['ses-a']);
    expect(fallback.size.sessions).toBe(1);
  });

  it('rejects an unavailable store straight through, with a code (§63)', async () => {
    const unavailable = createUnavailableStorage();
    const error = await unavailable.saveProfile(makeProfile()).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect(error instanceof StorageError && error.code).toBe('unavailable');
  });

  it('clearing while degraded replays as a clear', async () => {
    const primary = freshState();
    const fallback = freshState();
    primary.sessions.set('ses-old', sampleSessions()[0] ?? makeSessionless());
    const storage = createFallbackStorage(fakeStorage(primary), fakeStorage(fallback), {
      onError: () => undefined,
    });
    primary.broken = true;
    await storage.clear();
    expect(storage.bufferedCount).toBe(1);

    primary.broken = false;
    await expect(storage.recover()).resolves.toBe(true);
    expect(primary.sessions.size).toBe(0);
  });
});

/** A clearer failure than `!` inside a test. */
function makeSessionless(): never {
  throw new Error('fixture lost a session');
}
