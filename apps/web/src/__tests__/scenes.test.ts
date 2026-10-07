/**
 * The rooms as a ladder, checked as data: §23 says seven places ship, §37 says growth is a day or a
 * count, and §9 says a word may fall away while an announced name never may. All three are claims
 * about the shipped content that can quietly stop being true — a room can lose its rung, a new
 * `UnlockRule` kind can borrow another axis's words, a heading can start speaking on the icons tier.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { CollectionCategory, type CollectionItem } from '@puffly/game-core';
import { RUNG_KEYS, byRung, rungCount, rungOf, rungShown } from '../scenes';
import { COPY, announce, translate } from '../i18n';
import { EN } from '../i18n/copy';

const rooms = (): CollectionItem[] =>
  DEFAULT_CONTENT.environments.map((env) => ({
    category: CollectionCategory.ENVIRONMENTS,
    id: env.id,
    name: env.name,
    unlock: env.unlock,
    glyph: '',
    swatch: env.background.sky[0] ?? [0, 0, 0],
  }));

describe('the rooms are a set with a ladder (§23, §37)', () => {
  it('carries every room the content defines, none dropped and none twice', () => {
    const ladder = byRung(rooms());
    expect(ladder.map((room) => room.id).sort()).toEqual(
      DEFAULT_CONTENT.environments.map((env) => env.id).sort(),
    );
    expect(ladder).toHaveLength(DEFAULT_CONTENT.environments.length);
  });

  it('names one axis per room, so a number on a card always says what it counts', () => {
    for (const room of rooms()) {
      const rung = rungOf(room.unlock);
      expect(Object.keys(RUNG_KEYS)).toContain(rung.unit);
    }
    // Every room now carries a number. There used to be one `default` room with no digits at all;
    // the ladder starts at level 1 instead, so the first card says "1" and the row is one scale
    // from end to end (§6.1).
    for (const room of rooms()) expect(rungOf(room.unlock).step, room.id).not.toBeNull();
  });

  it('orders them by the rung, so the row itself reads as tiers', () => {
    const ladder = byRung(rooms());
    const levels = ladder.map((room) => Number(rungOf(room.unlock).step));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(levels[0]).toBe(1);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it('never draws two rooms the same way, so the row can be read by looking', () => {
    // Night City is day 14 and Mountain is 14 breaks. Without the axis mark both cards would print
    // the same two digits, which is the difference this assertion exists to keep.
    const shown = rooms()
      .map(rungShown)
      .filter((text) => text !== '');
    expect(shown).toHaveLength(rooms().length);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('stands on one axis now, and still tells a count from a day if one ever returns', () => {
    // Mountain was the last room counted in breaks; it sits on day 45 now, so the row is one
    // ladder and every number on it means the same thing.
    for (const room of rooms()) {
      expect(rungOf(room.unlock).unit, `${room.id} is counted on another axis`).toBe('level');
    }
    // The break mark is kept because a room may be counted in breaks again, and then a bare 14
    // would be the same door twice. Nothing in the shipped content exercises it, so this does.
    const base = rooms()[0] as CollectionItem;
    const day = rungShown({ ...base, id: 'by-day', unlock: { kind: 'day', day: 14 } });
    const breaks = rungShown({ ...base, id: 'by-breaks', unlock: { kind: 'sessions', count: 14 } });
    expect(day).toBe('14');
    expect(breaks).toBe('\u25f714');
    expect(breaks).not.toBe(day);
  });

  it('counts the set as entered / total, and the total is the twenty-one the ladder holds', () => {
    // The brief's mock-up drew seven rooms, the player asked for a stairwell and a smoking corner by
    // name, and the deck's 「吸烟场所 · 12 个场景」 plus their 网吧 brought it to twenty-one. This number is
    // the set the content actually ships, so adding a place means naming it here.
    const all = rooms();
    expect(rungCount(all, [])).toBe(`0 / ${String(all.length)}`);
    expect(all).toHaveLength(21);
    const three = all.slice(0, 3).map((room) => room.id);
    expect(rungCount(all, three)).toBe('3 / 21');
  });
});

describe('the ladder speaks to a reader and stays marks on screen (§9)', () => {
  it('lets the heading fall away on the icons tier, but never the rung', () => {
    expect(translate('icons', 'shelf.scenes')).toBeNull();
    expect(announce('icons', 'a11y.rung.day', { n: '3' })).toBe('day 3');
    expect(announce('icons', 'a11y.rung.breaks', { n: '14' })).toBe('14 breaks');
  });

  it('announces every room with its own rung, in Chinese too', () => {
    for (const room of rooms()) {
      const rung = rungOf(room.unlock);
      const spoken = announce('zh-CN', RUNG_KEYS[rung.unit], { n: rung.step ?? '' });
      expect(spoken.length).toBeGreaterThan(0);
      expect(spoken).not.toContain('{n}');
      expect(announce('zh-CN', 'a11y.scene', { name: room.name })).toContain(room.name);
    }
    expect(announce('zh-CN', 'a11y.rung.day', { n: '7' })).toBe('第 7 天');
  });

  it('has an English anchor for every rung key, because a control with no name is a broken one', () => {
    for (const key of Object.values(RUNG_KEYS)) {
      expect(EN[key]).toBeTruthy();
      expect(COPY['zh-CN']?.[key]).toBeTruthy();
    }
  });
});
