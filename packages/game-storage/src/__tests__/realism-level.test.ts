/**
 * S6's 写实度 row, read out of a save.
 *
 * The row is a number (the deck writes 80 / 20), and it joins `haptics` as the second 0..1 knob in
 * the record, so both now come through one reader. Two things can go wrong when a keyed preference
 * arrives, and both have bitten this file before: a save written *before* the row is treated as
 * corrupt, and a value that lies is silently coerced so nobody can tell which field the player's
 * file actually disagreed with. Clamping and saying is the deal — the picture is worth repairing, not
 * throwing away, and the row's default is the deck's own 80/20, which is also what the game looked
 * like before the row existed.
 */

import { describe, expect, it } from 'vitest';
import { createDefaultSettings, type Settings } from '@puffly/game-core';
import { cloneSettings } from '../clone';
import { readSettings } from '../validate';
import type { ValidationErrors } from '../validate';
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

describe('the dial survives the ledger (S6 写实度 80 / 20)', () => {
  it('comes back exactly as the player left it', () => {
    const { settings, errors } = read({ realism: 0.35 });
    expect(errors).toEqual([]);
    expect(settings.realism).toBe(0.35);
  });

  it("is the deck's split for a save written before the row, and the save still parses", () => {
    const without = { ...(makeSettings() as unknown as Record<string, unknown>) };
    delete without.realism;
    const errors: ValidationErrors = [];
    const settings = readSettings(without, 'settings', errors);
    expect(settings, 'a key nobody had thought of yet is not a corrupt file').not.toBeNull();
    expect(errors).toEqual([]);
    // Read from the core's own default rather than restated here, so the two cannot drift — and the
    // default is the look the player already had, not a new one they did not ask for.
    expect(settings?.realism).toBe(createDefaultSettings().realism);
  });

  it('clamps a number out of range and names the field that lied', () => {
    const tooBig = read({ realism: 9 });
    expect(tooBig.settings.realism).toBe(1);
    expect(tooBig.errors.join()).toContain('settings.realism');
    expect(read({ realism: -3 }).settings.realism).toBe(0);
    // And it is the only complaint: the rest of the record arrives intact.
    expect(tooBig.errors).toHaveLength(1);
    expect(tooBig.settings.quality).toBe(makeSettings().quality);
  });

  it('a value that is not a level falls back to the deck default and says so', () => {
    const { settings, errors } = read({ realism: 'cartoonish' });
    expect(settings.realism).toBe(createDefaultSettings().realism);
    expect(errors.join()).toContain('settings.realism');
    expect(errors).toHaveLength(1);
  });

  it('reads both knobs the same way, because there is one reader now', () => {
    // `haptics` was a boolean before S23 wrote a number, and 写实度 is a level from the day it
    // existed. The shared reader is the reason this case exists: if the two ever drift — one
    // accepting a string, the other rejecting it — the pair stops being one rule.
    const hand = read({ haptics: true });
    const eye = read({ realism: true });
    expect(hand.settings.haptics).toBe(1);
    expect(eye.settings.realism).toBe(1);
    expect(hand.errors).toEqual([]);
    expect(eye.errors).toEqual([]);
    expect(read({ haptics: false }).settings.haptics).toBe(0);
    expect(read({ realism: false }).settings.realism).toBe(0);
    // And an absent knob falls back to *its own* default, not to a shared one.
    expect(read({}).settings.haptics).toBe(0);
    expect(read({}).settings.realism).toBe(createDefaultSettings().realism);
  });

  it('an export carries it, so a transferred save keeps the look', () => {
    const original: Settings = { ...makeSettings(), realism: 0.2 };
    expect(cloneSettings(original).realism).toBe(0.2);
    // And the copy is a copy: `cloneSettings` writes the record out from typed keys, which is how a
    // field can be lost in the export while still surviving the save.
    const second = cloneSettings(original);
    second.realism = 0.9;
    expect(original.realism).toBe(0.2);
  });
});
