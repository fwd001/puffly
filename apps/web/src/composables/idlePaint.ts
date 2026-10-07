/**
 * When the picture is allowed to stop chasing 60 fps — the deck's S12 line 「空闲时降至 15fps 省电，
 * 有交互时恢复」, and the one part of the desktop-widget idea that a web build can actually honour.
 *
 * The simulation keeps its own time on every beat regardless: §71's determinism is about how many
 * numbers the step consumes, and dropping a frame must not quietly slow a burning rod. What gets
 * skipped is the painting, which is the expensive half and the half nobody is looking at.
 *
 * So the rule is not "no input for a while" — a rod glowing in an ashtray is animating with no
 * input at all. It is: nothing in the scene is on fire, nothing is in the air, and the player has
 * left it alone.
 */

export const IDLE_PAINT_MS = 66;
/** How long the player must have been away before the scene counts as unwatched. */
export const IDLE_AFTER_MS = 1500;

export interface SceneLife {
  /** A break is running: the head-up row and the chrome are being read. */
  sessionActive: boolean;
  /** The cherry is alight, or the lighter's flame is up. */
  lit: boolean;
  /** Puffs still drifting in the frame. */
  particles: number;
  /** ms since the last input the scene answered. */
  idleMs: number;
}

/**
 * Whether this beat should reach the canvas. `sincePaintMs` is how long it has been since the last
 * frame actually painted, so the answer is allowed to alternate — that alternation *is* 15 fps.
 */
export function shouldPaint(life: SceneLife, sincePaintMs: number): boolean {
  if (life.sessionActive || life.lit || life.particles > 0) return true;
  if (life.idleMs < IDLE_AFTER_MS) return true;
  return sincePaintMs >= IDLE_PAINT_MS;
}
