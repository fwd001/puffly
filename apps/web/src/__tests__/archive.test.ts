/**
 * The two redlines the archive has to keep, checked against the shipped data rather than
 * against prose: an estimate must announce itself with ≈, and a fictional rod must not be
 * given a real brand's facts.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDefaultLookup, DEFAULT_CONTENT, PACKS } from '@puffly/game-content';
import { archiveFacts } from '../archiveModel';
import { COPY, type CopyKey } from '../i18n';

/** §dataHonesty: a range without its ≈ is a claim, not an estimate. */
const APPROXIMATIONS: readonly CopyKey[] = ['archive.range'];

describe('the archive data rules (§10, §13)', () => {
  it('every estimate in the copy table carries its ≈, in every language that says it', () => {
    for (const [locale, table] of Object.entries(COPY)) {
      for (const key of APPROXIMATIONS) {
        const value = table?.[key];
        if (value === undefined) continue;
        expect(value, `${locale}:${key}`).toContain('≈');
      }
    }
    // And the guard is not vacuous: the English and Chinese rows are both there to be read.
    expect(COPY.en?.['archive.range']).toBeTypeOf('string');
    expect(COPY['zh-CN']?.['archive.range']).toBeTypeOf('string');
  });

  it('the three figures on the card belong to this game, and the card says so', () => {
    // The number on the card is arithmetic on the rod's own burn range — not a claim about how long
    // a real stick of the kind lasts, which is what the design's 10.0-minute table is. The 口径 line
    // exists so the two cannot be read as each other.
    const lookup = createDefaultLookup();
    for (const rod of DEFAULT_CONTENT.cigarettes) {
      const facts = archiveFacts(lookup, rod.id);
      expect(facts?.subject, rod.id).toBe('rod');
      if (facts && facts.subject === 'rod') {
        const middle = (rod.burnDuration.min + rod.burnDuration.max) / 2;
        expect(facts.minutes, rod.id).toBe((middle / 60_000).toFixed(1));
        expect(facts.puffs, rod.id).toBe(rod.physical.puffs.target);
      }
    }
    const basis: Record<string, string | undefined> = {};
    for (const locale of ['en', 'zh-CN']) {
      basis[locale] = COPY[locale]?.['archive.basis' as CopyKey];
      expect(basis[locale], locale).toBeTypeOf('string');
      // It names this work as the source, and it does not borrow the mark that means "estimate".
      expect(`${locale}:${String(basis[locale])}`).toMatch(/本作|this game/);
      expect(`${locale}:${String(basis[locale])}`).not.toContain('≈');
    }
    // Icons tier: no sentence, so the card must be able to show none.
    expect(COPY.ar?.['archive.basis' as CopyKey] ?? undefined).toBeUndefined();
    // Read the line's own opening tag rather than the next 200 characters: the paragraph after it is
    // gated on a rod as well, so a forward scan cannot tell the two apart — a version of this case
    // stayed green while the line was attached to a box card, which has none of these figures.
    const card = readFileSync(new URL('../components/ArchiveCard.vue', import.meta.url), 'utf8');
    const at = card.indexOf("t('archive.basis')");
    expect(at, 'the card lost its basis line').toBeGreaterThan(-1);
    const open = card.slice(card.lastIndexOf('<p', at), card.indexOf('>', at));
    expect(open, 'the basis line is not gated on a rod').toContain('rod !== null');
    expect(open, 'the basis line moved to a box card').not.toContain('box !== null');
    // `.range` is the class the browser layer reads to find *the estimate* — the line whose figure
    // carries ≈. Reusing it for a line that quotes the game's own table made the first `.range` in
    // the card the wrong one, and the real browser caught it; the class is the marker, so the
    // marker's uniqueness is the thing to hold.
    expect(
      open,
      'the basis line borrowed the class that means "this figure is an estimate"',
    ).toContain('class="basis"');
    expect(card.match(/class="range"/g)?.length ?? 0).toBe(2);
  });

  it('every rod names its own category and family, because the card has nothing else to say', () => {
    for (const rod of DEFAULT_CONTENT.cigarettes) {
      expect(rod.archive.zhName, rod.id).not.toBe('');
      expect(['inhale', 'savor', 'filter']).toContain(rod.archive.kind);
      // The three tier-two cells are all arithmetic on content the rod already carries.
      expect(rod.physical.puffs.target, rod.id).toBeGreaterThan(0);
      expect(rod.physical.centerTempC[0], rod.id).toBeLessThan(rod.physical.centerTempC[1]);
    }
  });

  it('no fictional rod borrows a real brand name (§13: brands are archive data, not objects)', () => {
    const brands = [
      '中华',
      '玉溪',
      '芙蓉王',
      '黄鹤楼',
      '红塔山',
      '利群',
      '白沙',
      '南京',
      '和天下',
      '1916',
    ];
    for (const rod of DEFAULT_CONTENT.cigarettes) {
      const text = `${rod.name} ${rod.archive.zhName}`;
      for (const brand of brands) expect(text, rod.id).not.toContain(brand);
    }
  });
});
/**
 * The other half of §13: a brand is archive data, so it must not be able to leak into the loop.
 * Checked against the shipped source of the three chrome pieces and the copy table's loop keys,
 * because "we only show brands in the cabinet" is the kind of sentence that decays into a bug.
 */
