import type { Rgb } from '@puffly/shared';

/** §64, §26, §55: the only knobs a player gets, all of them optional. */

export type QualityMode = 'auto' | 'high' | 'balanced' | 'light';

/**
 * The four colours a room is made of, in the order the background is painted: the sky's two ends,
 * the line where it meets the ground, and everything that stands in front of it.
 */
export interface ScenePalette {
  skyTop: Rgb;
  skyBottom: Rgb;
  horizon: Rgb;
  silhouette: Rgb;
}
export type ContrastMode = 'normal' | 'high';

export interface Settings {
  /** 0..1 master volume. */
  volume: number;
  /** 0..1 ambience level — kept low on purpose (§27). */
  ambientVolume: number;
  muted: boolean;
  /** §64: disables heavy smoke, cuts particle count and camera movement. */
  reducedMotion: boolean;
  /** §64: enough contrast even though the scene is intentionally dark. */
  contrast: ContrastMode;
  /** §64: UI chrome scale; the game canvas is always DPR-scaled independently. */
  textScale: number;
  quality: QualityMode;
  /** Minutes, §31's `◷ 03:00`. */
  sessionTargetMs: number;
  /**
   * The player's own colours for the four layers the room is painted with, or `null` for whatever
   * the place itself was authored with. A renderer setting and not a simulation one, for the same
   * reason a skin is: it may not move a number. Where it differs from a skin is that a skin is a
   * collectible you unlock and a background is a thing you decide — so it is a preference, and it
   * costs nothing to change.
   */
  customBackground: ScenePalette | null;
  /**
   * §28: whether the object the scene is nudging also gets one plain word naming the gesture
   * ("tap", "hold", "flick", "press", "drop"). On by default — a word is cheaper than a
   * missed gesture — and the only text the game ever shows.
   */
  hints: boolean;
  /**
   * §9 of the mobile brief: how the interface should speak — a language tag, or `icons` for no
   * words at all. Absent means "ask the device", and the core only carries this value: picking
   * the words is the shell's job, so a save can move between platforms without the simulation
   * changing shape (§47).
   */
  language?: string;
  /**
   * S18: the id of the applied skin. The core stores it and never reads it, exactly as with the
   * language — a palette is not something the simulation is allowed to notice (§6.1).
   */
  skin?: string;
  utcOffsetMinutes: number;
  /**
   * S20: the player's own ceiling for the day, in sticks. Absent means they have not chosen one
   * — there is no default, because a number nobody picked would be the brief's first piece of
   * pressure. Raising or clearing it is never punished (§ limitRule.adjustable).
   */
  dailyLimitSticks?: number;
  /** §33: the player's own anchor for smoke-free days. Never inferred as a claim (§84). */
  quitAnchorTimestamp?: number;
  /** §30: only consumed by native shells. */
  haptics: boolean;
  /**
   * Whether the lighter may do a small flourish when nobody is doing anything with it — a cap
   * flicked open and shut, a throw of sparks. The table is the one thing on screen that is not the
   * rod, and a break where nothing ever moves is not a room, it is a still frame. Off means off:
   * the lighter then only ever moves because a finger told it to.
   */
  idleFlourishes: boolean;
  /**
   * Which content the player is currently using. Optional so a settings object from an
   * older save still parses; the engine falls back to the default unlocked item.
   */
  selection?: Selection;
}

export interface Selection {
  cigarette: string;
  environment: string;
  lighter: string;
  ashtray: string;
}

/** 03:00 (§31). */
export const DEFAULT_SESSION_TARGET_MS = 180_000;

/**
 * `utcOffsetMinutes` is handed in by the shell rather than read here: knowing the player's
 * zone is a platform fact, and the core must stay runnable anywhere (§47) and replayable on
 * another machine (§71). A shell passes `-new Date().getTimezoneOffset()`.
 */
export function createDefaultSettings(utcOffsetMinutes = 0): Settings {
  return {
    volume: 0.6,
    ambientVolume: 0.25,
    muted: false,
    reducedMotion: false,
    contrast: 'normal',
    textScale: 1,
    quality: 'auto',
    sessionTargetMs: DEFAULT_SESSION_TARGET_MS,
    hints: true,
    utcOffsetMinutes,
    haptics: false,
    idleFlourishes: true,
    customBackground: null,
  };
}
