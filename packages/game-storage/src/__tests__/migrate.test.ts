/**
 * §51's schema ladder. The fixture in `fixture.ts` is a synthetic version 0 export — the
 * shape a first-build player would still have on disk — and these tests are the proof
 * that importing it neither throws nor loses the session log.
 */

import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, SessionEventType } from '@puffly/game-core';
import {
  SAVE_MIGRATIONS,
  UPGRADE_V0_TO_V1,
  isCurrentVersion,
  migrateSaveFile,
  migrationFor,
  saveFileVersion,
  supportedVersions,
} from '../migrate';
import { parseSaveFile, serializeSaveFile } from '../save';
import { isRecord } from '../validate';
import { at, makeSave, saveFileV0 } from './fixture';

function expectOk(result: ReturnType<typeof migrateSaveFile>) {
  if (!result.ok) throw new Error(`expected a clean migration, got: ${result.errors.join(' | ')}`);
  return result.save;
}

describe('migrateSaveFile: version 0 -> 1 (§51)', () => {
  const legacy = saveFileV0();
  const save = expectOk(migrateSaveFile(legacy));

  it('lands on the version this build writes', () => {
    expect(save.version).toBe(SAVE_SCHEMA_VERSION);
    expect(save.app).toBe('puffly');
    expect(save.exportedAt).toBe(at(3, 18, 0));
    expect(isCurrentVersion(legacy)).toBe(false);
    expect(isCurrentVersion(save)).toBe(true);
  });

  it('drops the stored counters, because §70 derives them', () => {
    expect('stats' in save).toBe(false);
    expect(Object.keys(save).sort()).toEqual([
      'app',
      'exportedAt',
      'profile',
      'progress',
      'sessions',
      'settings',
      'version',
    ]);
  });

  it('keeps every legacy session', () => {
    expect(save.sessions).toHaveLength(2);
    expect(save.sessions.map((session) => session.id)).toEqual(['ses-legacy-1', 'ses-legacy-2']);
  });

  it('adds the §71 replay fields a version 0 session never had', () => {
    const first = save.sessions[0];
    if (first === undefined) throw new Error('the legacy session disappeared');
    expect(first.inputs).toEqual([]);
    expect(first.engineStartWallClockMs).toBe(first.startedAt);
    expect(first.startedAtEngineMs).toBe(0);
    expect(first.triggers).toEqual([]);
    // v0 stored `durationMs`; §68 stores an end timestamp.
    expect(first.endedAt).toBe(first.startedAt + 90_000);
    // v0 had no `completed` flag: it is derived from the §31 target event.
    expect(first.completed).toBe(true);
    expect(save.sessions[1]?.completed).toBe(false);
  });

  it("flattens v0's single craving object into §32's two numbers", () => {
    const first = save.sessions[0];
    if (!isRecord(first)) throw new Error('the legacy session disappeared');
    expect(first['cravingBefore']).toBe(7);
    expect(first['cravingAfter']).toBe(2);
    expect('craving' in first).toBe(false);
  });

  it('renames the progress fields §37 grew out of', () => {
    expect(save.progress.version).toBe(1);
    expect(save.progress.ashDropped).toBe(1); // v0 called it `ashes`
    expect(save.progress.longestStreakDays).toBe(2); // v0 called it `streak`
    expect(save.progress.unlocked.cigarettes).toEqual(['test-rod']); // v0 called it `collection`
    expect(save.progress.acknowledgedUnlocks).toEqual([]);
    expect(save.progress.lastActiveDayKey).toBe('2026-01-03'); // v0 called it `lastDay`
    expect(save.progress.startedAt).toBe(at(2, 20, 0));
  });

  it('round-trips afterwards: the migrated file serialises and re-parses identically', () => {
    const again = parseSaveFile(serializeSaveFile(save));
    if (!again.ok)
      throw new Error(`the migrated file refused to re-parse: ${again.errors.join(' | ')}`);
    expect(again.save).toEqual(save);
    // and migrating a file that is already current is a no-op
    expect(expectOk(migrateSaveFile(save))).toEqual(save);
  });

  it('accepts the legacy file straight from a string, as an import would', () => {
    const fromDisk = parseSaveFile(JSON.stringify(saveFileV0()));
    if (!fromDisk.ok) throw new Error(`import refused: ${fromDisk.errors.join(' | ')}`);
    expect(fromDisk.save.sessions[0]?.targetMs).toBe(180_000);
  });
});

describe('the migration runner itself (§50, §51)', () => {
  it('knows one step, and says which versions it can read', () => {
    expect(SAVE_MIGRATIONS).toHaveLength(1);
    expect(migrationFor(0)).toBe(UPGRADE_V0_TO_V1);
    expect(migrationFor(1)).toBeNull();
    expect(supportedVersions()).toEqual([0, 1]);
  });

  it('is a describe-able step with a from/to pair', () => {
    expect(UPGRADE_V0_TO_V1.from).toBe(0);
    expect(UPGRADE_V0_TO_V1.to).toBe(1);
    expect(UPGRADE_V0_TO_V1.describe.length).toBeGreaterThan(10);
    expect(isRecord(UPGRADE_V0_TO_V1.upgrade({ version: 0, app: 'puffly' }))).toBe(true);
  });

  it('reads the version out of any object, and refuses what it cannot place', () => {
    expect(saveFileVersion(saveFileV0())).toBe(0);
    expect(saveFileVersion(makeSave())).toBe(1);
    expect(saveFileVersion({ version: 'one' })).toBeNull();
    expect(saveFileVersion([])).toBeNull();
    expect(saveFileVersion(null)).toBeNull();
    const errors = migrateSaveFile({ version: 'one' });
    if (errors.ok) throw new Error('a string version must not migrate');
    expect(errors.errors.join(' | ')).toContain('expected an integer schema version');
  });

  it('picks the rung for the version it is given, not the first one it finds', () => {
    const stepToTwo = {
      from: 1,
      to: 2,
      describe: 'test-only second rung',
      upgrade: (value: unknown): unknown => ({ ...(isRecord(value) ? value : {}), version: 2 }),
    };
    const ladder = [UPGRADE_V0_TO_V1, stepToTwo];
    expect(migrationFor(1, ladder)).toBe(stepToTwo);
    expect(supportedVersions(ladder)).toEqual([0, 1, 2]);
    // A file already at this build's version is validated, not rewritten.
    expect(expectOk(migrateSaveFile(makeSave(), ladder))).toEqual(makeSave());
  });

  it('reports a gap it cannot bridge instead of silently truncating', () => {
    const errors = migrateSaveFile({ version: 0 }, []);
    if (errors.ok) throw new Error('no migrations means no path');
    expect(errors.errors.join(' | ')).toContain('no migration path from version 0');
  });

  it('passes an unrecognised body through to the validator, which complains (§63)', () => {
    const errors = migrateSaveFile({ version: 0, app: 'puffly', sessions: 'not-an-array' });
    if (errors.ok) throw new Error('a string session list must not be accepted');
    expect(errors.errors.join(' | ')).toContain('sessions');
  });

  it('keeps the §31 target event reachable after the upgrade', () => {
    const save = expectOk(migrateSaveFile(saveFileV0()));
    const events = save.sessions[0]?.events ?? [];
    expect(events.some((event) => event.type === SessionEventType.SESSION_TARGET)).toBe(true);
  });
});
