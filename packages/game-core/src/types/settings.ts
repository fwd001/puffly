/** §64, §26, §55: the only knobs a player gets, all of them optional. */

export type QualityMode = 'auto' | 'high' | 'balanced' | 'light';
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
   * §28: whether the object the scene is nudging also gets one plain word naming the gesture
   * ("tap", "hold", "flick", "press", "drop"). On by default — a word is cheaper than a
   * missed gesture — and the only text the game ever shows.
   */
  hints: boolean;
  utcOffsetMinutes: number;
  /** §33: the player's own anchor for smoke-free days. Never inferred as a claim (§84). */
  quitAnchorTimestamp?: number;
  /** §30: only consumed by native shells. */
  haptics: boolean;
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
  };
}
