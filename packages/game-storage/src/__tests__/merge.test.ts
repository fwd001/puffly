/**
 * §51: importing is a merge, not a replace. The invariant that matters is that nothing
 * the player ever did disappears — so the summary says exactly where every session went,
 * and a test can hold it to that.
 */

import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, type SaveFile, type Session } from '@puffly/game-core';
import { mergeSaveFiles, mergeSessionLogs } from '../merge';
import {
  at,
  makeChosenSettings,
  makeProfile,
  makeProgress,
  makeSave,
  makeSession,
  makeSettings,
  sampleSessions,
} from './fixture';

function sessionWith(id: string, startedAt: number, puffs: number, completed = false): Session {
  return makeSession({ id, startedAt, puffs, completed });
}

describe('mergeSaveFiles: the session log (§51)', () => {
  it('unions the two logs by id and keeps both sides', () => {
    const current = makeSave({
      sessions: [sessionWith('ses-a', at(5, 9, 0), 3), sessionWith('ses-b', at(6, 9, 0), 1)],
    });
    const incoming = makeSave({
      sessions: [sessionWith('ses-b', at(6, 9, 0), 1), sessionWith('ses-c', at(7, 9, 0), 2)],
    });
    const { save, summary } = mergeSaveFiles(current, incoming, { nowMs: at(8, 0, 0) });

    expect(save.sessions.map((session) => session.id)).toEqual(['ses-a', 'ses-b', 'ses-c']);
    expect(summary.totalSessions).toBe(3);
    expect(summary.keptSessionIds).toEqual(['ses-a']);
    expect(summary.addedSessionIds).toEqual(['ses-c']);
    expect(summary.replacedSessionIds).toEqual(['ses-b']);
    expect(summary.droppedSessions).toBe(0);
  });

  it('lets the incoming record win on a shared id, and says so', () => {
    const shared = sessionWith('ses-a', at(5, 9, 0), 1, false);
    const improved = sessionWith('ses-a', at(5, 9, 0), 9, true);
    const { save, summary } = mergeSaveFiles(
      makeSave({ sessions: [shared] }),
      makeSave({ sessions: [improved] }),
    );

    expect(save.sessions[0]?.events.filter((event) => event.type === 'PUFF')).toHaveLength(9);
    expect(save.sessions[0]?.completed).toBe(true);
    expect(summary.replacedSessionIds).toEqual(['ses-a']);
    expect(summary.addedSessionIds).toEqual([]);
  });

  it('loses nothing when one side is empty', () => {
    const full = makeSave({ sessions: sampleSessions() });
    const empty = makeSave({ sessions: [] });

    const importingEmpty = mergeSaveFiles(full, empty);
    expect(importingEmpty.save.sessions).toHaveLength(4);
    expect(importingEmpty.summary.keptSessionIds).toEqual(['ses-a', 'ses-b', 'ses-c', 'ses-d']);
    expect(importingEmpty.summary.droppedSessions).toBe(0);

    const ontoEmpty = mergeSaveFiles(empty, full);
    expect(ontoEmpty.save.sessions).toHaveLength(4);
    expect(ontoEmpty.summary.addedSessionIds).toEqual(['ses-a', 'ses-b', 'ses-c', 'ses-d']);
    expect(ontoEmpty.summary.keptSessionIds).toEqual([]);
  });

  it('is measured, not assumed: droppedSessions stays 0 for any pair', () => {
    const a = makeSave({
      sessions: [sessionWith('x', at(1, 1, 0), 1), sessionWith('y', at(2, 1, 0), 1)],
    });
    const b = makeSave({
      sessions: [sessionWith('y', at(2, 1, 0), 2), sessionWith('z', at(3, 1, 0), 3)],
    });
    const c = makeSave({ sessions: [sessionWith('z', at(3, 1, 0), 3)] });
    const ids = (save: SaveFile) => save.sessions.map((session) => session.id).sort();

    const ab = mergeSaveFiles(a, b);
    expect(ids(ab.save)).toEqual(['x', 'y', 'z']);
    const abc = mergeSaveFiles(ab.save, c);
    expect(ids(abc.save)).toEqual(['x', 'y', 'z']);
    expect(abc.summary.droppedSessions).toBe(0);
    expect(abc.save.sessions).toHaveLength(ids(abc.save).length);
  });

  it('sorts the log oldest first, so §34 reads it as a timeline', () => {
    const current = makeSave({
      sessions: [sessionWith('late', at(9, 9, 0), 1), sessionWith('early', at(1, 9, 0), 1)],
    });
    const incoming = makeSave({ sessions: [sessionWith('middle', at(5, 9, 0), 1)] });
    expect(mergeSaveFiles(current, incoming).save.sessions.map((session) => session.id)).toEqual([
      'early',
      'middle',
      'late',
    ]);
  });

  it('does not alias either input', () => {
    const current = makeSave();
    const incoming = makeSave({ sessions: [sessionWith('ses-z', at(9, 9, 0), 2)] });
    const { save } = mergeSaveFiles(current, incoming);
    const first = save.sessions[0];
    const moved = first?.startedAt;
    if (current.sessions[0] === undefined || first === undefined)
      throw new Error('fixture lost a session');
    current.sessions[0].startedAt = at(20, 0, 0);
    current.sessions[0].events = [];
    incoming.sessions[0] = sessionWith('ses-z', at(30, 9, 0), 2);

    expect(save.sessions[0]?.startedAt).toBe(moved);
    expect(save.sessions[0]?.events.length).toBeGreaterThan(0);
  });
});

