/**
 * Event → cue routing — SPEC.md §21, §22, §26, §69.
 *
 * The discrete half of the model arrives as `EngineEvent`s. This module decides what each of
 * them *sounds like* and how strongly, and nothing else: no node is built, no param is
 * written, so the whole mapping is testable without a Web Audio runtime.
 *
 * Bursts are the primary channel because they carry the seeded variation; session events are
 * deliberately almost ignored (§69 events and their burst arrive together and firing on both
 * would double every click).
 */

import type {
  AudioLayer,
  AudioVoiceId,
  Burst,
  BurstKind,
  WorldEventOccurrence,
} from '@puffly/game-core';
import { THRESHOLDS, WorldEventId, emberPresence } from '@puffly/game-core';
import { clamp01 } from '@puffly/shared';
import { SessionEventType } from '@puffly/game-core';
import { selectLayers } from './profiles';
import { backgroundIsOpen } from './beds';
import type { ProfileStore, ResolvedProfile } from './profiles';
import type { AudioCueId, AudioProfileRole, AudioStateSlice } from './types';
import type { EngineEvent } from '@puffly/game-core';

export interface PlannedCue {
  readonly cue: AudioCueId;
  readonly role: AudioProfileRole;
  /** 0..1 how strongly it reads; scales gain and brightness. */
  readonly velocity: number;
  /** Per-trigger seed: the engine forks its variation stream from this (§26). */
  readonly seed: number;
  /** Envelope length for swells; one-shots ignore it. */
  readonly durationMs: number;
  readonly layers: readonly AudioLayer[];
}

/** Minimum spacing per cue, so a burst storm cannot turn into a machine gun (§54, §26). */
export const CUE_MIN_GAP_MS: Record<AudioCueId, number> = {
  click: 70,
  sputter: 120,
  ignite: 140,
  // Six to eight of these a second, each with a half-second tail, buried the exhale.
  'draw-detail': 320,
  release: 90,
  ash: 80,
  // A column breaks once per flick, and the crack itself is 90 ms — so the gap is just long enough
  // that a shaking hand cannot turn it into a buzz.
  fracture: 120,
  // One per draw, and the draw itself is rate-limited by the core; this only keeps a tap and a
  // release from both answering.
  vacuum: 160,
  // The ending marker is meant to be heard once per rod, and a stub re-enters `NEAR_END` every time
  // it is drawn on, so the gap is what makes it a marker rather than a stutter.
  'burnt-out': 1200,
  lift: 140,
  hiss: 260,
  impact: 90,
  wind: 400,
  rain: 400,
  room: 700,
  chime: 320,
};

interface CueShape {
  readonly role: AudioProfileRole;
  readonly voices: readonly AudioVoiceId[];
  /** Nominal length in ms before the event's own numbers stretch it. */
  readonly durationMs: number;
}

const CUE_SHAPE: Record<AudioCueId, CueShape> = {
  click: { role: 'lighter', voices: ['click'], durationMs: 70 },
  sputter: { role: 'lighter', voices: ['click', 'flame'], durationMs: 160 },
  ignite: { role: 'draw', voices: ['crackle', 'ember'], durationMs: 260 },
  'draw-detail': { role: 'draw', voices: ['draw', 'crackle'], durationMs: 320 },
  release: { role: 'draw', voices: ['puff', 'draw'], durationMs: 420 },
  // The column letting go, heard before the grains it turns into. It is on the rod's own profile
  // and not the tray's because the tray has nothing to do with a break that happens in the air
  // above it — and because that is the difference between this and the `ash` cue below, which is
  // the grains landing in somebody else's material.
  fracture: { role: 'draw', voices: ['crackle'], durationMs: 90 },
  ash: { role: 'tray', voices: ['ash', 'chime'], durationMs: 160 },
  // The hollow of the mouth at the end of a draw, and the same hollow held out because there is no
  // rod left to fill it. One voice, two lengths: the deck gives 吸附 400 ms and 吸尽 1.2 s, and of the
  // voices that could read as a dark, drawn breath, `hollow` is the only one whose length comes from
  // the cue (the four weather voices stretch too, but nobody inhales a gust).
  vacuum: { role: 'draw', voices: ['hollow'], durationMs: 400 },
  'burnt-out': { role: 'draw', voices: ['hollow'], durationMs: 1200 },
  hiss: { role: 'extinguish', voices: ['hiss', 'ash'], durationMs: 900 },
  impact: { role: 'tray', voices: ['ash', 'click', 'chime'], durationMs: 220 },
  lift: { role: 'surface', voices: ['click', 'ash'], durationMs: 120 },
  wind: { role: 'ambient', voices: ['wind', 'city'], durationMs: 2400 },
  rain: { role: 'ambient', voices: ['rain'], durationMs: 3000 },
  room: { role: 'ambient', voices: ['room', 'city', 'wind'], durationMs: 1600 },
  chime: { role: 'ambient', voices: ['chime'], durationMs: 900 },
};

