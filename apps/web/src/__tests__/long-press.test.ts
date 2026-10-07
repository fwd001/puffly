/**
 * The hold handshake, driven in the order a real finger sends it.
 *
 * Two facts collide here: 松手收卡 (S19 — releasing the mark closes the card the hold opened) and
 * the browser's habit of sending `click` *after* `pointerup`. The first of those was added on
 * 2026-10-07 and cleared the "this was a hold" flag inside the release, so the click that followed
 * saw an ordinary tap and opened the sheet behind the card: the card flashed, vanished, and the
 * player was in the cabinet they had not asked for. Nothing in the unit layer could see it, because
 * no test sent the whole sequence — which is why this file exists and why the cases below are
 * sequences rather than handlers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARCHIVE_HOLD_MS, useLongPress } from '../composables/useLongPress';

interface Calls {
  long: number;
  tap: number;
  release: number;
}

/**
 * A `window` whose timer this test owns: the composable needs a clock, not a document, and a real
 * 600 ms wait per case would make the suite slow for no added truth.
 */
function handshake() {
  const calls: Calls = { long: 0, tap: 0, release: 0 };
  let pending: (() => void) | null = null;
  let scheduledMs = -1;
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms: number) => {
      pending = fn;
      scheduledMs = ms;
      return 1;
    },
    clearTimeout: () => {
      pending = null;
    },
  });

  const handlers = useLongPress(
    () => {
      calls.long += 1;
    },
    () => {
      calls.tap += 1;
    },
    () => {
      calls.release += 1;
    },
  );

  return {
    calls,
    /** How long the composable asked to wait before it decides this is a hold. */
    holdMs: () => scheduledMs,
    down: () => handlers.onPointerDown(),
    up: () => handlers.onPointerUp(),
    leave: () => handlers.onPointerLeave(),
    /** The finger stayed long enough that the card opened. */
    ring: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    click: () => handlers.onClick(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a hold and the click that follows it are one gesture', () => {
  it('waits the design’s six hundred milliseconds', () => {
    const hand = handshake();
    hand.down();
    expect(hand.holdMs(), 'the threshold drifted away from ARCHIVE_HOLD_MS').toBe(ARCHIVE_HOLD_MS);
    expect(ARCHIVE_HOLD_MS, 'the deck says 0.6 s').toBe(600);
  });

  it('opens the card, closes it on release, and still refuses the tap', () => {
    const hand = handshake();
    hand.down();
    hand.ring();
    expect(hand.calls, 'the hold did not open the card').toEqual({ long: 1, tap: 0, release: 0 });
    hand.up();
    hand.click();
    expect(hand.calls, 'the click after the release fired the tap behind the card').toEqual({
      long: 1,
      tap: 0,
      release: 1,
    });
  });

  it('refuses it just as much when the finger leaves the mark', () => {
    const hand = handshake();
    hand.down();
    hand.ring();
    hand.leave();
    hand.click();
    expect(hand.calls.tap, 'leaving the mark let the tap through').toBe(0);
    expect(hand.calls.release).toBe(1);
  });

  it('is only spent once: the next tap is a tap', () => {
    const hand = handshake();
    hand.down();
    hand.ring();
    hand.up();
    hand.click();
    hand.down();
    hand.up();
    hand.click();
    expect(hand.calls, 'the swallowed click was never given back').toEqual({
      long: 1,
      tap: 1,
      release: 1,
    });
  });

  it('gives it back even when the click never came at all', () => {
    // A finger that slides off the mark gets no `click` — the browser decides the gesture landed
    // nowhere. If the "this was a hold" mark survived that, the next tap on the same mark would be
    // eaten by a gesture that finished two touches ago.
    const hand = handshake();
    hand.down();
    hand.ring();
    hand.up();
    hand.down();
    hand.up();
    hand.click();
    expect(hand.calls, 'a stale hold swallowed a tap that was never part of it').toEqual({
      long: 1,
      tap: 1,
      release: 1,
    });
  });

  it('and a finger that never held is answered by the tap alone', () => {
    // The positive control: three of the four cases above are satisfied by a handler that never
    // taps at all, which would be a card you could read and a cabinet you could not open.
    const hand = handshake();
    hand.down();
    hand.up();
    hand.click();
    expect(hand.calls).toEqual({ long: 0, tap: 1, release: 0 });
  });
});
