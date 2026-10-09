/**
 * The six skins — S15 and S18 of the brief, with its own numbers.
 *
 * Each one is four colours and, if it brings a place at all, the place it is named for: the paper,
 * the cherry, the plume and the pool of light the table sits in. That is the whole of what a skin has
 * with the simulation, and it is the redline made physical — a palette that could also move a duration
 * would turn cosmetics into difficulty. The last one is gated on the collection rather than on volume,
 * so it cannot be ground out; it has to be looked for.
 *
 * Only 夜航 names a place, because only its own name says one (`night-city` is the night skyline the
 * word points at). 雪夜 would want snow, and this build's weather has no snow — inventing a pairing to
 * fill the row would be putting my content into the deck's mouth, so the other five bring colours only.
 */

import { rgb } from '@puffly/shared';
import { FINDABLE_PACKS } from './packs';
import type { SkinContent } from '@puffly/game-core';

export const SKINS: SkinContent[] = [
  {
    id: 'night',
    name: '夜航 Night',
    palette: {
      paper: rgb(245, 240, 230),
      ember: rgb(255, 138, 61),
      smoke: rgb(209, 204, 197),
      pool: rgb(255, 217, 160),
    },
    unlock: { kind: 'default' },
    // 夜航 is the skin the deck lets bring a place: its own name points at the night skyline.
    environmentId: 'night-city',
  },
  {
    id: 'copper',
    name: '铜室 Copper',
    palette: {
      paper: rgb(229, 199, 153),
      ember: rgb(255, 184, 92),
      smoke: rgb(219, 194, 168),
      pool: rgb(255, 204, 148),
    },
    unlock: { kind: 'sessions', count: 40 },
  },
  {
    id: 'snow',
    name: '雪夜 Snow',
    // The only cool cherry in the set: blue at the ember, and the pool goes with it.
    palette: {
      paper: rgb(247, 250, 255),
      ember: rgb(158, 187, 245),
      smoke: rgb(224, 234, 247),
      pool: rgb(174, 196, 250),
    },
    unlock: { kind: 'sessions', count: 120 },
  },
  {
    id: 'moss',
    name: '苔痕 Moss',
    palette: {
      paper: rgb(219, 217, 194),
      ember: rgb(166, 217, 122),
      smoke: rgb(204, 214, 194),
      pool: rgb(173, 206, 148),
    },
    unlock: { kind: 'sessions', count: 260 },
  },
  {
    id: 'ash',
    name: '灰烬 Ash',
    // No colour at all left in it: the harshest of the six is also the quietest.
    palette: {
      paper: rgb(204, 201, 199),
      ember: rgb(179, 178, 184),
      smoke: rgb(184, 184, 185),
      pool: rgb(224, 224, 225),
    },
    unlock: { kind: 'sessions', count: 420 },
  },
  {
    id: 'cinnabar',
    name: '朱砂 Cinnabar',
    palette: {
      paper: rgb(245, 219, 199),
      ember: rgb(255, 97, 56),
      smoke: rgb(229, 199, 188),
      pool: rgb(255, 169, 133),
    },
    unlock: { kind: 'packs', count: FINDABLE_PACKS },
  },
];
