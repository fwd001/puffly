/**
 * The lighter may be played with, and the switch that says it may not has to mean it — §21.
 *
 * Two separate things were wrong here. A tap on the lighter while the rod was already alight did
 * nothing at all: the prop is drawn, it carries a hit anchor, and it answered with silence, which
 * is the dead button §26 is written against. And a table where nothing ever moves on its own is a
 * photograph rather than a room, so the lighter now flicks its own cap once in a while — unless the
 * player said not to.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { STEP_MS, type EngineEvent } from '@puffly/game-core';
import { harness } from './harness';

const WINDOW_MS = 90_000;

/** Run an untouched table for `WINDOW_MS` and report what the lighter did during it. */
function watch(settings: { idleFlourishes: boolean }): {
  fidgetFrames: number;
  bursts: number;
  firstAtMs: number | null;
} {
  const h = harness({ content: DEFAULT_CONTENT, seed: 21, settings });
  const events: EngineEvent[] = [];
  h.engine.on((event) => events.push(event));
  let fidgetFrames = 0;
  let firstAtMs: number | null = null;
  for (let elapsed = 0; elapsed < WINDOW_MS; elapsed += STEP_MS) {
    h.run(STEP_MS);
    const fidget = h.state().lighter.fidget;
    if (fidget > 0) {
      fidgetFrames += 1;
      if (firstAtMs === null) firstAtMs = elapsed;
    }
  }
  return { fidgetFrames, bursts: events.filter((e) => e.kind === 'burst').length, firstAtMs };
}

describe('the lighter can be fiddled with (§21, §26)', () => {
  it('answers a tap even when there is nothing left to light', () => {
    const h = harness({ content: DEFAULT_CONTENT });
    h.tap('cigarette');
    h.tap('lighter');
    h.until(() => h.state().cigarette.state === 'BURNING', 5000);
    const before = h.events.filter((e) => e.kind === 'burst').length;

    h.tap('lighter');
    h.run(40);
    const state = h.state();
    expect(state.cigarette.state, 'a tap while lit restarted the lighting attempt').toBe('BURNING');
    expect(state.lighter.fidget, 'the tap was swallowed').toBeGreaterThan(0.5);
    expect(
      h.events.filter((e) => e.kind === 'burst').length,
      'and it made no spark either',
    ).toBeGreaterThan(before);
  });

  it('throws its own cap when the table is left alone', () => {
    const seen = watch({ idleFlourishes: true });
    console.log(
      `FIDGET on frames=${String(seen.fidgetFrames)} bursts=${String(seen.bursts)} first=${String(seen.firstAtMs)}`,
    );
    expect(seen.firstAtMs, 'nothing ever happened in 90 s of an untouched table').not.toBeNull();
    expect(seen.firstAtMs!).toBeGreaterThan(5000);
    // A flourish is a few tenths of a second of impulse, not a mode that latches on.
    expect(seen.fidgetFrames).toBeLessThan(WINDOW_MS / STEP_MS / 8);
  });

  it('is perfectly still when the player said not to', () => {
    const off = watch({ idleFlourishes: false });
    console.log(`FIDGET off frames=${String(off.fidgetFrames)} bursts=${String(off.bursts)}`);
    expect(off.fidgetFrames).toBe(0);
    expect(off.bursts, 'an event fired anyway').toBe(0);
  });

  it('replays the same table twice, so the switch is a preference and not a re-seed', () => {
    const a = watch({ idleFlourishes: true });
    const b = watch({ idleFlourishes: true });
    expect([a.fidgetFrames, a.bursts, a.firstAtMs]).toEqual([
      b.fidgetFrames,
      b.bursts,
      b.firstAtMs,
    ]);
  });
});
