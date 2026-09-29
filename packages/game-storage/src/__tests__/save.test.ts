/**
 * §51's export / import round trip, and §63's rule that a bad file must produce readable
 * problems instead of an exception.
 */

import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION, SessionEventType, type SaveFile } from '@puffly/game-core';
import { exportSaveFile, parseSaveFile, serializeSaveFile } from '../save';
import { isRecord, validateSaveFile, MAX_REPORTED_ISSUES, type SaveFileResult } from '../validate';
import {
  JSON_BUT_NOT_A_SAVE,
  NOT_JSON,
  at,
  makeProfile,
  makeProgress,
  makeSave,
  makeSession,
  makeSettings,
  rawSave,
  sampleSessions,
} from './fixture';

/** A rejection with readable messages, or a test failure that says which one parsed. */
function expectRejected(result: SaveFileResult, needle?: string): string[] {
  if (result.ok) throw new Error('expected the input to be rejected, but it parsed cleanly');
  const joined = result.errors.join(' | ');
  if (needle !== undefined && !joined.includes(needle)) {
    throw new Error(`expected an error containing "${needle}", got: ${joined}`);
  }
  return result.errors;
}

describe('exportSaveFile (§51, §52)', () => {
  const source = {
    profile: makeProfile(),
    settings: makeSettings(),
    progress: makeProgress(),
    sessions: sampleSessions(),
    nowMs: at(9, 10, 0),
  };

  it('stamps the envelope and copies the records', () => {
    const save = exportSaveFile(source);
    expect(save.version).toBe(SAVE_SCHEMA_VERSION);
    expect(save.app).toBe('puffly');
    expect(save.exportedAt).toBe(at(9, 10, 0));
    expect(save.sessions).toHaveLength(4);
    expect(save.sessions[0]).toEqual(sampleSessions()[0]);
  });

  it('shares no object with the running game', () => {
    const save = exportSaveFile(source);
    const original = source.sessions[0];
    if (original === undefined) throw new Error('fixture lost ses-a');
    original.events.push({ id: 'late', type: SessionEventType.PUFF, timestamp: at(9, 11, 0) });
    source.profile.displayName = 'Renamed';
    expect(save.sessions[0]?.events.some((event) => event.id === 'late')).toBe(false);
    expect(save.profile.displayName).toBeUndefined();
  });

  it('omits an unset quit anchor instead of writing undefined (§84)', () => {
    const plain = exportSaveFile(source);
    expect('quitAnchorTimestamp' in plain.settings).toBe(false);
    const anchored = exportSaveFile({
      ...source,
      settings: { ...makeSettings(), quitAnchorTimestamp: at(1, 8, 0) },
    });
    expect(anchored.settings.quitAnchorTimestamp).toBe(at(1, 8, 0));
  });
});

describe('serializeSaveFile / parseSaveFile round trip (§51)', () => {
  const save = makeSave();
  const json = serializeSaveFile(save);

  it('survives the round trip unchanged', () => {
    const parsed = parseSaveFile(json);
    if (!parsed.ok) throw new Error(`unexpected problems: ${parsed.errors.join(' | ')}`);
    expect(parsed.save).toEqual(save);
  });

  it('is stable: the same data writes the same bytes, whatever the key order was', () => {
    expect(serializeSaveFile(makeSave())).toBe(json);
    const reordered: SaveFile = JSON.parse(
      JSON.stringify({
        sessions: save.sessions,
        settings: save.settings,
        version: save.version,
        profile: save.profile,
        app: save.app,
        progress: save.progress,
        exportedAt: save.exportedAt,
      }),
    );
    expect(serializeSaveFile(reordered)).toBe(json);
  });

  it('sorts keys so a human can diff two exports', () => {
    const topLevel = json
      .split('\n')
      .filter((line) => line.startsWith('  "'))
      .map((line) => line.slice(3, line.indexOf('"', 3)));
    expect(topLevel).toEqual([
      'app',
      'exportedAt',
      'profile',
      'progress',
      'sessions',
      'settings',
      'version',
    ]);
    expect(topLevel).toEqual([...topLevel].sort());
  });

  it('reads back through validateSaveFile when the shell already parsed the file', () => {
    expect(validateSaveFile(JSON.parse(json)).ok).toBe(true);
  });
});

