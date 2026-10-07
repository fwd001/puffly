/**
 * The room the player asked for has to come back from the save — and a save written before the row
 * existed must not be thrown away for lacking it.
 *
 * `reverb` is S6's 「混响 关」, so the deck itself fixes the default: a file that says nothing means
 * the room is off, not that the record is corrupt. Both halves matter: a setting that does not
 * survive a reload is a control that does not work, and a new key that invalidates every old save is
 * worse than not adding it (§63).
 */

import { describe, expect, it } from 'vitest';
import { cloneSettings } from '../clone';
import { readSettings } from '../validate';
import type { ValidationErrors } from '../validate';
import type { Settings } from '@puffly/game-core';
import { makeSettings } from './fixture';

const read = (over: Record<string, unknown>) => {
  const errors: ValidationErrors = [];
  const settings = readSettings(
    { ...(makeSettings() as unknown as Record<string, unknown>), ...over },
    'settings',
    errors,
  );
  if (settings === null) throw new Error(`the fixture settings stopped parsing: ${errors.join()}`);
  return { settings, errors };
};

describe('the reverb survives the ledger (S6 「混响 关」)', () => {
  it('comes back as the player left it', () => {
    const { settings, errors } = read({ reverb: true });
    expect(errors).toEqual([]);
    expect(settings.reverb).toBe(true);
  });

  it('is off for a save written before the row existed, and the save still parses', () => {
    const without = { ...(makeSettings() as unknown as Record<string, unknown>) };
    delete without.reverb;
    const errors: ValidationErrors = [];
    const settings = readSettings(without, 'settings', errors);
    expect(settings, 'a key nobody had thought of yet is not a corrupt file').not.toBeNull();
    expect(errors).toEqual([]);
    expect(settings?.reverb).toBe(false);
  });

  it('a value that is not true or false falls back to the deck default and says so', () => {
    const { settings, errors } = read({ reverb: 'a big hall' });
    expect(settings.reverb).toBe(false);
    expect(errors.join()).toContain('settings.reverb');
    // And it is the only complaint: the rest of the record still arrives intact.
    expect(errors).toHaveLength(1);
    expect(settings.quality).toBe(makeSettings().quality);
  });

  it('an export carries it, so a transferred save keeps the room', () => {
    // The fixture's `makeSettings` takes a clock, not overrides: the shape of a player's settings is
    // written out here, the same way `makeChosenSettings` does it.
    const original: Settings = { ...makeSettings(), reverb: true };
    expect(cloneSettings(original).reverb).toBe(true);
    // And the copy is a copy: `cloneSettings` rebuilds the record from typed-out keys, which is how
    // a field can be lost in the export while surviving the save.
    const second = cloneSettings(original);
    second.reverb = false;
    expect(original.reverb).toBe(true);
  });
});
