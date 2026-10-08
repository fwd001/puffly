/**
 * What an id in the cabinet means to the archive card — S17 for a rod, S18 for a box.
 *
 * A module of its own because it is the whole answer to "what opens when this is tapped", and the
 * bug it now carries a test for was exactly that: the shelf emits one event for both cabinets, the
 * resolver only ever looked at rods, and a collected box answered with nothing at all. That is a
 * claim about a mapping, not about Vue, so it is checked here without a component tree.
 */

import { PACKS } from '@puffly/game-content';
import type { ContentLookup } from '@puffly/game-core';

/**
 * Minutes for the whole stick, to a tenth: the middle of this rod's own burn range. S8 puts this
 * number on the tile and S17 puts it on the card, so it is divided in one place — the two lines
 * cannot then disagree about what the same rod takes to finish.
 */
export function rodMinutes(rod: { burnDuration: { min: number; max: number } }): string {
  return ((rod.burnDuration.min + rod.burnDuration.max) / 2 / 60_000).toFixed(1);
}

/** S17's card about a rod in the hand. Every number here is content or the rod's own arithmetic. */
export interface RodArchiveFacts {
  subject: 'rod';
  name: string;
  zhName: string;
  kind: 'inhale' | 'savor' | 'filter';
  /** Minutes for the whole stick, to a tenth: the middle of this rod's own burn range. */
  minutes: string;
  puffs: number;
  tempLow: number;
  tempHigh: number;
  /** 场合, named by the rooms the content says this rod belongs in. */
  scenes: string[];
}

/**
 * S18's card about a box on the shelf. The deck's five archive fields, all of them optional,
 * because the deck gives text for nine brands and none for the tenth — and a field invented to fill
 * a row is the fabrication §10 rules out, so an absent one stays absent and the card says less.
 *
 * No price comparison lives here. `price` is one brand's own reference range, shown one at a time
 * on this card and never on the twelve-slot grid, which is where a row of figures would become a
 * table (§ brandsInArchive, and the brief's own three bottom lines).
 */
export interface BoxArchiveFacts {
  subject: 'box';
  name: string;
  tier: 'low' | 'mid' | 'high';
  price?: string;
  history?: string;
  occasion?: string;
  crowd?: string;
  gender?: string;
  daily?: string;
}

export type ArchiveFacts = RodArchiveFacts | BoxArchiveFacts;

/**
 * One id, whichever cabinet it came from: a rod's for S17, a box's for S18. The shelf emits the
 * same event for both, so resolving only rods is what made a collected box a dead tap — the card
 * was handed null and the row gave no answer at all.
 */
export function archiveFacts(content: ContentLookup, id: string): ArchiveFacts | null {
  const box = PACKS.find((entry) => entry.id === id);
  if (box && box.brand !== '') {
    // Named one by one rather than spread: the content field carries the currency in its name
    // (`priceCny`) and the card field does not, so a spread hands the card an undefined `price`.
    const archive = box.archive;
    return {
      subject: 'box',
      name: box.brand,
      tier: box.tier,
      price: archive?.priceCny,
      history: archive?.history,
      occasion: archive?.occasion,
      crowd: archive?.crowd,
      gender: archive?.gender,
      daily: archive?.daily,
    };
  }
  const rod = content.cigarettes().find((entry) => entry.id === id);
  if (!rod) return null;
  return {
    subject: 'rod',
    name: rod.name,
    zhName: rod.archive.zhName,
    kind: rod.archive.kind,
    minutes: rodMinutes(rod),
    puffs: rod.physical.puffs.target,
    tempLow: rod.physical.centerTempC[0],
    tempHigh: rod.physical.centerTempC[1],
    scenes: rod.environmentBias
      .map((envId) => content.environments().find((env) => env.id === envId)?.name)
      .filter((name): name is string => typeof name === 'string'),
  };
}
