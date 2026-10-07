/**
 * S10's sidebar: the eight places a player can go from the desk, in the order the design lists them.
 *
 * The phone reaches the same eight through the row, the rail and one scrollable sheet; the PC keeps
 * them as a standing column (S10 侧栏 7 入口, plus 统计 from S11) because there is room and because
 * hunting for a tab in the chrome is not a reason to hide a destination. `sheet` is what opens on the
 * phone, `section` is where in that sheet it lands — one navigation model, two densities. 统计 lands
 * on a section of the break sheet rather than on a sheet of its own for the same reason 减量 does:
 * the numbers are about the breaks, and a second scrollable panel would put them two taps away from
 * the panel they belong to.
 */

import type { CopyKey } from './i18n';

export type Destination = 'break' | 'shelf' | 'settings';

export interface RailEntry {
  readonly id: string;
  readonly key: CopyKey;
  readonly glyph: string;
  readonly sheet: Destination;
  readonly section: string | null;
}

/** The marks are the cabinet's own: one shape means one thing across the whole interface. */
export const RAIL_ENTRIES: readonly RailEntry[] = [
  { id: 'break', key: 'rail.break', glyph: '◷', sheet: 'break', section: null },
  { id: 'ladder', key: 'shelf.rods', glyph: '—', sheet: 'shelf', section: 'rods' },
  { id: 'boxes', key: 'shelf.packs', glyph: '▭', sheet: 'shelf', section: 'packs' },
  { id: 'skins', key: 'shelf.skins', glyph: '✦', sheet: 'shelf', section: 'skins' },
  { id: 'kit', key: 'shelf.kit', glyph: '⌗', sheet: 'shelf', section: 'kit' },
  // S11 lists 统计 as its own entry; the four numbers behind it are S13's.
  { id: 'stats', key: 'rail.stats', glyph: '▤', sheet: 'break', section: 'stats' },
  { id: 'reduction', key: 'rail.reduction', glyph: '▮', sheet: 'break', section: 'reduction' },
  { id: 'settings', key: 'tab.settings', glyph: '☼', sheet: 'settings', section: null },
];

/** Which entry, if any, is the sheet the player is looking at. */
export function entryFor(
  sheet: Destination | 'none',
  section: string | null,
): RailEntry | undefined {
  if (sheet === 'none') return undefined;
  return RAIL_ENTRIES.find((entry) => entry.sheet === sheet && entry.section === section);
}
