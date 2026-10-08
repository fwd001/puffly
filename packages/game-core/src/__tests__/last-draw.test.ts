/**
 * The strength of the draw that just ended, kept for the moment the smoke is leaving —
 * 2026-10-08, 稿子 S4 吐烟: 「页头换成 吐烟图标 + 环内力度 62」.
 *
 * `intensity` cannot carry that reading: the same field is the draw's live value while the mouth is
 * closed *and* the thing that fades out afterwards (`tickPuff` lerps it to 0 in ~320 ms), so a ring
 * that read it during the 900 ms settle window would tick 62 → 0 while the plume is still on screen.
 * The deck's number is a reading of **the draw the finger took**, so it has to be remembered at the
 * release and left alone until the next one.
 *
 * What this is *not*: it is not a second owner of the strength. The one number the release produces
 * is the one the session ledger records (`SessionEventType.PUFF` carries `intensity`), so the test
 * compares the reading against the ledger rather than against a recomputation.
 */

import { describe, expect, it } from 'vitest';
import { STEP_MS, TIMING } from '../constants';
import { SessionEventType } from '../types/events';
import { harness, lit, type Harness } from './harness';

/** The intensity the ledger was given for the most recent draw. */
function ledgerIntensity(h: Harness): number {
  const row = [...h.sessionEvents].reverse().find((event) => event.type === SessionEventType.PUFF);
  return Number(row?.payload?.intensity ?? -1);
}

/** Press, hold for `ms` one step at a time, and let go. */
function draw(h: Harness, ms: number): number {
  h.press('cigarette');
  let spent = 0;
  while (spent < ms) {
    h.run(STEP_MS);
    spent += STEP_MS;
  }
  const reached = h.state().cigarette.puff.intensity;
  h.release('cigarette');
  return reached;
}

describe('the draw keeps its own strength after the mouth comes off (§14, S4)', () => {
  it('reads nothing before the first draw has been taken', () => {
    const h = harness();
    expect(h.state().cigarette.puff.lastDraw).toBe(0);
    lit(h);
    expect(h.state().cigarette.puff.lastDraw, 'a lit rod has not been drawn on yet').toBe(0);
  });

  it('is the strength the release ended with, and the same figure the ledger got', () => {
    const h = harness();
    lit(h);
    const reached = draw(h, 900);
    const { lastDraw } = h.state().cigarette.puff;
    console.log(`LASTDRAW reached=${reached.toFixed(3)} held=${lastDraw.toFixed(3)}`);
    expect(lastDraw, 'nothing was carried out of the draw').toBeGreaterThan(0);
    expect(lastDraw).toBeCloseTo(ledgerIntensity(h), 3);
  });

  it('holds that figure for the whole settle window instead of fading with the smoke', () => {
    const h = harness();
    lit(h);
    draw(h, 900);
    const atRelease = h.state().cigarette.puff.lastDraw;
    const samples: number[] = [];
    for (let step = 0; step < 4; step += 1) {
      h.run(TIMING.restSettleMs / 4);
      samples.push(h.state().cigarette.puff.lastDraw);
    }
    // The live channel *does* fade — that is what the plume thins on.
    expect(h.state().cigarette.puff.intensity).toBeLessThan(atRelease);
    console.log(
      `LASTDRAW window held=${atRelease.toFixed(3)} samples=${samples
        .map((value) => value.toFixed(3))
        .join(',')}`,
    );
    for (const value of samples) {
      expect(value, 'the reading faded away with the smoke').toBeCloseTo(atRelease, 6);
    }
  });

  it('is cleared the moment a new draw starts, so the ring cannot show the previous mouth', () => {
    const h = harness();
    lit(h);
    draw(h, 900);
    expect(h.state().cigarette.puff.lastDraw).toBeGreaterThan(0);
    h.press('cigarette');
    expect(h.state().cigarette.puff.lastDraw, 'a second draw wore the number of the first').toBe(0);
  });

  it('tells a sip apart from a full hold', () => {
    const sip = harness();
    lit(sip);
    sip.tap('cigarette');
    const held = harness();
    lit(held);
    draw(held, 1500);
    console.log(
      `LASTDRAW tap=${sip.state().cigarette.puff.lastDraw.toFixed(3)} hold=${held
        .state()
        .cigarette.puff.lastDraw.toFixed(3)}`,
    );
    expect(sip.state().cigarette.puff.lastDraw, 'a tap carried no force at all').toBeGreaterThan(0);
    expect(held.state().cigarette.puff.lastDraw).toBeGreaterThan(
      sip.state().cigarette.puff.lastDraw,
    );
  });
});
