/**
 * The interrupted break, through every adapter — SPEC.md §50, §52, §81 (4).
 *
 * One contract, run against memory and IndexedDB, because the whole point of §50 is that the
 * rest of the app cannot tell them apart. The killed-app resume depends on this record surviving
 * exactly as long as the player's other data does — and no longer.
 */

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { OPEN_BREAK_ID, type StorageAdapter } from '../adapter';
import { META_STORE, SCHEMA_META_ID, createIdbStorage } from '../idb';
import { createMemoryStorage } from '../memory';
import { makeOpenBreak } from './fixture';

function candidates(): [string, () => StorageAdapter][] {
  return [
    ['memory', () => createMemoryStorage()],
    ['indexeddb', () => createIdbStorage({ databaseName: `puffly-open-break-${Math.random()}` })],
  ];
}

describe.each(candidates())('the interrupted break in %s storage', (_name, make) => {
  it('is absent until something interrupts', async () => {
    const storage = make();
    expect(await storage.loadOpenBreak()).toBeNull();
  });

  it('round-trips the record exactly', async () => {
    const storage = make();
    const record = makeOpenBreak();
    await storage.saveOpenBreak(record);
    expect(await storage.loadOpenBreak()).toEqual(record);
  });

  it('keeps only the newest break', async () => {
    const storage = make();
    await storage.saveOpenBreak(makeOpenBreak({ id: 'ses-one', rodRemaining: 0.9 }));
    await storage.saveOpenBreak(makeOpenBreak({ id: 'ses-two', rodRemaining: 0.3 }));
    expect(await storage.loadOpenBreak()).toMatchObject({ id: 'ses-two', rodRemaining: 0.3 });
  });

  it('can be dropped without touching the rest of the save', async () => {
    const storage = make();
    await storage.saveOpenBreak(makeOpenBreak());
    await storage.clearOpenBreak();
    expect(await storage.loadOpenBreak()).toBeNull();
  });

  it('is deleted with the player’s other data (§52)', async () => {
    const storage = make();
    await storage.saveOpenBreak(makeOpenBreak());
    await storage.clear();
    expect(await storage.loadOpenBreak()).toBeNull();
  });
});

it('deleting the data leaves the schema marker where it was', async () => {
  // The break shares the `meta` store with the schema row. Wiping one must not wipe the other.
  const storage = createIdbStorage({ databaseName: `puffly-meta-${Math.random()}` });
  await storage.saveOpenBreak(makeOpenBreak());
  await storage.clear();
  const factory = (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB;
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(storage.databaseName);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const transaction = connection.transaction(META_STORE, 'readonly');
    const request = transaction.objectStore(META_STORE).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error);
  });
  connection.close();
  const ids = rows.map((row) => (row as { id?: string }).id);
  expect(ids).not.toContain(OPEN_BREAK_ID);
  expect(ids).toContain(SCHEMA_META_ID);
});
