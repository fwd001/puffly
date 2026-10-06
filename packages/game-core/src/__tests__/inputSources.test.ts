/**
 * Who an input comes from decides whether it may drag the rod across the table.
 *
 * A handle that is not a finger on the scene — the pill, the space bar, a future desktop shortcut —
 * names an anchor rather than a pixel. Treated as a pointer it carries the coordinates it never
 * had, and the rod is dragged into the top-left corner: which is exactly what a phone showed when
 * the pill pressed with `source: 'pointer'` at (0, 0).
 */

import { describe, expect, it } from 'vitest';
import type { GameInput } from '@puffly/game-core';
import { harness, lit, type Harness } from './harness';

const send = (h: Harness, input: Partial<GameInput> & { type: GameInput['type'] }): void => {
  h.engine.send({
    x: 0,
    y: 0,
    timestamp: h.state().nowMs,
    ...input,
  } as GameInput);
};

describe('inputs that carry no pixel of their own (§65)', () => {
  it('a shortcut hold aims at the anchor, and the rod stays on the table', () => {
    const h = harness();
    lit(h);
    send(h, { type: 'hold', target: 'cigarette', source: 'shortcut' });
    h.run(700);
    const pivot = h.state().cigarette.pose.pivot;
    // The held rest, not the corner: (0,0) would put the rod off the table entirely.
    expect(pivot.x).toBeGreaterThan(0.3);
    expect(pivot.y).toBeGreaterThan(0.3);
    expect(h.state().cigarette.puff.active).toBe(true);
  });

  it('a release from the same handle does not throw the stub at the corner either', () => {
    const h = harness();
    lit(h);
    send(h, { type: 'hold', target: 'cigarette', source: 'shortcut' });
    h.run(700);
    send(h, { type: 'release', target: 'cigarette', source: 'shortcut' });
    h.run(400);
    expect(h.state().cigarette.pose.pivot.y).toBeGreaterThan(0.3);
  });

  it('a finger press still drags, because that is the finger doing it (§66)', () => {
    const h = harness();
    lit(h);
    send(h, { type: 'hold', target: 'cigarette', x: 0.05, y: 0.05, source: 'pointer' });
    h.run(200);
    const pivot = h.state().cigarette.pose.pivot;
    expect(pivot.x).toBeLessThan(0.25);
    expect(pivot.y).toBeLessThan(0.25);
  });
});