const BURST_CUE: Record<BurstKind, AudioCueId | null> = {
  lighter: 'click',
  puff: 'draw-detail',
  exhale: 'release',
  drift: null,
  ember: 'ignite',
  flare: 'ignite',
  ash: 'ash',
  extinguish: 'hiss',
  discard: 'impact',
  impact: 'impact',
};

/**
 * The second register of a happening that is two sounds in the world: the column breaks (`fracture`)
 * and then the grains land (`ash`). The body is listed first so a cue reader looking at `[0]` still
 * finds the material the event is about.
 */
const BURST_ACCENT: Partial<Record<BurstKind, AudioCueId>> = {
  ash: 'fracture',
};

/** The burst's own cue plus its accent, in the order the engine should fire them. */
export function burstCues(kind: BurstKind): readonly AudioCueId[] {
  const body = BURST_CUE[kind];
  if (!body) return [];
  const accent = BURST_ACCENT[kind];
  return accent === undefined ? [body] : [body, accent];
}

/**
 * Which of the two hollows a finished draw is: an ordinary one, or the last one on a stub.
 *
 * One number decides it, and it is the number the core already uses to call the state `NEAR_END`
 * (§11), so the sound and the state machine cannot disagree about when the rod is a stub.
 */
export const drawEndCue = (rodRemaining: number): AudioCueId =>
  rodRemaining <= THRESHOLDS.nearEndRodFraction ? 'burnt-out' : 'vacuum';

/** `drift` is the lazy column of smoke the bed already carries: no sound of its own. */
const WORLD_CUE: Record<string, AudioCueId | null> = {
  [WorldEventId.WIND]: 'wind',
  [WorldEventId.RAIN]: 'rain',
  [WorldEventId.ASH_FALL]: 'ash',
  [WorldEventId.EMBER_FLARE]: 'ignite',
  [WorldEventId.SMOKE_SWIRL]: 'room',
  [WorldEventId.LIGHTER_FAILURE]: 'sputter',
  [WorldEventId.ENVIRONMENT_NOISE]: 'room',
  [WorldEventId.LIGHT_CHANGE]: 'room',
  [WorldEventId.SHADOW_CHANGE]: 'room',
  [WorldEventId.AMBIENT_EVENT]: 'room',
};

/**
 * The few session events that carry their own sound. `LIGHT` and `LIGHT_FAIL` are the two
 * moments the player waits for, and the core records them independently of any burst; `UNLOCK`
 * and `SESSION_TARGET` have no burst at all. Everything else in §69 already arrived as a burst
 * or a world occurrence, and firing twice would be the mechanical button §26 forbids.
 */
const SESSION_CUE: Record<string, AudioCueId | null> = {
  // Nothing: the same instant already emitted an `ember` burst, which is the crackle of the
  // cherry taking. A click on top of it was two sounds for one event (§26).
  [SessionEventType.LIGHT]: null,
  [SessionEventType.LIGHT_FAIL]: 'sputter',
  [SessionEventType.UNLOCK]: 'chime',
  [SessionEventType.SESSION_TARGET]: 'chime',
};

/**
 * Which cue a session event answers with, or `null` for the events that stay quiet.
 *
 * The end of a draw is the one happening whose sound is decided by the rod rather than by the
 * event: an ordinary draw goes hollow for 400 ms, the last one on a stub for a second and a half.
 * Without a state to read, the mapper names the ordinary one, which is what a draw is nine times
 * out of ten.
 */
function sessionCueId(type: string, rodRemaining?: number): AudioCueId | null {
  if (type === SessionEventType.PUFF) {
    return rodRemaining === undefined ? 'vacuum' : drawEndCue(rodRemaining);
  }
  return SESSION_CUE[type] ?? null;
}

