/**
 * The cabinet's ordering and count, checked as data: S8 says "3 / 11" and S8b says the ladder is
 * read by what the hand does, so both are claims about the shipped content that can be wrong.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, createDefaultLookup } from '@puffly/game-content';
import { createI18n, rodNoteKey } from '../i18n';
import { cardLabel, rungShownFor } from '../scenes';
import { nextRodGate, shelfCount, shelvesOf } from '../shelf';
import { archiveFacts, rodMinutes } from '../archiveModel';

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

  it('every rod has one word for what it is like to smoke, in both tiers that say words', () => {
    // S8's second line on each tile. A word, not a sentence and not a number: the tile is read by
    // the chip and the rung on the icons tier, and a figure here would need the card's 口径 line to
    // mean anything.
    for (const locale of ['en', 'zh-CN'] as const) {
      for (const rod of rods) {
        // Read through the same lookup the tile uses, so this also proves the key is *registered*
        // rather than merely cast into the key type.
        const key = rodNoteKey(rod.id);
        expect(key, `${rod.id} has no note in the English table`).toBeTypeOf('string');
        const value = key === undefined ? null : copyOf(locale).t(key);
        expect(value, `${locale}:${rod.id}`).toBeTypeOf('string');
        const text = value ?? '';
        expect(text.trim(), `${locale}:${rod.id} is empty`).not.toBe('');
        expect(text, `${locale}:${rod.id} says a sentence`).not.toMatch(/[.。!?]/);
        expect(text, `${locale}:${rod.id} carries a figure`).not.toMatch(/[0-9]/);
      }
    }
    // The third tier has nothing to say, and the tile has to be able to show nothing.
    for (const rod of rods) expect(noteOf('icons', rod.id)).toBeNull();
  });

  it('a locked rod card carries the rung it is waiting on, as digits', () => {
    const marks = rods.map((rod) => rungShownFor(rod.unlock));
    // The one free rod shows no number, because it has no threshold to show.
    expect(marks[0] ?? '').toBe('');
    for (const [index, rod] of rods.entries()) {
      if (index === 0) continue;
      expect(marks[index], rod.id).toMatch(/^[^0-9]*[0-9]+$/);
    }
    // And no two locked rods share a mark, or the row cannot be read as a ladder.
    const rest = marks.slice(1);
    expect(new Set(rest).size, JSON.stringify(rest)).toBe(rest.length);
  });

  it('the card sentence has one home, and it always says which rung opens', () => {
    const spoken = cardLabel(copyOf('zh-CN'), '夜航 Night', { kind: 'sessions', count: 40 }, true);
    expect(spoken).toContain('40');
    expect(spoken.split(' · ')).toHaveLength(3);
    expect(spoken, 'the locked mark has to come last, in every language').toMatch(/还没抽到$/);
    expect(cardLabel(copyOf('en'), 'X', { kind: 'default' }, false).split(' · ')).toHaveLength(2);
    expect(
      cardLabel(copyOf('en'), 'X', { kind: 'default' }, true),
      'a free card still needs the lock said once',
    ).toMatch(/not met yet$/);

    // The sentence used to be written four times, twice without the rung. One home is only true while
    // the components stop bolting their own versions together.
    const files = readdirSync(new URL('../components', import.meta.url)).filter((name) =>
      name.endsWith('.vue'),
    );
    const handWritten = files
      .map((name) => readFileSync(new URL(`../components/${name}`, import.meta.url), 'utf8'))
      // Comments are allowed to name the key — this file's own reasoning does — so they come out
      // before the scan, the same way the architecture guards strip them.
      .map((text) => text.replace(/\/\*[\S\s]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' '))
      .filter((text) => text.includes("'a11y.tileLocked'"));
    expect(handWritten, 'a component is composing the card sentence again').toEqual([]);
  });

  it('never invents a family the ordering does not know about', () => {
    for (const rod of rods) {
      expect(['inhale', 'savor', 'filter']).toContain(rod.archive.kind);
    }
  });

  it('says the same minutes on the tile and on the card, because they are one division', () => {
    // S8's third line and S17's 口径 line are the same number in two places. The bug this keeps out
    // is the ordinary one: the tile gets its own arithmetic, the content's window moves, and the two
    // screens start disagreeing about how long the same rod takes.
    const lookup = createDefaultLookup();
    for (const rod of rods) {
      const shown = rodMinutes(rod);
      expect(shown, `${rod.id} is not to a tenth`).toMatch(/^\d+\.\d$/);
      const card = archiveFacts(lookup, rod.id);
      expect(card && card.subject === 'rod' ? card.minutes : null, rod.id).toBe(shown);
      console.log(`TILE ${rod.id.padEnd(10)} ${shown} min`);
    }
  });

  it('keeps the length as digits when the tier stops saying words', () => {
    // The tile's own shape claim, read off the component because there is no harness here: the
    // number must live outside the gate that drops the words, and the unit must live inside one.
    const tile = readFileSync(new URL('../components/ArchiveTile.vue', import.meta.url), 'utf8');
    const from = tile.indexOf('<span v-if="minutes');
    expect(from, 'the tile no longer shows a length').toBeGreaterThan(-1);
    const block = tile.slice(from, tile.indexOf('</button>', from));
    expect(block).toContain('<span class="digits">{{ minutes }}</span>');
    expect(block).toContain('v-if="unit !== null"');
    // The names block is the one the icons tier empties; if the length ever moves inside it, the
    // number goes with the words and the wordless tier loses the only figure S8 asks it to keep.
    expect(tile.slice(0, from)).toContain('v-if="copy.t(\'shelf.rods\') !== null"');
    expect(block).not.toContain('shelf.rods');
  });
});

function copyOf(locale: 'en' | 'zh-CN' | 'icons') {
  return createI18n(locale);
}

/** What the tile would actually show for this rod, in this tier. */
function noteOf(locale: 'en' | 'zh-CN' | 'icons', id: string): string | null {
  const key = rodNoteKey(id);
  return key === undefined ? null : copyOf(locale).t(key);
}