describe('mergeSaveFiles: the rest of the save (§37, §51, §52)', () => {
  it('keeps the earliest progress.startedAt, because that is the player day 1', () => {
    const current = makeSave({ progress: makeProgress({ startedAt: at(5, 9, 0) }) });
    const incoming = makeSave({ progress: makeProgress({ startedAt: at(2, 20, 0) }) });
    const { save, summary } = mergeSaveFiles(current, incoming);
    expect(save.progress.startedAt).toBe(at(2, 20, 0));
    expect(summary.progressStartedAtMs).toBe(at(2, 20, 0));

    const reversed = mergeSaveFiles(incoming, current);
    expect(reversed.save.progress.startedAt).toBe(at(2, 20, 0));
  });

  it('takes the wider of each progress number and unions the collections', () => {
    const current = makeSave({
      progress: makeProgress({
        dayNumber: 4,
        sessions: 4,
        puffs: 9,
        longestStreakDays: 3,
        unlocked: { ...makeProgress().unlocked, cigarettes: ['test-rod'], smoke: [] },
        acknowledgedUnlocks: ['cigarettes:test-rod'],
        activeDays: ['2026-01-05', '2026-01-06'],
        lastActiveDayKey: '2026-01-06',
      }),
    });
    const incoming = makeSave({
      progress: makeProgress({
        dayNumber: 9,
        sessions: 12,
        puffs: 30,
        longestStreakDays: 6,
        unlocked: {
          ...makeProgress().unlocked,
          cigarettes: ['test-long'],
          lighters: ['test-lighter'],
        },
        acknowledgedUnlocks: ['lighters:test-lighter'],
        activeDays: ['2026-01-08', '2026-01-06'],
        lastActiveDayKey: '2026-01-08',
      }),
    });
    const { save } = mergeSaveFiles(current, incoming);
    expect(save.progress.dayNumber).toBe(9);
    expect(save.progress.sessions).toBe(12);
    expect(save.progress.puffs).toBe(30);
    expect(save.progress.longestStreakDays).toBe(6);
    expect(save.progress.unlocked.cigarettes).toEqual(['test-long', 'test-rod']);
    expect(save.progress.unlocked.lighters).toEqual(['test-lighter']);
    expect(save.progress.acknowledgedUnlocks).toEqual([
      'cigarettes:test-rod',
      'lighters:test-lighter',
    ]);
    expect(save.progress.activeDays).toEqual(['2026-01-05', '2026-01-06', '2026-01-08']);
    expect(save.progress.lastActiveDayKey).toBe('2026-01-08');
  });

  it('prefers the older profile and the incoming settings', () => {
    const current = makeSave({
      profile: makeProfile({ id: 'pro-current', createdAt: at(5, 8, 0) }),
      settings: makeSettings(),
    });
    const incoming = makeSave({
      profile: makeProfile({ id: 'pro-incoming', createdAt: at(1, 8, 0), displayName: 'Older' }),
      settings: { ...makeChosenSettings(), muted: true, sessionTargetMs: 300_000 },
    });
    const { save, summary } = mergeSaveFiles(current, incoming);
    expect(save.profile.id).toBe('pro-incoming');
    expect(summary.profileIdSource).toBe('incoming');
    expect(save.settings.muted).toBe(true);
    expect(save.settings.sessionTargetMs).toBe(300_000);
    // Importing on a second device is the same statement of taste: neither the rod in the hand
    // nor the language asked for may reset on the way through a merge.
    expect(save.settings.language).toBe('zh-CN');
    expect(save.settings.selection?.cigarette).toBe('long-thin');
    // and the other way round, the current profile is the older one
    expect(mergeSaveFiles(incoming, current).summary.profileIdSource).toBe('current');
  });

  it('writes a version this build understands, at a clock it was given', () => {
    const { save } = mergeSaveFiles(makeSave(), makeSave({ sessions: [] }), {
      nowMs: at(10, 10, 0),
    });
    expect(save.version).toBe(SAVE_SCHEMA_VERSION);
    expect(save.app).toBe('puffly');
    expect(save.exportedAt).toBe(at(10, 10, 0));
    expect(mergeSaveFiles(makeSave(), makeSave()).save.exportedAt).toBeGreaterThan(0);
  });
});

describe('mergeSessionLogs', () => {
  it('is the same union rule without the envelope', () => {
    const merged = mergeSessionLogs(
      [sessionWith('a', at(1, 0, 0), 1)],
      [sessionWith('b', at(2, 0, 0), 1), sessionWith('a', at(1, 0, 0), 4)],
    );
    expect(merged.map((session) => session.id)).toEqual(['a', 'b']);
    expect(merged[0]?.events.filter((event) => event.type === 'PUFF')).toHaveLength(4);
  });
});
