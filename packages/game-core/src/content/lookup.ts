/**
 * Content lookup: the engine only ever asks for ids, so adding content never touches
 * core code (SPEC.md §77) and a missing id is a configuration error we can name.
 */

import type {
  AshtrayContent,
  CigaretteContent,
  ContentBundle,
  Environment,
  LighterContent,
  SmokeStyleContent,
  SoundProfileContent,
} from '../types/content';

export class ContentError extends Error {
  constructor(
    readonly kind: string,
    readonly id: string,
  ) {
    super(`unknown ${kind} content id: ${id}`);
    this.name = 'ContentError';
  }
}

export interface ContentLookup {
  readonly bundle: ContentBundle;
  cigarette(id: string): CigaretteContent;
  environment(id: string): Environment;
  lighter(id: string): LighterContent;
  ashtray(id: string): AshtrayContent;
  smokeStyle(id: string): SmokeStyleContent;
  soundProfile(id: string): SoundProfileContent;
  cigarettes(): readonly CigaretteContent[];
  environments(): readonly Environment[];
  lighters(): readonly LighterContent[];
  ashtrays(): readonly AshtrayContent[];
  smokeStyles(): readonly SmokeStyleContent[];
  soundProfiles(): readonly SoundProfileContent[];
}

function index<T extends { id: string }>(items: readonly T[], kind: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new ContentError(kind, item.id);
    map.set(item.id, item);
  }
  return map;
}

export function createContentLookup(bundle: ContentBundle): ContentLookup {
  const cigarettes = index(bundle.cigarettes, 'cigarette');
  const environments = index(bundle.environments, 'environment');
  const lighters = index(bundle.lighters, 'lighter');
  const ashtrays = index(bundle.ashtrays, 'ashtray');
  const smokeStyles = index(bundle.smokeStyles, 'smokeStyle');
  const soundProfiles = index(bundle.soundProfiles, 'soundProfile');

  const mustFind = <T>(map: Map<string, T>, id: string, kind: string): T => {
    const found = map.get(id);
    if (!found) throw new ContentError(kind, id);
    return found;
  };

  return {
    bundle,
    cigarette: (id) => mustFind(cigarettes, id, 'cigarette'),
    environment: (id) => mustFind(environments, id, 'environment'),
    lighter: (id) => mustFind(lighters, id, 'lighter'),
    ashtray: (id) => mustFind(ashtrays, id, 'ashtray'),
    smokeStyle: (id) => mustFind(smokeStyles, id, 'smokeStyle'),
    soundProfile: (id) => mustFind(soundProfiles, id, 'soundProfile'),
    cigarettes: () => bundle.cigarettes,
    environments: () => bundle.environments,
    lighters: () => bundle.lighters,
    ashtrays: () => bundle.ashtrays,
    smokeStyles: () => bundle.smokeStyles,
    soundProfiles: () => bundle.soundProfiles,
  };
}
