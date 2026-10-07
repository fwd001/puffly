/**
 * The six skins as shipped data (§ S15, § S18): four colour layers each, and a ladder that ends
 * on the collection rather than on volume. The last one is deliberately unreachable by grinding —
 * twelve boxes is a different question from four hundred and twenty sticks.
 */

import { describe, expect, it } from 'vitest';
import { FINDABLE_PACKS, SKINS } from '@puffly/game-content';

describe('the skin ladder', () => {
  it('is six skins, and a skin is four colours and nothing else', () => {
    expect(SKINS).toHaveLength(6);
    for (const skin of SKINS) {
      expect(Object.keys(skin.palette).sort()).toEqual(['ember', 'paper', 'pool', 'smoke']);
      expect(skin.name).not.toBe('');
      // No number anywhere in a skin: the redline is that there is nothing it could move.
      for (const value of Object.values(skin.palette)) {
        expect(value).toHaveLength(3);
        for (const channel of value) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it('climbs by cumulative sticks and finishes on the collection', () => {
    expect(SKINS.map((skin) => skin.unlock)).toEqual([
      { kind: 'default' },
      { kind: 'sessions', count: 40 },
      { kind: 'sessions', count: 120 },
      { kind: 'sessions', count: 260 },
      { kind: 'sessions', count: 420 },
      // Derived, not the sheet's literal twelve: two of the twelve slots carry no brand and can
      // never be found, so a typed 12 puts the last skin behind an unfinished collection.
      { kind: 'packs', count: FINDABLE_PACKS },
    ]);
  });

  it('names the last skin after the colour that ends the ladder', () => {
    expect(SKINS[SKINS.length - 1]?.id).toBe('cinnabar');
  });
});
