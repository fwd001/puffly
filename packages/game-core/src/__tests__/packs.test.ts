/**
 * The drop rules (§ packs.dropRule) and the two things that make a collection safe to publish:
 * the roll is reproducible, and a brand never leaves the archive.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '@puffly/shared';
import { rollPack } from '@puffly/game-core';
import { PACKS } from '@puffly/game-content';
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

  it('a reserved box is never in the pool, and neither is a slot nobody named', () => {
    const rng = createRng(3);
    for (let roll = 0; roll < 300; roll += 1) {
      const box = rollPack(rng, PACKS, [], 500);
      expect(box === null || (!box.reserved && box.brand !== '')).toBe(true);
    }
  });

  it('every box is offered once before the pool is empty', () => {
    const rng = createRng(21);
    const owned: string[] = [];
    for (let roll = 0; roll < pool.length; roll += 1) {
      const box = rollPack(rng, PACKS, owned, 500);
      expect(box, `roll ${String(roll)} found nothing while boxes remained`).not.toBeNull();
      if (box) owned.push(box.id);
    }
    expect(new Set(owned).size).toBe(pool.length);
    expect(rollPack(rng, PACKS, owned, 500)).toBeNull();
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

  it('every named price is an estimate, and the unfilled slots say so by being blank', () => {
    for (const pack of named) expect(pack.priceCny.startsWith('≈')).toBe(true);
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
