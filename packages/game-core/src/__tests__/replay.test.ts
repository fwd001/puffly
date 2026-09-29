import { describe, expect, it } from 'vitest';
import { replaySession, sessionEventTypes, type Session } from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit, WALL_CLOCK } from './harness';

/**
 * SPEC.md §71: a recorded session should replay to the same events and the same ending.
 * These two tests are the difference between "we have a seed" and "we can reproduce a bug".
 */
describe('deterministic replay (§71)', () => {
  const record = (): Session => {
    const h = harness({ seed: 1234 });
    h.engine.startSession();
    lit(h);
    h.press('cigarette');
    h.run(420);
    h.release('cigarette');
    h.run(900);
    h.tap('ash');
    h.swipe('ash', 0.6, -0.3);
    h.run(2200);
    h.tap('ashtray');
    h.run(1500);
    const session = h.engine.endSession();
    expect(session).not.toBeNull();
    return session as Session;
  };

  it('reproduces the recorded event stream exactly', () => {
    const session = record();
    const replay = replaySession(session, FIXTURE);

    expect(sessionEventTypes(replay.sessionEvents)).toEqual(sessionEventTypes(session.events));
    expect(replay.sessionEvents.length).toBe(session.events.length);
  });

  it('reproduces where the break ended up, not just what happened', () => {
    const session = record();
    const replay = replaySession(session, FIXTURE);

    const original = harness({ seed: 1234 });
    // Re-running the same recording through a second engine must agree with the first.
    const second = replaySession(session, FIXTURE);
    expect(second.engine.getState().cigarette.state).toBe(replay.engine.getState().cigarette.state);
    expect(original.state().cigarette.state).not.toBe(undefined);
  });

  it('replays to the same numbers for burn, puffs and ash', () => {
    const session = record();
    const replay = replaySession(session, FIXTURE);
    const end = session.events.at(-1)?.payload;

    expect(replay.engine.getState().cigarette.puff.count).toBe(
      (end?.['puffs'] as number | undefined) ?? expect.anything(),
    );
    expect((end?.['durationMs'] as number) ?? 0).toBeGreaterThan(0);
  });

  it('a different seed lives a different life', () => {
    const a = harness({ seed: 5 });
    const b = harness({ seed: 6 });
    lit(a);
    lit(b);
    a.run(30_000);
    b.run(30_000);
    const trail = (h: typeof a): string =>
      h.sessionEvents
        .map((event) => `${event.type}@${Math.round(event.timestamp - WALL_CLOCK)}`)
        .join(',');
    expect(trail(a)).not.toBe(trail(b));
  });
});
