/**
 * The scene is allowed to stop chasing frames when there is nothing in it to watch — S12's
 * 「空闲时降至 15fps 省电，有交互时恢复」, the part of the desktop-widget idea a browser can honour.
 *
 * The interesting half is what does *not* count as idle. "No input for two seconds" is the obvious
 * rule and it is wrong: a rod resting in an ashtray is alight, glowing and putting smoke into the
 * air with no input at all, and freezing that to 15 fps is the deck's own opposite — the ember's
 * bloom and the plume are the reason anyone leaves the window open.
 */

import { describe, expect, it } from 'vitest';
import {
  IDLE_AFTER_MS,
  IDLE_PAINT_MS,
  shouldPaint,
  type SceneLife,
} from '../composables/idlePaint';

const calm: SceneLife = {
  sessionActive: false,
  lit: false,
  particles: 0,
  idleMs: IDLE_AFTER_MS + 500,
};

describe('an unwatched scene stops paying for frames (S12)', () => {
  it('paints every beat while anything is alive', () => {
    for (const life of [
      { ...calm, sessionActive: true },
      { ...calm, lit: true },
      { ...calm, particles: 1 },
      { ...calm, idleMs: 0 },
    ]) {
      // `sincePaintMs` of 1 is the point: a live scene is never told to wait.
      expect(shouldPaint(life, 1), JSON.stringify(life)).toBe(true);
    }
  });

  it('throttles only the still, empty, unwatched frame — and then alternates', () => {
    expect(shouldPaint(calm, IDLE_PAINT_MS - 1)).toBe(false);
    expect(shouldPaint(calm, IDLE_PAINT_MS)).toBe(true);
    console.log(
      `IDLE every=${String(IDLE_PAINT_MS)}ms ≈ ${String(Math.round(1000 / IDLE_PAINT_MS))}fps`,
    );
    expect(Math.round(1000 / IDLE_PAINT_MS)).toBeLessThanOrEqual(16);
    expect(Math.round(1000 / IDLE_PAINT_MS)).toBeGreaterThanOrEqual(14);
  });

  it('gives the frame rate straight back the moment the player comes near it', () => {
    // The recovery is not a timer the player has to outlast: one input beat and the next frame is
    // already being painted, which is what 「有交互时恢复」 has to mean or the app feels stuck.
    expect(shouldPaint({ ...calm, idleMs: IDLE_AFTER_MS - 1 }, 0)).toBe(true);
    expect(shouldPaint({ ...calm, sessionActive: true }, 0)).toBe(true);
    expect(shouldPaint({ ...calm, lit: true }, 0)).toBe(true);
  });
});