describe('brands stay in the archive (§ redlines.noAdvertising)', () => {
  const brands = PACKS.filter((pack) => pack.brand !== '').map((pack) => pack.brand);

  it('the loop chrome never names a brand', () => {
    const loop = [
      'components/HudBar.vue',
      'components/CtaPill.vue',
      'components/TabRail.vue',
      'components/ArchiveCard.vue',
      'App.vue',
    ];
    for (const file of loop) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const brand of brands) expect(source, file).not.toContain(brand);
    }
  });

  it('the words the loop can show carry no brand and no price', () => {
    const keys = Object.keys(COPY.en ?? {}).filter(
      (key) =>
        key.startsWith('hint.') ||
        key.startsWith('cta.') ||
        key.startsWith('tab.') ||
        key.startsWith('state.'),
    );
    expect(keys.length).toBeGreaterThan(15);
    for (const key of keys) {
      for (const locale of ['en', 'zh-CN'] as const) {
        const value = COPY[locale]?.[key as CopyKey] ?? '';
        for (const brand of brands) expect(value, `${locale}:${key}`).not.toContain(brand);
        expect(value, `${locale}:${key}`).not.toMatch(/\u2248\s?\d/);
      }
    }
  });

  it('the family a rod is filed in and the draw it asks for are one fact (§14, 品鉴型)', () => {
    for (const rod of DEFAULT_CONTENT.cigarettes) {
      const mouthed = rod.archive.kind === 'savor';
      // Both directions, so a rod cannot be filed as a cigar and inhaled like a cigarette — or
      // the reverse: a new savour rod has to say the hold, and a new one that inhales must not.
      const draw = {
        holdsItsSmoke: rod.puffProfile.savourMs > 0,
        leavesNoLungResistance: rod.puffProfile.loadPerPuff === 0,
        breathesOutSlowly: rod.puffProfile.exhaleMs > 0,
      };
      expect(draw, rod.id).toEqual({
        holdsItsSmoke: mouthed,
        leavesNoLungResistance: mouthed,
        breathesOutSlowly: mouthed,
      });
    }
    // The three are the ladder's own shape: 小雪茄 / 雪茄 / 斗烟.
    const savoured = DEFAULT_CONTENT.cigarettes
      .filter((rod) => rod.archive.kind === 'savor')
      .map((rod) => rod.id);
    expect(savoured.sort()).toEqual(['cigar', 'cigarillo', 'pipe']);
  });
});

describe('a collected box opens its own archive (S18)', () => {
  const content = createDefaultLookup();

  it('answers a box id with the box, not with nothing', () => {
    // The bug: the shelf emits one event for both cabinets and the resolver only knew rods, so
    // tapping a box on the shelf produced no card at all — a control that does nothing.
    const facts = archiveFacts(content, 'baisha-soft');
    expect(facts?.subject, 'a named box resolved to nothing').toBe('box');
    if (facts?.subject !== 'box') return;
    expect(facts.name).toBe('白沙软');
    expect(facts.tier).toBe('low');
    // The deck's five fields, transcribed for the brands it writes about.
    expect(facts.history, 'the deck gives this brand a history').toBeTruthy();
    expect(facts.occasion, 'the deck gives this brand an occasion').toBeTruthy();
    expect(facts.crowd, 'the deck gives this brand a crowd').toBeTruthy();
    expect(facts.gender, 'the deck gives this brand a gender line').toBeTruthy();
    expect(facts.daily).toContain('≈');
  });

  it('invents nothing for a brand the deck says nothing about, and nothing for an empty slot', () => {
    const hetianxia = archiveFacts(content, 'hetianxia');
    expect(hetianxia?.subject).toBe('box');
    if (hetianxia?.subject !== 'box') return;
    expect(hetianxia.price).toContain('≈');
    // The deck lists this brand's price and never writes its archive. A row invented to keep the
    // card full is the fabrication §10 rules out, so the card says less instead.
    expect(hetianxia.history, 'a sentence nobody published').toBeUndefined();
    expect(hetianxia.occasion).toBeUndefined();
    // A slot nobody named is a gap in the collection, not an entry with an empty name.
    expect(archiveFacts(content, 'mid-empty-a')).toBeNull();
    expect(archiveFacts(content, 'not-a-thing-at-all')).toBeNull();
  });

  it('still answers a rod id with the rod, in the shape the card already reads', () => {
    const facts = archiveFacts(content, 'classic');
    expect(facts?.subject).toBe('rod');
    if (facts?.subject !== 'rod') return;
    expect(Number(facts.minutes)).toBeGreaterThan(0);
    expect(facts.puffs).toBeGreaterThan(0);
    expect(facts.tempHigh).toBeGreaterThan(facts.tempLow);
    expect(facts.scenes.length, 'the rod names the rooms it belongs in').toBeGreaterThan(0);
  });

  it('has a label for every field it can show, in both languages that say words', () => {
    const keys: CopyKey[] = [
      'archive.tier.low',
      'archive.tier.mid',
      'archive.tier.high',
      'archive.price',
      'archive.history',
      'archive.occasion',
      'archive.crowd',
      'archive.gender',
      'archive.daily',
      'archive.disclaimer',
    ];
    // Read the table rather than the key's own name: an assertion about `${locale}:${key}` is
    // true whether or not the row exists, which is how a missing label would ship.
    for (const locale of ['en', 'zh-CN'] as const) {
      for (const key of keys) {
        expect(COPY[locale]?.[key], `${locale}:${key}`).toBeTypeOf('string');
      }
    }
    // And the compliance line is a limit, not a marketing sentence: no brand, no advice.
    const disclaimer = COPY['zh-CN']?.['archive.disclaimer'] ?? '';
    expect(disclaimer).toContain('不画商标');
    for (const pack of PACKS) if (pack.brand) expect(disclaimer).not.toContain(pack.brand);
  });
});
