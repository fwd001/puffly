/**
 * The 统计 block, checked as a landing and as a set of numbers rather than as pixels.
 *
 * Two ways this rots silently, and both happened elsewhere in this app already:
 *  - a rail entry whose section no element answers to (the collected box was a tap that did nothing);
 *  - a number on screen that is not the ledger's, which is how a readout starts telling its own story.
 * So the file checks that the hook exists, and that every digit printed here is a named field of the
 * statistics layer or the live progress — never a literal, never a re-derivation.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY, type CopyKey } from '../i18n';
import { RAIL_ENTRIES } from '../rail';

const SHEET = readFileSync(new URL('../components/SessionSheet.vue', import.meta.url), 'utf8');

/** The `data-hook` values the break sheet can actually land on. */
const hooks = (source: string): string[] =>
  [...source.matchAll(/data-hook="([a-z-]+)"/g)].map((match) => match[1] ?? '');

/**
 * The labelled rows of the stats group, between its opening tag and the panel that follows.
 *
 * A function, not a module-level constant: an `expect` that runs at import turns a real failure
 * into a file that cannot be collected, and the suite then prints `no tests` instead of the one
 * thing that went wrong.
 */
function statsBlock(): string {
  const start = SHEET.indexOf('data-hook="stats"');
  expect(start, 'the break sheet lost its 统计 block').toBeGreaterThan(-1);
  const end = SHEET.indexOf('<ReductionPanel', start);
  return SHEET.slice(start, end);
}

describe('the 统计 block is a landing and a ledger (S11, S13)', () => {
  it('answers every break-sheet entry in the rail with an element', () => {
    const landed = hooks(SHEET).concat(
      hooks(readFileSync(new URL('../components/ReductionPanel.vue', import.meta.url), 'utf8')),
    );
    const asked = RAIL_ENTRIES.filter(
      (entry) => entry.sheet === 'break' && entry.section !== null,
    ).map((entry) => entry.section as string);
    expect(asked.length, 'the rail is supposed to ask for a section').toBeGreaterThan(0);
    for (const section of asked) {
      expect(landed, `rail entry ${section} has nothing to scroll to`).toContain(section);
    }
  });

  it('prints only numbers the ledger already has', () => {
    const fields = [...statsBlock().matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map(
      (match) => match[1] ?? '',
    );
    // Every one is a named fact off `stats` (the statistics layer), `summary` (the live ledger) or
    // `nextRod` (the ladder's own threshold). A digit written as a literal would land here unnamed.
    expect(fields.length, 'the block prints numbers').toBeGreaterThanOrEqual(5);
    const allowed =
      /^(stats\.[a-zA-Z0-9]+|summary\.[a-zA-Z0-9]+|sticksKept|hoursSmoked|nextRod\.at)$/;
    for (const field of fields) expect(field, `${field} is not a ledger field`).toMatch(allowed);
    expect(fields).toContain('stats.totalPuffs');
    expect(fields).toContain('stats.currentStreakDays');
    expect(fields).toContain('hoursSmoked');
  });

  it('names each row in both tiers that says words', () => {
    const keys = [...statsBlock().matchAll(/copy\.t\('([a-zA-Z0-9.]+)'\)/g)].map((m) => m[1] ?? '');
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const key of keys) {
      expect(COPY['en']?.[key as CopyKey], key).toBeTypeOf('string');
      expect(COPY['zh-CN']?.[key as CopyKey], key).toBeTypeOf('string');
    }
  });

  it('the group is not silent to a screen reader, and the minutes are minutes', () => {
    expect(statsBlock()).toContain("copy.say('rail.stats')");
    // The label says 总时长 and the digit is a count of minutes: the conversion has to be a
    // division by 60000 in one place, not a formatting choice in two.
    expect(SHEET).toMatch(/totalDurationMs \/ 60000/);
  });
});
