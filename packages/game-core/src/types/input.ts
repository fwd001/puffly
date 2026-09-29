/**
 * Input model — SPEC.md §49.
 *
 * Every platform (pointer, mouse, touch, keyboard, future global shortcut) is
 * reduced to this one shape before reaching Game Core, so the core never sees a
 * browser event (SPEC.md §48: `Canvas click -> Game Core` only through the adapter).
 */

export type InputType = 'tap' | 'hold' | 'release' | 'drag' | 'swipe';

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

export type InputTarget = 'cigarette' | 'ember' | 'ash' | 'lighter' | 'ashtray' | 'stage';
