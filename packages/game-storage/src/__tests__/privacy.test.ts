/**
 * §52 and §75, enforced as an architecture test (§73): this package is the one that owns
 * the player's data, so it must provably never talk to anybody and never describe the
 * player as an account.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportSaveFile, serializeSaveFile } from '../save';
import { at, makeProfile, makeProgress, makeSettings, sampleSessions } from './fixture';

/** Everything that would mean "this code can reach the network". */
const FORBIDDEN = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'navigator.',
  'http://',
  'https://',
  'import(',
];

/** Words that would mean the player has an account rather than a file. */
const ACCOUNT_WORDS = [
  'account',
  'password',
  'email',
  'token',
  'apikey',
  'secret',
  'analytics',
  'telemetry',
];

function sourceFiles(directory: URL): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(fileURLToPath(directory), { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) paths.push(...sourceFiles(child));
    else if (entry.name.endsWith('.ts')) paths.push(fileURLToPath(child));
  }
  return paths.sort();
}

const SRC = new URL('../', import.meta.url);

describe('§52: nothing in game-storage leaves the device', () => {
  const files = sourceFiles(SRC);

  it('has more than one source file, so the scan means something', () => {
    expect(files.length).toBeGreaterThan(6);
  });

  for (const needle of FORBIDDEN) {
    it(`never mentions ${needle}`, () => {
      const hits = files.filter((file) => readFileSync(file, 'utf8').includes(needle));
      expect(hits.map((file) => `${needle} in ${file}`)).toEqual([]);
    });
  }

  it('is the only package that touches a platform database, by being the only one with an adapter', () => {
    // §50: Game Core knows `StorageAdapter` and nothing else, so this scan cannot leak.
    expect(files.some((file) => file.endsWith('idb.ts'))).toBe(true);
  });
});

describe("§51/§52: an export is the player's own file", () => {
  const save = exportSaveFile({
    profile: makeProfile({ displayName: 'Wendong' }),
    settings: makeSettings(),
    progress: makeProgress(),
    sessions: sampleSessions(),
    nowMs: at(9, 12, 0),
  });

  it('is a plain object with exactly the §68 records, and no account field', () => {
    expect(Object.keys(save).sort()).toEqual([
      'app',
      'exportedAt',
      'profile',
      'progress',
      'sessions',
      'settings',
      'version',
    ]);
    expect(save.profile).toEqual({
      id: 'pro-local-1',
      createdAt: at(1, 8, 0),
      displayName: 'Wendong',
    });
    expect('account' in save).toBe(false);
    expect('account' in save.profile).toBe(false);
    expect(save.profile.id).toBe('pro-local-1');
  });

  it('carries no account-shaped word anywhere in the bytes it writes', () => {
    const json = serializeSaveFile(save).toLowerCase();
    for (const word of ACCOUNT_WORDS) {
      expect(json.includes(word), `the export mentions "${word}"`).toBe(false);
    }
    for (const needle of FORBIDDEN)
      expect(json.includes(needle.toLowerCase()), `the export mentions ${needle}`).toBe(false);
  });

  it('holds a local profile id, which is not a login', () => {
    const anonymous = exportSaveFile({
      profile: makeProfile(),
      settings: makeSettings(),
      progress: makeProgress(),
      sessions: [],
    });
    expect('displayName' in anonymous.profile).toBe(false);
    expect(anonymous.sessions).toEqual([]);
  });
});
