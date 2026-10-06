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
    // 一开始就在 is not a rung with a number on it: the first room shows no digits at all.
    const open = rooms().filter((room) => room.unlock.kind === 'default');
    for (const room of open) expect(rungOf(room.unlock).step).toBeNull();
  });

  it('orders them by the rung, so the row itself reads as tiers', () => {
    const ladder = byRung(rooms());
    const days = ladder
      .filter((room) => rungOf(room.unlock).unit === 'day')
      .map((room) => Number(rungOf(room.unlock).step));
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(rungOf(ladder[0]?.unlock ?? { kind: 'default' }).unit).toBe('now');
  });

  it('never draws two rooms the same way, so the row can be read by looking', () => {
    // Night City is day 14 and Mountain is 14 breaks. Without the axis mark both cards would print
    // the same two digits, which is the difference this assertion exists to keep.
    const shown = rooms()
      .map(rungShown)
      .filter((text) => text !== '');
    expect(shown).toHaveLength(rooms().length - 1);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('counts the set as entered / total, and the total is the seven the brief fixes', () => {
    const all = rooms();
    expect(rungCount(all, [])).toBe(`0 / ${String(all.length)}`);
    expect(all).toHaveLength(7);
    const three = all.slice(0, 3).map((room) => room.id);
    expect(rungCount(all, three)).toBe('3 / 7');
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
