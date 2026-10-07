/**
 * The player's own room colours have to survive a save, an export, and a file that lies.
 *
 * `customBackground` is the first settings value that is an object rather than a number, a string
 * or a boolean, so it is the first one this validator has to read layer by layer. The rule it
 * implements: half a palette is worse than none. Three quarters of an override would paint a sky
 * the player did not choose over a silhouette they did not touch, and that looks like a bug rather
 * than a decision — so a malformed layer drops the whole thing back to the room's own colours and
 * says which one was wrong.
 */

import { describe, expect, it } from 'vitest';
import { cloneSettings } from '../clone';
import { readSettings } from '../validate';
import type { ScenePalette } from '@puffly/game-core';
import { makeSettings } from './fixture';
import type { ValidationErrors } from '../validate';
import type { Rgb } from '@puffly/shared';

const PALETTE: Record<keyof ScenePalette, Rgb> = {
  skyTop: [8, 90, 180],
  skyBottom: [200, 40, 10],
  horizon: [0, 220, 120],
  silhouette: [250, 250, 0],
};

const read = (over: Record<string, unknown>) => {
  const errors: ValidationErrors = [];
  const settings = readSettings(
    { ...(makeSettings() as unknown as Record<string, unknown>), ...over },
    'settings',
    errors,
  );
  // `readSettings` can refuse a whole record; every case here hands it a valid one, and if it ever
  // stops being valid the assertion below is the message rather than a null dereference three
  // failures deep.
  if (settings === null) throw new Error(`the fixture settings stopped parsing: ${errors.join()}`);
  return { settings, errors };
};

describe('the room the player painted survives the ledger (§51, §63)', () => {
  it('comes back unchanged through a save', () => {
    const { settings, errors } = read({ customBackground: PALETTE });
    expect(errors).toEqual([]);
    expect(settings.customBackground).toEqual(PALETTE);
  });

  it('is null when the file says nothing about it, rather than a half-made palette', () => {
    const { settings, errors } = read({});
    expect(errors).toEqual([]);
    expect(settings.customBackground).toBeNull();
  });

  it('drops the whole palette when one layer is not three numbers, and says which', () => {
    const broken = read({ customBackground: { ...PALETTE, horizon: [0, 220] } });
    expect(broken.settings.customBackground).toBeNull();
    expect(broken.errors.join(' ')).toContain('horizon');

    const notAnObject = read({ customBackground: 'sunset' });
    expect(notAnObject.settings.customBackground).toBeNull();
    expect(notAnObject.errors.join(' ')).toContain('customBackground');
  });

  it('clamps what it can and refuses what it cannot read', () => {
    const clamped = read({ customBackground: { ...PALETTE, skyTop: [-40, 300.6, 12.4] } });
    expect(clamped.settings.customBackground?.skyTop).toEqual([0, 255, 12]);

    const nan = read({ customBackground: { ...PALETTE, skyTop: [Number.NaN, 0, 0] } });
    expect(nan.settings.customBackground).toBeNull();
  });

  it('does not let a bad file share its arrays with the live settings', () => {
    const cloned = cloneSettings({ ...makeSettings(), customBackground: PALETTE });
    expect(cloned.customBackground).toEqual(PALETTE);
    if (!cloned.customBackground) throw new Error('the clone dropped the palette');
    // Mutating the copy must not reach back into the object it came from — the reason a palette
    // is copied one layer deep when every other setting is a scalar.
    [...cloned.customBackground.skyTop][0] = 1;
    cloned.customBackground.skyTop = [1, 0, 0];
    expect(PALETTE.skyTop[0]).toBe(8);
  });
});
