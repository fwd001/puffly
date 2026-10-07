/**
 * The drop rules (§ packs.dropRule) and the two things that make a collection safe to publish:
 * the roll is reproducible, and a brand never leaves the archive.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@puffly/shared';
import { rollPack } from '@puffly/game-core';
import { FINDABLE_PACKS, PACKS, SKINS } from '@puffly/game-content';

const CINNABAR = SKINS.find((skin) => skin.id === 'cinnabar')!;
import { harness } from './harness';
import { FIXTURE } from './fixture';

const named = PACKS.filter((pack) => pack.brand !== '');
const pool = named.filter((pack) => !pack.reserved);

describe('rollPack (§ packs)', () => {
  it('the low tier never comes up empty, and at zero sticks nothing else is offered', () => {
    const rng = createRng(7);
    for (let roll = 0; roll < 60; roll += 1) {
      const box = rollPack(rng, PACKS, [], 0);
      expect(box).not.toBeNull();
      expect(box?.tier).toBe('low');
    }
  });

  it('the upper tiers arrive as the sticks accumulate', () => {
    const rng = createRng(11);
    const tiers = new Set<string>();
    for (let roll = 0; roll < 400; roll += 1)
      tiers.add(rollPack(rng, PACKS, [], 200)?.tier ?? 'none');
    expect(tiers.has('high')).toBe(true);
    expect(tiers.has('mid')).toBe(true);
  });

  it('a reserved box waits while anything is still open, and a slot nobody named never comes', () => {
    const rng = createRng(3);
    for (let roll = 0; roll < 300; roll += 1) {
      const box = rollPack(rng, PACKS, [], 500);
      expect(box === null || (!box.reserved && box.brand !== '')).toBe(true);
    }
  });

  it('every open box is offered once, and the pool only empties after the finale', () => {
    const rng = createRng(21);
    const owned: string[] = [];
    for (let roll = 0; roll < pool.length; roll += 1) {
      const box = rollPack(rng, PACKS, owned, 500);
      expect(box, `roll ${String(roll)} found nothing while boxes remained`).not.toBeNull();
      // The wait is the point of a finale: nothing held back may turn up while an open box is
      // still missing, or the last skin's prize arrives before the collection it is the prize for.
      expect(box!.reserved, `${box!.id} came up before the open boxes ran out`).toBe(false);
      owned.push(box!.id);
    }
    expect(new Set(owned).size).toBe(pool.length);

    const held = named.filter((pack) => pack.reserved).map((pack) => pack.id);
    for (const id of held) {
      const box = rollPack(rng, PACKS, owned, 500);
      expect(box, `the finale never offered ${id}`).not.toBeNull();
      expect(held.includes(box!.id), `a non-finale box came up in the finale: ${box!.id}`).toBe(
        true,
      );
      owned.push(box!.id);
    }
    expect(new Set(owned).size).toBe(named.length);
    expect(rollPack(rng, PACKS, owned, 500)).toBeNull();
  });

  it('the collection a skin is gated on is one a player can actually finish', () => {
    // The bug this replaces: three boxes were held back forever, so seven of ten could ever be
    // found, and the last skin asked for twelve. The gate is now the number of boxes that can be
    // found at all, and it is derived rather than typed, so naming an eleventh brand moves it.
    expect(FINDABLE_PACKS).toBe(named.length);
    expect(CINNABAR.unlock.kind).toBe('packs');
    expect(CINNABAR.unlock.kind === 'packs' ? CINNABAR.unlock.count : -1).toBe(FINDABLE_PACKS);
    expect(FINDABLE_PACKS).toBeLessThan(PACKS.length);
  });

  it('the same session rolls the same boxes, which is what a replay is for (§71)', () => {
    const once: (string | null)[] = [];
    const twice: (string | null)[] = [];
    const a = createRng(99);
    const b = createRng(99);
    for (let roll = 0; roll < 12; roll += 1) {
      once.push(rollPack(a, PACKS, [], roll * 30)?.id ?? null);
      twice.push(rollPack(b, PACKS, [], roll * 30)?.id ?? null);
    }
    expect(twice).toEqual(once);
  });
});

describe('the twelve slots', () => {
  it('is twelve boxes across the three tiers the brief names', () => {
    expect(PACKS).toHaveLength(12);
    const byTier = PACKS.reduce<Record<string, number>>((tally, pack) => {
      tally[pack.tier] = (tally[pack.tier] ?? 0) + 1;
      return tally;
    }, {});
    expect(byTier).toEqual({ low: 3, mid: 5, high: 4 });
  });

  it('a price never reaches the grid, and only ever appears in an archive as an estimate', () => {
    // The row a player scans is twelve boxes side by side, and twelve prices side by side is a
    // price table whatever each one says. `PackContent` has no money field at all, so the shape of
    // the data is the guard; the range lives one level down, where only one box is ever open.
    for (const pack of PACKS) {
      expect('priceCny' in pack, `${pack.id} carries a price on the row`).toBe(false);
    }
    for (const pack of named) {
      expect(pack.archive?.priceCny?.startsWith('≈'), `${pack.id} price is not an estimate`).toBe(
        true,
      );
    }
    expect(PACKS.filter((pack) => pack.brand === '')).toHaveLength(2);
  });
});

/**
 * The roll is only worth having if a finished stick actually collects it, and a walked-away one
 * does not. This is the seam between the drop rule and the session log.
 */
describe('a finished stick collects a box', () => {
  const light = (h: ReturnType<typeof harness>): void => {
    h.engine.startSession();
    h.tap('cigarette');
    h.run(16);
    h.tap('lighter');
    h.run(900);
  };

  it('hands out a box when the break ran its own length', () => {
    const h = harness({ settings: { sessionTargetMs: 1_500 } });
    light(h);
    h.run(2_000);
    h.engine.endSession();
    const packs = h.engine.progressSnapshot().collectedPacks ?? [];
    expect(packs).toHaveLength(1);
    expect(FIXTURE.packs.some((pack) => pack.id === packs[0] && !pack.reserved)).toBe(true);
  });

  it('a break walked away from before its own length collects nothing', () => {
    const h = harness({ settings: { sessionTargetMs: 60_000 } });
    light(h);
    h.run(2_000);
    h.engine.endSession();
    expect(h.engine.progressSnapshot().collectedPacks ?? []).toEqual([]);
  });

  it('a break that was never lit collects nothing', () => {
    const h = harness({ settings: { sessionTargetMs: 1_500 } });
    h.engine.startSession();
    h.tap('cigarette');
    h.run(2_000);
    h.engine.endSession();
    expect(h.engine.progressSnapshot().collectedPacks ?? []).toEqual([]);
  });
});
