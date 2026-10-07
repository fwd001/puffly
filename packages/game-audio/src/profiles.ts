/**
 * Profile resolution — SPEC.md §26, §77, §63.
 *
 * Which voices a sound uses is content, never a branch in code: a lighter, a tray and a
 * cigarette each point at a `SoundProfileContent`, and that profile is a recipe of
 * synthesised voices. Because the ids arrive from the state view they are untrusted input —
 * an unknown id must fall back quietly to something that still sounds right rather than
 * throwing at the game loop (§63).
 */

import type {
  AudioLayer,
  AudioVoiceId,
  ContentLookup,
  SoundProfileContent,
} from '@puffly/game-core';
import { clamp } from '@puffly/shared';
import type { AudioProfileRole, AudioStateSlice } from './types';

/**
 * A sensible recipe per voice, so a cue can always sound even when the profile the player
 * picked has nothing for that voice (§63: an odd content id must not mute the game).
 */
export const VOICE_DEFAULTS: Record<AudioVoiceId, AudioLayer> = {
  click: { voice: 'click', gain: 0.45, pitchSpread: 2, timingSpreadMs: 10, pan: -0.2, loop: false },
  flame: { voice: 'flame', gain: 0.32, pitchSpread: 2, timingSpreadMs: 26, pan: -0.2, loop: true },
  draw: { voice: 'draw', gain: 0.38, pitchSpread: 1.5, timingSpreadMs: 20, pan: 0.1, loop: true },
  crackle: {
    voice: 'crackle',
    gain: 0.2,
    pitchSpread: 3,
    timingSpreadMs: 60,
    pan: 0.15,
    loop: true,
  },
  ember: { voice: 'ember', gain: 0.2, pitchSpread: 4, timingSpreadMs: 320, pan: 0.28, loop: false },
  puff: { voice: 'puff', gain: 0.34, pitchSpread: 2, timingSpreadMs: 24, pan: 0.05, loop: false },
  hiss: { voice: 'hiss', gain: 0.45, pitchSpread: 3, timingSpreadMs: 12, pan: 0.2, loop: false },
  ash: { voice: 'ash', gain: 0.4, pitchSpread: 2, timingSpreadMs: 22, pan: 0.32, loop: false },
  wind: { voice: 'wind', gain: 0.3, pitchSpread: 2, timingSpreadMs: 300, pan: 0.18, loop: true },
  rain: { voice: 'rain', gain: 0.3, pitchSpread: 2, timingSpreadMs: 120, pan: -0.24, loop: true },
  room: { voice: 'room', gain: 0.42, pitchSpread: 0, timingSpreadMs: 0, pan: 0, loop: true },
  city: { voice: 'city', gain: 0.4, pitchSpread: 0, timingSpreadMs: 0, pan: -0.3, loop: true },
  chime: { voice: 'chime', gain: 0.16, pitchSpread: 4, timingSpreadMs: 40, pan: 0.4, loop: false },
};

/**
 * Built-in recipes, used only when content cannot answer. They mirror the shape of real
 * profiles (a click plus a looping flame bed, an ash voice for a tray) so a broken or empty
 * content bundle degrades to a plausible sound instead of silence.
 */
const ROLE_FALLBACK: Record<AudioProfileRole, readonly AudioLayer[]> = {
  lighter: [
    { voice: 'click', gain: 0.5, pitchSpread: 1.5, timingSpreadMs: 12, pan: -0.25, loop: false },
    { voice: 'flame', gain: 0.32, pitchSpread: 2, timingSpreadMs: 30, pan: -0.2, loop: true },
  ],
  draw: [
    { voice: 'draw', gain: 0.4, pitchSpread: 1.5, timingSpreadMs: 20, pan: 0.1, loop: true },
    { voice: 'crackle', gain: 0.16, pitchSpread: 3, timingSpreadMs: 60, pan: 0.15, loop: true },
    { voice: 'puff', gain: 0.34, pitchSpread: 2, timingSpreadMs: 24, pan: 0.05, loop: false },
  ],
  tray: [{ voice: 'ash', gain: 0.4, pitchSpread: 2, timingSpreadMs: 22, pan: 0.35, loop: false }],
  extinguish: [
    { voice: 'hiss', gain: 0.5, pitchSpread: 3, timingSpreadMs: 10, pan: 0.2, loop: false },
    { voice: 'ash', gain: 0.2, pitchSpread: 2, timingSpreadMs: 30, pan: 0.3, loop: false },
  ],
  ambient: [
    { voice: 'room', gain: 0.5, pitchSpread: 0, timingSpreadMs: 0, pan: 0, loop: true },
    { voice: 'ember', gain: 0.1, pitchSpread: 2, timingSpreadMs: 900, pan: 0.4, loop: true },
  ],
};

/** Id-prefix conventions that let a role find a sensible default profile in any bundle. */
const ROLE_DEFAULT_PREFIX: Record<AudioProfileRole, readonly string[]> = {
  lighter: ['lighter-', 'lighter'],
  draw: ['draw-', 'draw'],
  tray: ['tray-', 'tray'],
  extinguish: ['extinguish'],
  ambient: ['room-', 'city-', 'rain-', 'street-', 'mountain-', 'ambient'],
};

/** A layer read from content is untrusted: keep it inside what the synth can survive. */
function sanitize(layer: AudioLayer): AudioLayer {
  const bounded = (value: number, fallback: number, min: number, max: number): number =>
    Number.isFinite(value) ? clamp(value, min, max) : fallback;
  return {
    voice: layer.voice,
    gain: bounded(layer.gain, 0.3, 0, 1),
    pitchSpread: bounded(layer.pitchSpread, 1.5, 0, 12),
    timingSpreadMs: bounded(layer.timingSpreadMs, 20, 0, 8000),
    pan: bounded(layer.pan, 0, -1, 1),
    loop: layer.loop === true,
  };
}

