/**
 * The collection cabinet — SPEC.md §38, §39.
 *
 * Six shelves of original objects. Each row carries a glyph and a swatch taken from the
 * item's own palette, so a locked shelf still communicates without a sentence (§29).
 */

import { rgb } from '@puffly/shared';
import { CollectionCategory, type CollectionItem, type ContentBundle } from '@puffly/game-core';
import { CIGARETTES } from './cigarettes';
import { ENVIRONMENTS } from './environments';
import { ASHTRAYS, LIGHTERS } from './props';
import { SKINS } from './skins';
import { SMOKE_STYLES, SOUND_PROFILES } from './textures';

const GLYPH: Record<CollectionItem['category'], string> = {
  [CollectionCategory.CIGARETTES]: '—',
  [CollectionCategory.LIGHTERS]: '△',
  [CollectionCategory.ENVIRONMENTS]: '▢',
  [CollectionCategory.ASHTRAYS]: '○',
  [CollectionCategory.SMOKE]: '≈',
  [CollectionCategory.SOUNDS]: '∿',
};

/** Sound profiles have no colour of their own, so they take the warm grey of the room. */
const SOUND_SWATCH = rgb(150, 146, 140);

export function buildCollectionItems(bundle: ContentBundle): CollectionItem[] {
  return [
    ...bundle.cigarettes.map((item) => ({
      category: CollectionCategory.CIGARETTES,
      id: item.id,
      name: item.name,
      unlock: item.unlock,
      glyph: GLYPH[CollectionCategory.CIGARETTES],
      swatch: item.palette.band,
    })),
    ...bundle.lighters.map((item) => ({
      category: CollectionCategory.LIGHTERS,
      id: item.id,
      name: item.name,
      unlock: item.unlock,
      glyph: GLYPH[CollectionCategory.LIGHTERS],
      swatch: item.flame.hue,
    })),
    ...bundle.environments.map((item) => ({
      category: CollectionCategory.ENVIRONMENTS,
      id: item.id,
      name: item.name,
      unlock: item.unlock,
      glyph: GLYPH[CollectionCategory.ENVIRONMENTS],
      swatch: item.background.sky[1],
    })),
    ...bundle.ashtrays.map((item) => ({
      category: CollectionCategory.ASHTRAYS,
      id: item.id,
      name: item.name,
      unlock: item.unlock,
      glyph: GLYPH[CollectionCategory.ASHTRAYS],
      swatch: item.material.rim,
    })),
    ...bundle.smokeStyles.map((item) => ({
      category: CollectionCategory.SMOKE,
      id: item.id,
      name: item.name,
      unlock: item.unlock,
      glyph: GLYPH[CollectionCategory.SMOKE],
      swatch: item.tint,
    })),
    // Only the *ambient* beds are collectibles. A lighter's click or a rod's draw timbre is a
    // property of an object already on another shelf, and listing all of them turned the cabinet
    // into a plumbing diagram instead of a display case (§38).
    ...bundle.soundProfiles
      .filter((item) => bundle.environments.some((room) => room.ambientAudio.profileId === item.id))
      .map((item) => ({
        category: CollectionCategory.SOUNDS,
        id: item.id,
        name: item.name,
        unlock: item.unlock,
        glyph: GLYPH[CollectionCategory.SOUNDS],
        swatch: SOUND_SWATCH,
      })),
  ];
}

/** Shelf order the cabinet walks through, so two runs of the app look the same. */
export const COLLECTION_ORDER: readonly CollectionItem['category'][] = [
  CollectionCategory.CIGARETTES,
  CollectionCategory.LIGHTERS,
  CollectionCategory.ENVIRONMENTS,
  CollectionCategory.ASHTRAYS,
  CollectionCategory.SMOKE,
  CollectionCategory.SOUNDS,
];

/** Referential integrity, checked at build time by a test rather than at runtime. */
export const ALL_ITEMS: ContentBundle = {
  cigarettes: CIGARETTES,
  environments: ENVIRONMENTS,
  lighters: LIGHTERS,
  ashtrays: ASHTRAYS,
  smokeStyles: SMOKE_STYLES,
  soundProfiles: SOUND_PROFILES,
  skins: SKINS,
};
