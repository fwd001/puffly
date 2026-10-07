/**
 * `haptics` changed shape: it was a boolean, and the deck's save schema (S23) writes a number
 * (0.7). So a player's existing file is the thing under test here — upgrading the app must not
 * change how their hand feels, and a file that says something else entirely must not cost them the
 * whole save.
 */

import { describe, expect, it } from 'vitest';
import { readSettings } from '../validate';
import type { ValidationErrors } from '../validate';
import { makeSettings } from './fixture';

const read = (over: Record<string, unknown> | null) => {
  const base = { ...(makeSettings() as unknown as Record<string, unknown>) };
  if (over === null) delete base.haptics;
  const errors: ValidationErrors = [];
  const settings = readSettings({ ...base, ...over }, 'settings', errors);
  if (settings === null) throw new Error(`the fixture settings stopped parsing: ${errors.join()}`);
  return { settings, errors };
};

describe('a boolean haptics becomes a level, not a surprise (S23)', () => {
  it('reads the two legacy booleans at the ends a player would notice', () => {
    const on = read({ haptics: true });
    expect(on.errors).toEqual([]);
    expect(on.settings.haptics).toBe(1);
    const off = read({ haptics: false });
    expect(off.errors).toEqual([]);
    expect(off.settings.haptics).toBe(0);
  });

  it('keeps a number, clamps one that is out of range, and defaults a file that has none', () => {
    expect(read({ haptics: 0.7 }).settings.haptics).toBe(0.7);
    expect(read({ haptics: null }).settings.haptics).toBe(0);
    expect(read({}).settings.haptics).toBe(0);
    // A level outside 0..1 is a broken slider, not a broken save: it lands on the nearest end and
    // says so, the same way the range checks on volume do.
    const tooBig = read({ haptics: 9 });
    expect(tooBig.settings.haptics).toBe(1);
    expect(tooBig.errors.join()).toContain('settings.haptics');
    expect(read({ haptics: -3 }).settings.haptics).toBe(0);
  });

  it('a value that is neither still leaves the record, and says only about itself', () => {
    const { settings, errors } = read({ haptics: 'buzz' });
    expect(settings.haptics).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors.join()).toContain('settings.haptics');
    // The rest of the taste survives: one bad field may not eat the volume they set.
    expect(settings.volume).toBe(0.4);
  });
});