const finite = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

/**
 * How strong a burst should read. The core's recipe already varies count/alpha/turbulence
 * per puff (§16), so audio reads those numbers instead of inventing its own dynamics.
 */
function burstVelocity(burst: Burst): number {
  const density = clamp01(finite(burst.alphaPeak, 0.3) * 1.6);
  const mass = clamp01(finite(burst.count, 12) / 70);
  const heat = clamp01(finite(burst.heat, 0));
  const churn = clamp01(finite(burst.turbulence, 0.8) / 2);
  return clamp01(0.24 + density * 0.34 + mass * 0.2 + heat * 0.24 + churn * 0.1);
}

function burstDuration(burst: Burst, shape: CueShape): number {
  const life = finite(burst.lifeMs.max, shape.durationMs);
  // A sound is briefer than the smoke it belongs to: the puff is a moment, the cloud is
  // seconds. The recipe's own envelope decides what the player actually hears.
  return Math.min(1400, Math.max(shape.durationMs, life * 0.25));
}

const occurrenceDuration = (occurrence: WorldEventOccurrence, shape: CueShape): number => {
  const span = finite(occurrence.endsAtMs, 0) - finite(occurrence.startedAtMs, 0);
  return span > 220 ? Math.min(span, 6000) : shape.durationMs;
};

export interface CuePlanOptions {
  /** Ambient density 0..1, used to keep background swells quiet when the room is quiet. */
  readonly ambientScale?: number;
}

function build(
  cue: AudioCueId,
  profile: ResolvedProfile,
  velocity: number,
  seed: number,
  durationMs: number,
): PlannedCue {
  const shape = CUE_SHAPE[cue];
  return {
    cue,
    role: shape.role,
    velocity: clamp01(velocity),
    seed: Math.trunc(seed) >>> 0 || 1,
    durationMs: Math.max(24, durationMs),
    layers: selectLayers(profile, shape.voices),
  };
}

/**
 * The whole mapping, resolved against the state's current content. Returns at most two cues
 * per event (a burst plus its own accent); an empty array means "stay quiet".
 */
export function planCues(
  event: EngineEvent,
  state: AudioStateSlice,
  store: ProfileStore,
  options: CuePlanOptions = {},
): PlannedCue[] {
  const ambientScale = clamp01(finite(options.ambientScale ?? 1, 1));

  switch (event.kind) {
    case 'burst': {
      const cueIds = burstCues(event.burst.kind);
      if (cueIds.length === 0) return [];
      const density = burstVelocity(event.burst);
      const planOne = (cue: AudioCueId, stretched: boolean): PlannedCue => {
        const shape = CUE_SHAPE[cue];
        // Each register resolves through its own role: the break is the rod's material and the
        // landing is the tray's, so changing the tray cannot change the crack.
        return build(
          cue,
          store.resolve(shape.role, state),
          density * cueGain(cue, state),
          event.burst.seed,
          // The body follows the smoke's own life; an accent keeps the deck's fixed length, because
          // the break is not a cloud that hangs around. What the player hears of it is `crackle`'s
          // own decay — that voice does not read `durationSec`, so this number is the plan's claim
          // about the gesture, not a measurement of the sound.
          stretched ? burstDuration(event.burst, shape) : shape.durationMs,
        );
      };
      return cueIds.map((cue, index) => planOne(cue, index === 0));
    }

    case 'world': {
      const cue = WORLD_CUE[event.occurrence.type];
      if (!cue) return [];
      const shape = CUE_SHAPE[cue];
      const profile = store.resolve(shape.role, state);
      const strength = clamp01(finite(event.occurrence.strength, 0.5));
      const background = cue === 'wind' || cue === 'rain' || cue === 'room';
      // Same rule as the ambient bed, read from the same predicate: while nothing is being smoked
      // the room does not get to make its own weather sounds.
      if (background && !backgroundIsOpen(state)) return [];
      const velocity = strength * (background ? 0.55 * ambientScale : 0.8);
      return [
        build(
          cue,
          profile,
          velocity,
          hashId(event.occurrence.id, event.occurrence.startedAtMs),
          occurrenceDuration(event.occurrence, shape),
        ),
      ];
    }

    case 'session': {
      const cue = sessionCueId(event.event.type, state.cigarette.rodRemaining);
      if (!cue) return [];
      const shape = CUE_SHAPE[cue];
      const profile = store.resolve(shape.role, state);
      // The click of a lighter that caught is quieter than the flick of the wheel: the catch
      // is an accent, and the ember burst arriving in the same instant is the body (§26).
      // The two hollows take the deck's own figures (S20: 吸附 0.65, 吸尽 0.7), and the ending is
      // the louder of them because it is the one that says the rod is over.
      const velocity =
        cue === 'sputter'
          ? 0.5
          : cue === 'vacuum'
            ? 0.65
            : cue === 'burnt-out'
              ? 0.7
              : cue === 'click'
                ? 0.52
                : 0.42 * (0.6 + ambientScale * 0.4);
      return [
        build(
          cue,
          profile,
          velocity,
          hashId(event.event.id, event.event.timestamp),
          shape.durationMs,
        ),
      ];
    }

    case 'transition':
      // Picking the rod up is the most repeated gesture in the game and the only one that made no
      // sound at all: the rod visibly leaves the table and the room stays silent. Every other
      // transition is still visual — `unlock` is recorded as a session event, and a light change
      // makes no noise because in the room it is being copied it makes none.
      if (event.to !== 'PICKED_UP' || event.from !== 'IDLE') return [];
      return [
        build(
          'lift',
          store.resolve('surface', state),
          0.34,
          hashId('lift', event.atMs),
          CUE_SHAPE.lift.durationMs,
        ),
      ];

    case 'unlock':
    default:
      return [];
  }
}