const usable = (profile: SoundProfileContent): readonly AudioLayer[] => {
  const layers = profile.layers.filter(
    (layer) => Boolean(layer) && typeof layer.voice === 'string',
  );
  return layers.map(sanitize);
};

const isLookup = (
  content: ContentLookup | readonly SoundProfileContent[],
): content is ContentLookup =>
  'soundProfile' in content && typeof content.soundProfile === 'function';

export interface ResolvedProfile {
  readonly id: string;
  readonly role: AudioProfileRole;
  readonly layers: readonly AudioLayer[];
  /** True when the recipe came from the built-in table rather than content. */
  readonly synthesized: boolean;
}

export interface ProfileStore {
  resolve(role: AudioProfileRole, state: AudioStateSlice): ResolvedProfile;
  /** Profiles the shell can preview; empty when no content was handed over. */
  ids(): readonly string[];
}

/**
 * `overrides` let the shell pin a role (the settings sheet's sound preview), which keeps the
 * engine honest: content ids always win over code when they are present.
 */
export function createProfileStore(
  content: ContentLookup | readonly SoundProfileContent[] | undefined,
  overrides: Partial<Record<AudioProfileRole, string>> = {},
): ProfileStore {
  const byId = new Map<string, SoundProfileContent>();
  /** lighter/ashtray type ids → the sound profile they point at (§77). */
  const propProfile = new Map<string, string>();

  const profiles =
    content === undefined ? [] : isLookup(content) ? content.soundProfiles() : content;
  for (const profile of profiles) {
    if (profile && typeof profile.id === 'string') byId.set(profile.id, profile);
  }

  if (content !== undefined && isLookup(content)) {
    for (const lighter of content.lighters()) propProfile.set(lighter.id, lighter.soundProfileId);
    for (const tray of content.ashtrays()) propProfile.set(tray.id, tray.soundProfileId);
  }

  const take = (id: string | undefined): AudioLayer[] | null => {
    if (!id) return null;
    const found = byId.get(id);
    if (!found) return null;
    const layers = usable(found);
    return layers.length > 0 ? [...layers] : null;
  };

  /** First profile whose id starts with one of the role's prefixes, default-unlocked first. */
  const byPrefix = (role: AudioProfileRole): { id: string; layers: AudioLayer[] } | null => {
    const prefixes = ROLE_DEFAULT_PREFIX[role];
    let best: { id: string; layers: AudioLayer[] } | null = null;
    for (const profile of byId.values()) {
      if (!prefixes.some((prefix) => profile.id.startsWith(prefix))) continue;
      const layers = usable(profile);
      if (layers.length === 0) continue;
      const candidate = { id: profile.id, layers: [...layers] };
      if (profile.unlock.kind === 'default') return candidate;
      best ??= candidate;
    }
    return best;
  };

  const stateId = (role: AudioProfileRole, state: AudioStateSlice): string | undefined => {
    switch (role) {
      case 'lighter':
        return propProfile.get(state.lighter.typeId);
      case 'draw':
        return state.cigarette.soundProfileId;
      case 'ambient':
        return state.environment.ambientAudio.profileId;
      case 'tray':
        return state.ashtray.soundProfileId;
      case 'extinguish':
        return state.ashtray.extinguishProfileId;
      default:
        return undefined;
    }
  };

  const cached = new Map<string, ResolvedProfile>();

  const resolve = (role: AudioProfileRole, state: AudioStateSlice): ResolvedProfile => {
    const pinned = overrides[role];
    const wanted = pinned ?? stateId(role, state);
    const key = `${role}|${wanted ?? ''}`;
    const hit = cached.get(key);
    if (hit) return hit;

    const fromContent = take(wanted) ?? take(pinned) ?? null;
    const fallback = fromContent === null ? byPrefix(role) : null;

    const resolved: ResolvedProfile =
      fromContent !== null
        ? { id: wanted ?? pinned ?? role, role, layers: fromContent, synthesized: false }
        : fallback !== null
          ? { id: fallback.id, role, layers: fallback.layers, synthesized: false }
          : { id: `builtin:${role}`, role, layers: [...ROLE_FALLBACK[role]], synthesized: true };

    cached.set(key, resolved);
    return resolved;
  };

  return { resolve, ids: () => [...byId.keys()].sort() };
}

/**
 * A looping layer whose timing spread is wide is content saying "repeat this sparsely", not
 * "hold this note": a desk tick every couple of seconds, a city wind gust. Those become
 * retriggered one-shots so a bed never turns into an audible loop (§27). Anything below this
 * spread is a bed, as long as the voice can actually hold one (`canBed` in `voices.ts`).
 */
export const SPARSE_LOOP_MS = 240;

/**
 * The layers a cue should sound: the profile's own layers for these voices, or the built-in
 * recipe when the content has none. A cue therefore always has at least one voice to fire,
 * which is what keeps §21's random events audible whatever the player has unlocked.
 */
export function selectLayers(
  profile: ResolvedProfile,
  voices: readonly AudioVoiceId[],
): AudioLayer[] {
  const chosen = profile.layers.filter((layer) => layer.gain > 0 && voices.includes(layer.voice));
  if (chosen.length > 0) return [...chosen];
  return voices.map((voice) => ({ ...VOICE_DEFAULTS[voice] }));
}
