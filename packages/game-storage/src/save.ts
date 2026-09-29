/**
 * §51's export / import pair.
 *
 * A save file is a plain JSON artefact the player owns: no account, no server, no
 * encoding that only this build can read (§52). Export copies, serialise is stable, and
 * parse migrates-then-validates so an old file still opens (§51).
 */

import {
  SAVE_SCHEMA_VERSION,
  type Progress,
  type SaveFile,
  type Session,
  type Settings,
  type UserProfile,
} from '@puffly/game-core';
import { cloneProgress, cloneSession, cloneSettings, cloneProfile, stableStringify } from './clone';
import { migrateSaveFile } from './migrate';
import type { SaveFileResult } from './validate';

/** What the shell has in hand at the moment the player asks for a file. */
export interface SaveFileSource {
  profile: UserProfile;
  settings: Settings;
  progress: Progress;
  sessions: readonly Session[];
  /** Pass a clock for a deterministic export (§74); defaults to the wall clock. */
  nowMs?: number;
}

/**
 * A `SaveFile` that shares no object with the running game: the player can keep playing,
 * or keep mutating the engine's state, without the export changing under them (§51).
 */
export function exportSaveFile(source: SaveFileSource): SaveFile {
  const nowMs =
    typeof source.nowMs === 'number' && Number.isFinite(source.nowMs) ? source.nowMs : Date.now();
  return {
    version: SAVE_SCHEMA_VERSION,
    app: 'puffly',
    exportedAt: nowMs,
    profile: cloneProfile(source.profile),
    settings: cloneSettings(source.settings),
    progress: cloneProgress(source.progress),
    sessions: source.sessions.map(cloneSession),
  };
}

/** Stable, key-sorted, two-space JSON — the same data always writes the same bytes (§51). */
export function serializeSaveFile(save: SaveFile): string {
  return stableStringify(save);
}

/** A suggested file name, digits only so it needs no translation (§4). */
export function saveFileName(nowMs: number): string {
  const stamp = Number.isFinite(nowMs) ? nowMs : 0;
  const iso = new Date(stamp).toISOString().replace(/[:.]/g, '-');
  return `puffly-${iso}.json`;
}

/**
 * Parse, upgrade and validate. Never throws: hostile input comes back as
 * `{ ok: false, errors: string[] }` so the shell can show a state instead of a stack
 * trace (§63).
 */
export function parseSaveFile(json: string): SaveFileResult {
  if (typeof json !== 'string') return { ok: false, errors: ['input: expected a JSON string'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${jsonFailureMessage(error)}`] };
  }
  return migrateSaveFile(parsed);
}

/** `SyntaxError.message` is already terse; everything else gets a generic line (§63). */
function jsonFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'the file is not JSON';
}

/** Import convenience for a shell that already parsed the file itself. */
export function readSaveFile(value: unknown): SaveFileResult {
  return migrateSaveFile(value);
}
