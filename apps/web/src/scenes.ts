/**
 * The rooms as a ladder — SPEC.md §23 (环境是数据) read the way §37 (成长按天数/次数) grows them.
 *
 * Seven places a break can happen already ship as content, each with its own `unlock` rule, but a
 * player could only ever see them as anonymous colour chips in 桌上其余. This names the axis each
 * door counts and puts them in the order a player actually meets them, so the row itself reads as
 * a set of tiers rather than as seven swatches.
 *
 * Nothing here decides *whether* a room is open: `ruleSatisfied` in the core does, and the sheet
 * asks the engine. This is only the shape the rung is shown in.
 */

import type { CollectionItem, UnlockRule } from '@puffly/game-core';
import type { CopyKey, I18n } from './i18n';

/** Which axis a door counts. `now` is the room the player already has. */
export type RungUnit = 'now' | 'level' | 'day' | 'breaks' | 'draws' | 'boxes';

/** The rung is shown as digits and *said* as a phrase, because "3" alone does not say what it
 * counts. One key per axis, so a new `UnlockRule` cannot borrow another axis's words. */
export const RUNG_KEYS: Record<RungUnit, CopyKey> = {
  now: 'a11y.rung.now',
  level: 'a11y.rung.level',
  day: 'a11y.rung.day',
  breaks: 'a11y.rung.breaks',
  draws: 'a11y.rung.draws',
  boxes: 'a11y.rung.boxes',
};

/**
 * The same axes as a mark, for the cards a player only looks at. Two rooms can sit on rung `14` —
 * one counted in days, one in breaks — so a bare number is not enough to read the row by.
 *
 * A mark means exactly one thing across the whole interface, which is the rule this table broke
 * when it borrowed `—` for the draws axis: `—` is the rod everywhere else (the rail's 支 entry and
 * the HUD's rod readout both wear it), so a smoke shape gated at `—120` read as *120 sticks* — a
 * tier off by an order of magnitude, on the one row the brief asks to be read as tiers. A day
 * stays bare, because the day ladder is the axis the whole interface is already counted on.
 * `mark-alphabet.test.ts` holds the alphabet apart.
 */
export const RUNG_MARKS: Record<RungUnit, string | null> = {
  now: null,
  level: '\u25c8',
  day: null,
  breaks: '◷',
  draws: '◡',
  boxes: '▭',
};

export interface Rung {
  unit: RungUnit;
  /** Arabic digits, so the tier survives the icons-only tier; `null` for the room open on day one. */
  step: string | null;
}

/**
 * The axes in the order a player meets them. A day count comes before a break count because the
 * day ladder is the one the journey line draws, so that is the axis a card's number most naturally
 * reads against.
 */
const AXIS_ORDER: Record<RungUnit, number> = {
  now: 0,
  level: 1,
  day: 2,
  breaks: 3,
  draws: 4,
  boxes: 5,
};

const UNIT_FOR: Record<UnlockRule['kind'], RungUnit> = {
  default: 'now',
  level: 'level',
  day: 'day',
  sessions: 'breaks',
  puffs: 'draws',
  packs: 'boxes',
};

/** The number each rule carries, under its own axis. Exhaustive on purpose: a new rule kind in
 * content must land here, not silently render as a room with no rung. */
const VALUE_FOR = (rule: UnlockRule): number | null => {
  switch (rule.kind) {
    case 'default':
      return null;
    case 'level':
      return rule.level;
    case 'day':
      return rule.day;
    case 'sessions':
      return rule.count;
    case 'puffs':
      return rule.count;
    case 'packs':
      return rule.count;
    default:
      return null;
  }
};

export function rungOf(rule: UnlockRule): Rung {
  const unit = UNIT_FOR[rule.kind] ?? 'day';
  const value = VALUE_FOR(rule);
  return { unit, step: value === null ? null : String(value) };
}

/**
 * What a locked card actually shows: the axis's mark and the number. `◷14` and `14` are different
 * doors, and the row must not be able to draw two rooms identically.
 */
export function rungShown(item: CollectionItem): string {
  return rungShownFor(item.unlock);
}

/** The same mark for anything that carries an `UnlockRule`, which is how the rod tiles join in. */
export function rungShownFor(rule: UnlockRule): string {
  const rung = rungOf(rule);
  return `${RUNG_MARKS[rung.unit] ?? ''}${rung.step ?? ''}`;
}

/** The axis and its number, in words: what the digits above actually count. */
export function rungSpokenFor(copy: I18n, rule: UnlockRule): string {
  const rung = rungOf(rule);
  return copy.say(RUNG_KEYS[rung.unit], { n: rung.step ?? '' });
}

/**
 * The card's whole spoken name, in the one order every card on this sheet uses: what it is, which
 * rung opens it, and whether it is still shut.
 *
 * Four grids used to write this sentence themselves — the rooms with all three parts, the props and
 * the skins without the rung, and the rod tiles with a lock mark bolted on at the end. The version
 * that left the rung out was not shorter for a screen reader, it was silent about the one fact that
 * tells you why the card is dim.
 */
export function cardLabel(copy: I18n, name: string, rule: UnlockRule, locked: boolean): string {
  const parts = [name, rungSpokenFor(copy, rule)];
  if (locked) parts.push(copy.say('a11y.tileLocked'));
  return parts.join(' · ');
}

/** Rooms first-open, then by the number on their own axis, then by axis. */
export function byRung(items: readonly CollectionItem[]): CollectionItem[] {
  return [...items].sort((a, b) => {
    const ra = rungOf(a.unlock);
    const rb = rungOf(b.unlock);
    const byStep = Number(ra.step ?? 0) - Number(rb.step ?? 0);
    if (byStep !== 0) return byStep;
    return AXIS_ORDER[ra.unit] - AXIS_ORDER[rb.unit];
  });
}

/** "2 / 7" — how much of the set this player has actually walked into. */
export function rungCount(items: readonly CollectionItem[], unlocked: readonly string[]): string {
  return `${String(items.filter((item) => unlocked.includes(item.id)).length)} / ${String(items.length)}`;
}
