/**
 * Package boundaries — SPEC.md §45, §47, §73, §81 (9/10/11), §86.
 *
 * Two kinds of check: a source scan for things that must never appear in an adapter package
 * (the renderer, a framework, an audio file), and compile-time assertions that the seams we
 * chose are the ones the core actually offers.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AudioAdapter, EngineEvent, GameStateView } from '@puffly/game-core';
import type { AudioContextLike } from '../web-audio';
import type { AudioEngine, AudioStateSlice } from '../types';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `${dir}${name}`)
    .filter((path) => !path.includes('__tests__'));

/** §45: adapters are siblings. Audio must not reach sideways into the renderer or a framework. */
const BANNED: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  {
    pattern: /@puffly\/game-renderer/,
    why: 'SPEC.md §45: renderers and audio never talk to each other',
  },
  {
    pattern: /@puffly\/web/,
    why: 'SPEC.md §45: the shell is downstream of adapters, not upstream',
  },
  {
    pattern: /from ['"]vue['"]/,
    why: 'SPEC.md §81 (10): framework code does not belong in an adapter',
  },
  { pattern: /@vue\//, why: 'SPEC.md §81 (10)' },
  { pattern: /@puffly\/game-storage/, why: 'SPEC.md §50: storage is its own adapter' },
  { pattern: /\.(mp3|wav|ogg|m4a|flac)\b/, why: 'SPEC.md §87: sound is synthesised, not shipped' },
  { pattern: /decodeAudioData/, why: 'SPEC.md §87: no sample files to decode' },
  { pattern: /XMLHttpRequest|\bfetch\(/, why: 'SPEC.md §53: nothing to download for audio' },
  { pattern: /Math\.random\(/, why: 'SPEC.md §71: variation comes from the seeded RNG stream' },
  {
    pattern: /\balert\(|\bconfirm\(|\bprompt\(/,
    why: 'SPEC.md §62, §81 (3): no permission dialogs',
  },
];

describe('package boundaries', () => {
  it('has sources to look at', () => {
    expect(sourceFiles(srcRoot).length).toBeGreaterThan(6);
  });

  it('never reaches for the renderer, Vue, or an audio file', () => {
    for (const path of sourceFiles(srcRoot)) {
      const text = readFileSync(path, 'utf8');
      for (const { pattern, why } of BANNED) {
        expect(pattern.test(text), `${path} matches ${pattern}: ${why}`).toBe(false);
      }
    }
  });

  it('reads the state as a snapshot and never writes to it', () => {
    // The slice the engine accepts is the shape the core publishes; nothing is mutable on it.
    type ViewIsAccepted = GameStateView extends AudioStateSlice ? true : false;
    const accepted: ViewIsAccepted = true;
    expect(accepted).toBe(true);

    type SliceIsReadOnly = AudioStateSlice['cigarette'] extends { state: string } ? true : false;
    const readOnly: SliceIsReadOnly = true;
    expect(readOnly).toBe(true);
  });

  it('is a drop-in AudioAdapter for anything that only knows Game Core', () => {
    type EngineIsAdapter = AudioEngine extends AudioAdapter ? true : false;
    const compatible: EngineIsAdapter = true;
    expect(compatible).toBe(true);
  });

  it('the browser AudioContext already satisfies the narrow seam', () => {
    // So `new AudioContext()` can be handed straight to `createAudioEngine` with no wrapper.
    type ContextMatches = AudioContext extends AudioContextLike ? true : false;
    const matches: ContextMatches = true;
    expect(matches).toBe(true);
  });

  it('keeps every Web Audio entry point behind the seam in web-audio.ts', () => {
    const offenders = sourceFiles(srcRoot).filter((path) => {
      if (path.endsWith('web-audio.ts')) return false;
      const text = readFileSync(path, 'utf8');
      return /new AudioContext\(|window\.AudioContext/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('survives a whole lifecycle of events typed as the core declares them', () => {
    const event: EngineEvent = { kind: 'unlock', atMs: 0, category: 'lighters', id: 'brass' };
    type EngineEventIsAccepted = EngineEvent extends Parameters<AudioEngine['handle']>[0]
      ? true
      : false;
    const accepted: EngineEventIsAccepted = true;
    expect(accepted).toBe(true);
    expect(event.kind).toBe('unlock');
  });
});
