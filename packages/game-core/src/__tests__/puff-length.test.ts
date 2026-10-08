/**
 * S14's 「单口时长」 — the third custom dial the deck names, and the one that could have been a
 * disguised way to change the burn.
 *
 * The dial sets how long one draw takes to *fill*: `puffProfile.durationMin/Max` is the rod's own
 * window (S9 gives each slot its own 单口吸入 figure, and `brief-conformance.test.ts` keeps them
 * there), and a player who picks 4.0 s is saying a held finger is still filling at four seconds.
 * What it must not do is hand out a different length of cigarette — the rod's clock is drawn the same
 * way with the dial set or not, which is the second case below.
 *
 * What this file does **not** buy: the roll of the rod's own window is kept even when the dial
 * overrides it, so the number stream cannot come to depend on a preference. Nothing here can see a
 * version that skips it — a replay reads the same settings it was recorded with, so the difference is
 * invisible to any assertion this layer can reach. It is a deliberate choice, not a guarded one.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { SessionEventType, type Settings } from '@puffly/game-core';
import { harness, lit } from './harness';

const ROD = DEFAULT_CONTENT.cigarettes.find((rod) => rod.unlock.kind === 'default');

/** Ten draws of a fixed length each, and what the engine planned behind them. */
function draws(settings: Partial<Settings> = {}): {
  planned: number[];
  burnMsTotal: number;
  count: number;
} {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId: ROD?.id ?? 'classic', settings });
  lit(h);
  for (let i = 0; i < 10; i++) {
    h.press('cigarette');
    h.run(900);
    h.release('cigarette');
    h.run(1800);
  }
  const planned = h.sessionEvents
    .filter((event) => event.type === SessionEventType.PUFF)
    .map((event) => Number(event.payload?.['plannedMs']));
  return {
    planned,
    burnMsTotal: h.state().cigarette.burnMsTotal,
    count: h.state().cigarette.puff.count,
  };
}

describe('the 单口时长 dial shapes a draw, not a rod (S14)', () => {
  it('leaves the rod its own window when nobody picks', () => {
    const window = ROD?.puffProfile;
    expect(window, 'the default rod has no draw window').toBeDefined();
    const seen = draws().planned;
    expect(seen.length).toBe(10);
    for (const ms of seen) {
      expect(ms, 'authored draw out of the rod’s window').toBeGreaterThanOrEqual(
        window?.durationMin ?? -1,
      );
      expect(ms).toBeLessThanOrEqual(window?.durationMax ?? 0);
    }
    // The spread is the point: a hand that holds the same time every draw still gets a rod that
    // fills a little differently each time, which is what the window was authored for.
    expect(new Set(seen).size, 'the authored window collapsed to one value').toBeGreaterThan(1);
    console.log(
      `OWN window=${String(window?.durationMin)}-${String(window?.durationMax)} ` +
        `planned=${seen.slice(0, 4).map(String).join(',')},…`,
    );
  });

  it('plans exactly the seconds the player picked', () => {
    const chosen = draws({ puffDurationSec: 4 }).planned;
    expect(chosen.length).toBe(10);
    for (const ms of chosen) expect(ms).toBe(4000);
  });

  it('hands out the same cigarette either way', () => {
    const own = draws();
    const dialled = draws({ puffDurationSec: 4 });
    // The rod's own clock is drawn from the same stream and lands on the same number, and the ten
    // holds are still ten draws: this is a dial on the fill of a breath, not a length of tobacco.
    expect(dialled.burnMsTotal, 'the dial changed how long the rod is').toBe(own.burnMsTotal);
    expect(dialled.count).toBe(own.count);
    console.log(
      `CLOCK burnMsTotal own=${String(own.burnMsTotal)} dialled=${String(dialled.burnMsTotal)} ` +
        `puffs=${String(own.count)}->${String(dialled.count)}`,
    );
  });
});
