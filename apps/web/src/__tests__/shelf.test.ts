/**
 * The cabinet's ordering and count, checked as data: S8 says "3 / 11" and S8b says the ladder is
 * read by what the hand does, so both are claims about the shipped content that can be wrong.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { shelfCount, shelvesOf } from '../shelf';

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

  it('never invents a family the ordering does not know about', () => {
    for (const rod of rods) {
      expect(['inhale', 'savor', 'filter']).toContain(rod.archive.kind);
    }
  });
});
