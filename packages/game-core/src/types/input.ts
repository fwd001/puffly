/**
 * Input model — SPEC.md §49.
 *
 * Every platform (pointer, mouse, touch, keyboard, future global shortcut) is
 * reduced to this one shape before reaching Game Core, so the core never sees a
 * browser event (SPEC.md §48: `Canvas click -> Game Core` only through the adapter).
 */

/**
 * `pinch` is the two-finger close on the cherry (§9 of the mobile brief). It is a type
 * rather than a `hold` with a flag because it arrives from two pointers and means
 * something no single finger means: put it out.
 */
export type InputType = 'tap' | 'hold' | 'release' | 'drag' | 'swipe' | 'pinch';

export interface GameInput {
  type: InputType;
  /** Normalised stage coordinates, 0..1 (SPEC.md §55). */
  x: number;
  y: number;
  /** Milliseconds, monotonically increasing within a session. */
  timestamp: number;
  /**
   * Optional extensions. `GameInput` stays a superset of SPEC.md §49 rather than
   * changing it: pointer traffic needs neither field.
   */
  source?: InputSource;
  /**
   * Keyboard/pointer-accessible affordances are aimed at an anchor instead of a
   * pixel, so keyboard users get the same hit area as touch users (SPEC.md §65, §66).
   */
  target?: InputTarget;
  /** Swipe vector in normalised stage units, for flick gestures (SPEC.md §18, §20). */
  velocity?: { vx: number; vy: number };
}

export type InputSource = 'pointer' | 'touch' | 'mouse' | 'keyboard' | 'shortcut';

/**
 * The six things on the table that answer a hand. `pack` is the deck's 取烟 with an anchor of its
 * own (S14's six gestures); `stage` is the surface behind them all, which answers a press with
 * nothing but the folding of the chrome.
 */
export type InputTarget = 'cigarette' | 'ember' | 'ash' | 'lighter' | 'ashtray' | 'pack' | 'stage';
