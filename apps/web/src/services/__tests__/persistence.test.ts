/**
 * §52's "delete my data", at the seam the shell actually uses.
 *
 * The store-level wipe — every record store emptied, the layout left alone — is proven in
 * `packages/game-storage/src/__tests__/idb.test.ts`. What only this layer can prove is the latch:
 * a page that erased everything is still running a simulation that writes, and if those writes
 * land, the erase lasted one animation frame.
 */

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDefaultSettings, type OpenBreak } from '@puffly/game-core';
import { createPersistence } from '../persistence';

const T0 = Date.UTC(2026, 9, 6, 9, 0, 0);

/** The record a running break writes down, with nothing in it but the frame it was taken at. */
function openBreak(atMs: number): OpenBreak {
  return {
    id: 'ses-open',
    seed: 7,
    cigaretteId: 'test-rod',
    environmentId: 'test-room',
    lighterId: 'test-lighter',
    ashtrayId: 'test-tray',
    startedAt: atMs,
    targetMs: 180_000,
    litAtWallMs: atMs,
    rodRemaining: 0.8,
    ashLength: 0.02,
    emberLit: true,
    events: [],
    triggers: [],
    savedAtWallMs: atMs,
  };
}

describe('the reset entry (§52)', () => {
  it('starts a brand-new player with nothing stored', async () => {
    const first = await createPersistence().load(T0);
    expect(first.hadStoredSettings).toBe(false);
    expect(first.sessions).toEqual([]);
    expect(first.progress.sessions).toBe(0);
  });

  it('erases what was saved, and a load afterwards is a first run again', async () => {
    const persistence = createPersistence();
    const first = await persistence.load(T0);
    await persistence.saveSettings({ ...createDefaultSettings(0), language: 'zh-CN' });
    await persistence.saveProgress({ ...first.progress, sessions: 7, puffs: 42 });
    await persistence.saveOpenBreak(openBreak(T0));

    const before = await persistence.load(T0 + 1);
    expect(before.hadStoredSettings).toBe(true);
    expect(before.progress.sessions).toBe(7);

    await persistence.reset();
    const after = await persistence.load(T0 + 2);
    expect(after.hadStoredSettings).toBe(false);
    expect(after.progress.sessions).toBe(0);
    expect(after.progress.puffs).toBe(0);
    expect(await persistence.loadOpenBreak()).toBeNull();
  });

  it('stays erased when the live simulation writes again on the next frame', async () => {
    const persistence = createPersistence();
    await persistence.saveSettings({ ...createDefaultSettings(0), language: 'zh-CN' });
    await persistence.reset();

    // The engine in memory still has the player's day in it, and still asks for it to be saved.
    await persistence.saveSettings({ ...createDefaultSettings(0), language: 'ar' });
    const after = await persistence.load(T0 + 3);
    expect(after.hadStoredSettings).toBe(false);
    expect(after.settings.language ?? 'none').not.toBe('ar');
  });
});
