/**
 * The cabinet's ordering and count, checked as data: S8 says "3 / 11" and S8b says the ladder is
 * read by what the hand does, so both are claims about the shipped content that can be wrong.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { nextRodGate, shelfCount, shelvesOf } from '../shelf';

const rods = DEFAULT_CONTENT.cigarettes;

describe('the 图鉴 (§ S8, § S8b)', () => {
  it('groups every rod by its interaction family, in the order the hand meets them', () => {
    const shelves = shelvesOf(rods);
    expect(shelves.map((shelf) => shelf.kind)).toEqual(['inhale', 'savor', 'filter']);
    // Nothing is dropped and nothing is counted twice.
    expect(shelves.reduce((total, shelf) => total + shelf.rods.length, 0)).toBe(rods.length);
  });

  it('counts the ladder as met / total, and the total is the eleven the brief fixes', () => {
    expect(shelfCount(rods, [])).toBe(`0 / ${String(rods.length)}`);
    expect(rods).toHaveLength(11);
    const three = rods.slice(0, 3).map((rod) => rod.id);
    expect(shelfCount(rods, three)).toBe('3 / 11');
  });

  it('names the next rung of the ladder, and stops naming one at the top (§ S8)', () => {
    // 「累计 42 支 · 下一支解锁 75 支」 is a promise about the future, so the two things that would
    // make it a lie are: pointing at a rung that is already behind the player, and pointing at a
    // next rung after there is nothing left to unlock.
    const gates = rods
      .map((rod) => (rod.unlock.kind === 'sessions' ? rod.unlock.count : null))
      .filter((count): count is number => count !== null)
      .sort((a, b) => a - b);
    // One rod is `default` (nothing to work for), so the first *counted* rung is eight sticks in —
    // which is the deck's own second row: 「薄荷 已解锁 · 抽满 8 支」.
    expect(rods.filter((rod) => rod.unlock.kind === 'default')).toHaveLength(1);
    expect(gates[0]).toBe(8);
    for (const sticks of [0, 1, 7, 8, 19, 20, 41, 65, 419, 420, 900]) {
      const rung = nextRodGate(rods, sticks);
      if (rung) {
        expect(rung.at, `next rung at ${String(sticks)} is already met`).toBeGreaterThan(sticks);
        expect(rung.left).toBe(rung.at - sticks);
        expect(gates).toContain(rung.at);
      } else {
        expect(sticks, 'the ladder ran out too early').toBeGreaterThanOrEqual(
          gates[gates.length - 1] ?? 0,
        );
      }
    }
    // The deck's own example, read off the shipped table: at 42 sticks the next door is 65.
    expect(nextRodGate(rods, 42)).toEqual({ at: 65, left: 23 });
    expect(nextRodGate(rods, 420)).toBeNull();
  });

  it('never invents a family the ordering does not know about', () => {
    for (const rod of rods) {
      expect(['inhale', 'savor', 'filter']).toContain(rod.archive.kind);
    }
  });
});
