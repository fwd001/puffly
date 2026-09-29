/**
 * The shipped content bundle — SPEC.md §13, §23, §38, §77.
 *
 * Adding a cigarette, a room or a sound bed means adding an entry here and nothing in
 * Game Core. `contentIds` are the defaults a fresh player starts with.
 */

import { createContentLookup, type ContentBundle, type ContentLookup } from '@puffly/game-core';
import { CIGARETTES } from './cigarettes';
import { ENVIRONMENTS } from './environments';
import { ASHTRAYS, LIGHTERS } from './props';
import { SMOKE_STYLES, SOUND_PROFILES } from './textures';

export const DEFAULT_CONTENT: ContentBundle = {
  cigarettes: CIGARETTES,
  environments: ENVIRONMENTS,
  lighters: LIGHTERS,
  ashtrays: ASHTRAYS,
  smokeStyles: SMOKE_STYLES,
  soundProfiles: SOUND_PROFILES,
};

export const DEFAULT_IDS = {
  cigarette: 'classic',
  environment: 'quiet-room',
  lighter: 'wheel',
  ashtray: 'stone',
} as const;

export function createDefaultLookup(): ContentLookup {
  return createContentLookup(DEFAULT_CONTENT);
}

export * from './cigarettes';
export * from './environments';
export * from './props';
export * from './textures';
export { buildCollectionItems, COLLECTION_ORDER, ALL_ITEMS } from './collection';
