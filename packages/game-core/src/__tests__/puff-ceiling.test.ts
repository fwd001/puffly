/**
 * One draw has a ceiling — 2026-10-08 拍板 ①: 「就是手指按压的长度来决定，但是那一口有一个最大的
 * 限制，不要做成按一下就走完整口，半口或者是一小点儿也可以自主地按按压的长度来决定」.
 *
 * So the press still owns the draw — a half-sip is a valid sip, and nothing walks the mouth through
 * a fixed beat — and holding on for ever stops being a strategy. The line is drawn where the ring is
 * already full: `progress` reaches 1 at the rod's own planned length, and the ceiling is how much
 * longer a *visibly finished* draw may be held before the mouth comes off the rod by itself.
 *
 * Every timestamp here is read off `puff.heldMs`, the draw's own clock, and not off how long the
 * walk ran: `engine.advance(25)` executes `floor(25 / STEP_MS)` whole fixed steps and drops the
 * remainder, so wall time the walk thinks it spent is not what the simulation charged the finger for.
 */

import { describe, expect, it } from 'vitest';
import { PUFF, STEP_MS } from '../constants';
import { SessionEventType } from '../types/events';
import type { Settings } from '@puffly/game-core';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { harness, lit, type Harness } from './harness';

interface Draw {
  /** The draw clock at the frame the ring filled — the end of the draw the rod asked for. 0 never. */
  saturateMs: number;
  /** The draw clock on the last frame the mouth was still closed. */
  heldMs: number;
  /** Whether the draw let go of the finger within the walk. */
  ended: boolean;
  /** Puffs the ledger has after the walk. */
  count: number;
  /** Whether the finger was still down at the end of the walk. */
  active: boolean;
  /** The strength the draw reached. */
  intensity: number;
}

/** Hold the rod down, one fixed step at a time, until `limitMs` or until the draw ends itself. */
function hold(h: Harness, limitMs: number): Draw {
  let saturateMs = 0;
  let heldMs = 0;
  let ended = false;
  let spent = 0;
  h.press('cigarette');
  while (spent < limitMs) {
    h.run(STEP_MS);
    const puff = h.state().cigarette.puff;
    if (!puff.active) {
      ended = true;
      // `endPuff` does not clear the clock, so this read is the frame the ceiling was crossed — the
      // next step would zero it as an idle one.
      heldMs = puff.heldMs;
      break;
    }
    heldMs = puff.heldMs;
    if (saturateMs === 0 && puff.progress >= 1) saturateMs = puff.heldMs;
    spent += STEP_MS;
  }
  const puff = h.state().cigarette.puff;
  return {
    saturateMs,
    heldMs,
    ended,
    count: puff.count,
    active: puff.active,
    intensity: puff.intensity,
  };
}

/** The window the draw itself recorded, so the ceiling is judged against a measured number. */
function lastPlannedMs(h: Harness): number {
  const row = [...h.sessionEvents].reverse().find((event) => event.type === SessionEventType.PUFF);
  return Number(row?.payload?.plannedMs ?? 0);
}

/** A lit rod in the hand, ready to be drawn on. */
function ready(settings: Partial<Settings> = {}): Harness {
  const h = harness({ settings });
  lit(h);
  return h;
}

describe('the press decides the draw', () => {
  it('a short press is a half draw, and nothing finishes it for you', () => {
    const h = ready();
    const drawn = hold(h, 900);
    expect(drawn.ended, 'a 0.9s hold was ended by the ceiling').toBe(false);
    expect(drawn.active, 'the draw let go of a finger that never reached the ceiling').toBe(true);
    expect(drawn.count).toBe(0);
    h.release('cigarette');
    expect(h.state().cigarette.puff.count).toBe(1);
    expect(h.state().cigarette.puff.intensity, 'a sip came out as a full draw').toBeLessThan(1);
  });

  it('and the ceiling is above the point where the ring is already full', () => {
    const h = ready();
    const drawn = hold(h, 12_000);
    const planned = lastPlannedMs(h);
    console.log(
      `CEILING saturate=${String(drawn.saturateMs)}ms end=${String(drawn.heldMs)}ms ` +
        `planned=${String(planned)}ms factor=${String(PUFF.maxHoldFactor)}`,
    );
    expect(drawn.ended, 'holding on never ended the draw').toBe(true);
    // The ring fills exactly where the rod's own window ends, and the let-go is one factor later.
    expect(drawn.saturateMs).toBeGreaterThanOrEqual(planned);
    expect(drawn.saturateMs).toBeLessThan(planned + STEP_MS);
    expect(drawn.heldMs).toBeGreaterThanOrEqual(planned * PUFF.maxHoldFactor);
    expect(drawn.heldMs).toBeLessThan(planned * PUFF.maxHoldFactor + STEP_MS);
  });
});