/**
 * Content-independent loudness trims: the same flick of ash is quieter when nothing is
 * burning, and a draw detail must never outshout the release it belongs to (§27).
 */
function cueGain(cue: AudioCueId, state: AudioStateSlice): number {
  const ember = emberPresence(state.cigarette.ember);
  switch (cue) {
    case 'ignite':
      return 0.55 + ember * 0.45;
    case 'draw-detail':
      return 0.34 + clamp01(state.cigarette.puff.intensity) * 0.3;
    case 'ash':
      return state.cigarette.ember.lit ? 0.9 : 0.7;
    case 'fracture': {
      // The deck pairs the break at 0.6 against the scatter at 0.3, and the trim has to be said
      // against `ash`'s own (which already carries the "is anything burning" half) rather than as a
      // number of its own. Held under 1.5 because a trim that pushes the plan past 1 would make
      // every crack equally loud, which is the mechanical button §26 forbids.
      const scatter = cueGain('ash', state);
      return Math.min(1.5, scatter * 2);
    }
    case 'release':
      return 0.75 + clamp01(state.smoke.density) * 0.25;
    case 'impact':
      return 0.8;
    case 'hiss':
      return 0.85 + clamp01(state.cigarette.extinguishProgress) * 0.15;
    case 'click':
      return 1;
    default:
      return 0.8;
  }
}

/** Occurrences and session events carry string ids; fold them into a seed (§26). */
export function hashId(id: string, salt: number): number {
  let hash = finite(salt, 0) >>> 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (Math.imul(hash ^ id.charCodeAt(i), 2654435761) >>> 0) ^ (hash >>> 7);
  }
  return (hash ^ (hash >>> 13)) >>> 0 || 1;
}

/**
 * The cue ids an event maps to; pure, no side effects.
 *
 * `state` is optional because the shell's preview hook only has the event. Where an event's sound
 * depends on the rod (the two hollows), passing no state answers with the common one, and the
 * engine — which is always given the live state — passes the state it was last handed so its
 * answer is the one it would really have fired.
 */
export function cueIdsFor(event: EngineEvent, state?: AudioStateSlice): readonly AudioCueId[] {
  if (event.kind === 'burst') return burstCues(event.burst.kind);
  if (event.kind === 'world') {
    const cue = WORLD_CUE[event.occurrence.type];
    return cue === null || cue === undefined ? [] : [cue];
  }
  if (event.kind === 'session') {
    const cue = sessionCueId(event.event.type, state?.cigarette.rodRemaining);
    return cue === null ? [] : [cue];
  }
  // The only transition with a sound of its own; the rest of the lifecycle is visual (§26).
  if (event.kind === 'transition' && event.from === 'IDLE' && event.to === 'PICKED_UP') {
    return ['lift'];
  }
  return [];
}
