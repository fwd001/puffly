/**
 * The six skins as shipped data (§ S15, § S18): four colour layers each, and a ladder that ends
 * on the collection rather than on volume. The last one is deliberately unreachable by grinding —
 * twelve boxes is a different question from four hundred and twenty sticks.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, FINDABLE_PACKS, SKINS } from '@puffly/game-content';
import { COPY, type CopyKey } from '../i18n';
import { presetForSkin } from '../skinPreset';

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

/**
 * S17's second half — 稿子写的「外加一个环境预设」, which 2026-10-08 拍板 released under one condition:
 * a skin may bring a place, and may still not move a number. These judge the shipped data against that
 * sentence, because "the field exists" is not the claim — a pointer nobody can follow, or a place that
 * opens a locked door, would both leave the redline broken while the type checked out.
 */
describe('a skin may bring a place, and only an open one (S17)', () => {
  const PLACES = DEFAULT_CONTENT.environments.map((place) => place.id);

  it('carries nothing that could move a number', () => {
    // The shape of a skin, now that one more optional field is allowed: four colour layers, an id,
    // a name, a gate, and at most a place's name. Anything else in here is a number someone could
    // read as difficulty, and that is the one thing this product decided cosmetics may not be.
    const allowed = new Set(['id', 'name', 'palette', 'unlock', 'environmentId']);
    for (const skin of SKINS) {
      for (const key of Object.keys(skin)) expect(allowed.has(key), `${skin.id}.${key}`).toBe(true);
      if (skin.environmentId !== undefined) {
        expect(PLACES, `${skin.id} brings a place nobody has`).toContain(skin.environmentId);
        expect(typeof skin.environmentId).toBe('string');
      }
    }
    const withPreset = SKINS.filter((skin) => skin.environmentId !== undefined);
    console.log(
      `PRESET ${String(withPreset.length)} of ${String(SKINS.length)} skins bring a place: ` +
        withPreset.map((skin) => `${skin.id}→${String(skin.environmentId)}`).join(' '),
    );
    // At least one, or the field is a dead shape and the ruling was not actually implemented.
    expect(withPreset.length, 'no skin brings the place the deck asks for').toBeGreaterThan(0);
  });

  it('moves the player only into a place they have already reached', () => {
    const night = SKINS.find((skin) => skin.environmentId !== undefined);
    expect(night?.environmentId, 'the preset skin lost its place').toBeTypeOf('string');
    expect(presetForSkin(night, ['night-city'])).toBe('night-city');
    // The locked case is the whole point: wearing a colour must not be a way past the ladder.
    expect(presetForSkin(night, ['quiet-room'])).toBeNull();
    expect(presetForSkin(night, [])).toBeNull();
    // A skin with no preset never moves anybody, and a missing skin is not a crash.
    expect(presetForSkin({}, PLACES)).toBeNull();
    expect(presetForSkin(undefined, PLACES)).toBeNull();
  });

  it('is wired into the card, so the answer is used rather than computed and dropped', () => {
    // Reading the wiring, not the rendered DOM: the decision is pure and judged above; what could go
    // wrong here is a sheet that asks it and then throws the answer away.
    const sheet = readFileSync(
      new URL('../components/CollectionSheet.vue', import.meta.url),
      'utf8',
    );
    expect(sheet).toContain('presetForSkin(skin,');
    expect(sheet).toContain('props.game.select({ environment: place })');
    // The card carries the place it brings, so the browser layer can see it without reading a word.
    expect(sheet).toContain(':data-preset="skin.environmentId ?? \'\'"');
    // And the spoken label names it, in the tier that speaks.
    expect(sheet).toContain('a11y.skin.preset');
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(COPY[locale]?.['a11y.skin.preset' as CopyKey], locale).toBeTypeOf('string');
    }
  });
});