describe('parseSaveFile: hostile input never throws (§63)', () => {
  const bad: ReadonlyArray<readonly [string, string, string]> = [
    ['an empty string', '', 'invalid JSON'],
    ['prose instead of JSON', 'this is a smoke break, not a file', 'invalid JSON'],
    ['broken JSON', NOT_JSON, 'invalid JSON'],
    ['an array instead of an object', JSON_BUT_NOT_A_SAVE, 'save: expected an object'],
    ['a bare number', '7', 'save: expected an object'],
    ['null', 'null', 'save: expected an object'],
    ['a missing version', '{"app":"puffly"}', 'expected an integer schema version'],
    ['an empty object', '{}', 'expected an integer schema version'],
  ];

  for (const [name, input, needle] of bad) {
    it(`reports "${needle}" for ${name}`, () => {
      let result: SaveFileResult | undefined;
      expect(() => {
        result = parseSaveFile(input);
      }).not.toThrow();
      if (result === undefined) throw new Error('parseSaveFile returned nothing');
      expectRejected(result, needle);
    });
  }

  it('refuses a version this build does not know, in either direction', () => {
    expectRejected(parseSaveFile(JSON.stringify({ ...makeSave(), version: 99 })), 'at most');
    expectRejected(
      parseSaveFile(JSON.stringify({ ...makeSave(), version: -1 })),
      'expected an integer schema version',
    );
  });

  it('rejects a save file from another app', () => {
    expectRejected(
      parseSaveFile(JSON.stringify({ ...makeSave(), app: 'smokefree' })),
      'expected "puffly"',
    );
  });

  it('names the field that is wrong, not a stack frame', () => {
    const broken = makeSave();
    const first = broken.sessions[0];
    if (first === undefined) throw new Error('fixture lost a session');
    first.cravingBefore = 11;
    expectRejected(
      parseSaveFile(serializeSaveFile(broken)),
      'save.sessions[0].cravingBefore: expected 0-10, got 11',
    );

    const backwards = makeSave();
    const second = backwards.sessions[1];
    if (second === undefined) throw new Error('fixture lost a session');
    second.endedAt = second.startedAt - 1;
    expectRejected(
      parseSaveFile(serializeSaveFile(backwards)),
      'save.sessions[1].endedAt: expected a timestamp at or after startedAt',
    );
  });

  it('rejects an event whose id is not a string and whose timestamp is missing', () => {
    const raw = rawSave();
    const sessions = raw['sessions'];
    if (!Array.isArray(sessions)) throw new Error('fixture lost the session list');
    const first = sessions[0];
    if (!isRecord(first)) throw new Error('fixture lost a session');
    const events = first['events'];
    if (!Array.isArray(events)) throw new Error('fixture lost a session log');
    events[0] = { id: 42, type: 'PUFF' };
    events.push({ id: 'no-clock', type: 'PUFF' });

    const errors = expectRejected(validateSaveFile(raw));
    expect(errors.join(' | ')).toContain(
      'save.sessions[0].events[0].id: expected a non-empty string',
    );
    expect(errors.join(' | ')).toContain('expected a finite number');
  });

  it('rejects a missing progress record', () => {
    expectRejected(
      validateSaveFile(rawSave({ progress: null })),
      'save.progress: expected an object',
    );
  });

  it('rejects settings that are out of range', () => {
    const raw = rawSave();
    const settings = raw['settings'];
    if (!isRecord(settings)) throw new Error('fixture lost the settings record');
    settings['volume'] = 2;
    settings['quality'] = 'ultra';
    const errors = expectRejected(validateSaveFile(raw));
    expect(errors.join(' | ')).toContain('volume: expected 0-1');
    expect(errors.join(' | ')).toContain('quality: expected one of');
  });

  it('reports duplicate session ids rather than quietly keeping one', () => {
    const save = makeSave();
    const duplicate = save.sessions[0];
    if (duplicate === undefined) throw new Error('fixture lost a session');
    save.sessions.push({ ...duplicate, startedAt: duplicate.startedAt + 1_000 });
    expectRejected(parseSaveFile(serializeSaveFile(save)), 'duplicate session id');
  });

  it('caps the report so a wall of nonsense still shows something readable', () => {
    const save = makeSave();
    for (let index = 0; index < MAX_REPORTED_ISSUES + 30; index += 1) {
      save.sessions.push(
        makeSession({
          id: `noisy-${String(index)}`,
          startedAt: at(9, 1, 0) + index,
          cravingBefore: 99,
        }),
      );
    }
    const errors = expectRejected(parseSaveFile(serializeSaveFile(save)));
    expect(errors.length).toBeLessThanOrEqual(MAX_REPORTED_ISSUES + 1);
    expect(errors[errors.length - 1]).toContain('more problem(s)');
  });

  it('writes null instead of an unrepresentable number, and then refuses the file', () => {
    const save = makeSave();
    save.progress.dayNumber = Number.POSITIVE_INFINITY;
    const json = serializeSaveFile(save);
    expect(json).toContain('"dayNumber": null');
    expectRejected(parseSaveFile(json), 'dayNumber');
  });
});