describe('at the ceiling, the mouth comes off the rod', () => {
  it('once, and not again while the finger stays down', () => {
    const h = ready();
    hold(h, 12_000);
    expect(h.state().cigarette.puff.active).toBe(false);
    expect(h.state().cigarette.puff.count).toBe(1);
    // Three more seconds of the same press: no second draw, no machine-gun of puffs.
    h.run(3000);
    expect(h.state().cigarette.puff.count, 'a held finger kept buying draws').toBe(1);
    expect(h.state().cigarette.puff.active).toBe(false);
  });

  it('and the auto-end is the same exhale a release would have made', () => {
    const h = ready();
    const before = h.state().progress.puffs;
    hold(h, 12_000);
    const state = h.state();
    expect(state.progress.puffs, 'the ledger did not see the draw').toBe(before + 1);
    expect(state.cigarette.puff.intensity).toBeGreaterThan(0.5);
    // The breath is in the air: the session's own log carries the draw with the length it held for.
    const rows = h.sessionEvents.filter((event) => JSON.stringify(event).includes('plannedMs'));
    expect(rows.length, 'no puff was recorded').toBe(1);
    expect(JSON.stringify(rows[0] ?? '')).toContain('heldMs');
  });

  it('the 含住 family gets the ceiling the longer of its two clocks asks for', () => {
    const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'cigar' });
    lit(h);
    const savour = h.state().cigarette.readouts.savourMs;
    expect(savour, 'this rod is not the mouthed family').toBeGreaterThan(0);
    const drawn = hold(h, 20_000);
    const planned = lastPlannedMs(h);
    // This family shows its ring on the mouth curve (`savourMs`) while the rod still asks for its own
    // draw window. The ceiling belongs to the longer of the two, so a 含住 two seconds rod that wants a
    // three-second 口 cannot be ended before its own window has passed.
    const basis = Math.max(planned, savour);
    console.log(
      `CEILING cigar savour=${String(savour)}ms planned=${String(planned)}ms ` +
        `saturate=${String(drawn.saturateMs)}ms end=${String(drawn.heldMs)}ms`,
    );
    expect(drawn.ended, 'holding a mouthed rod never ended the draw').toBe(true);
    expect(planned, 'the draw recorded no window').toBeGreaterThan(0);
    // The ring on this family closes on the mouth curve, not on the window.
    expect(drawn.saturateMs, 'the mouth did not close on its own curve').toBeGreaterThanOrEqual(
      savour,
    );
    expect(drawn.saturateMs).toBeLessThan(savour + STEP_MS);
    expect(drawn.heldMs).toBeGreaterThanOrEqual(basis * PUFF.maxHoldFactor);
    expect(drawn.heldMs).toBeLessThan(basis * PUFF.maxHoldFactor + STEP_MS);
  });
});

describe('the ceiling belongs to the draw the player chose', () => {
  it('a longer 单口时长 buys a proportionally longer ceiling', () => {
    const own = ready({ puffDurationSec: 3 });
    const shipped = ready();
    const ownDrawn = hold(own, 20_000);
    const shippedDrawn = hold(shipped, 20_000);
    console.log(
      `CEILING dial 3.0s end=${String(ownDrawn.heldMs)}ms | shipped end=${String(shippedDrawn.heldMs)}ms`,
    );
    expect(ownDrawn.heldMs, 'the ceiling ignored the dial').toBeGreaterThan(shippedDrawn.heldMs);
    expect(ownDrawn.heldMs / shippedDrawn.heldMs).toBeGreaterThanOrEqual(1.1);
  });
});
