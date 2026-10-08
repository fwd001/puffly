/**
 * 稿子 S7 的写实那一列：「烟灰有重量：先从灰柱断裂，再散开，再坠落，最后堆积变高」。
 *
 * The measured starting point was that the second and third beats did not exist: one frame after a
 * flick the column was already five grains (sizes 0.0040–0.0113), so nothing ever *broke off* — the
 * ash simply changed shape when the finger tapped. These cases pin the window between the break and
 * the scatter, and the two facts the scatter is not allowed to lose on the way.
 */

import { describe, expect, it } from 'vitest';
import { ASH, SessionEventType, type ContentBundle } from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit } from './harness';

/**
 * The fixture's rod burns in four seconds, which on 2026-10-08 became a *fast ash clock*: with the
 * column now growing at the burnt length (拍板 ②) a 4 s stick reaches 磕灰 every ~0.4 s, so cases
 * about one flick's 90–170 ms fuse were sampling whichever cycle the dice happened to be on. These
 * cases are about the fuse, so they run on a rod with a minute to burn — the order of magnitude the
 * shipped content actually uses (7.5 – 50 min).
 */
const SLOW: ContentBundle = {
  ...FIXTURE,
  cigarettes: FIXTURE.cigarettes.map((rod) =>
    rod.id === 'test-rod' ? { ...rod, burnDuration: { min: 60_000, max: 60_000 } } : rod,
  ),
};

describe('a flicked column breaks before it scatters (§ S7)', () => {
  it('comes off the rod as one piece', () => {
    const h = harness({ content: SLOW });
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);

    h.tap('ash');
    expect(h.state().cigarette.ash.falling).toHaveLength(1);
  });

  it('is still one piece a tenth of a second later', () => {
    const h = harness({ content: SLOW });
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);

    h.tap('ash');
    h.run(100);
    const inAir = h.state().cigarette.ash.falling.filter((fragment) => fragment.settledAtMs === 0);
    expect(inAir).toHaveLength(1);
  });

  it('becomes grains again within a third of a second', () => {
    const h = harness({ content: SLOW });
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);
    h.tap('ash');

    // 再散开 has to land inside the fall, which measured about a second from the tap to the tray.
    h.until(() => h.state().cigarette.ash.falling.length > 1, 340);
    expect(h.state().cigarette.ash.falling.length).toBeGreaterThan(1);
  });

  it('scatters into the number of pieces the session recorded', () => {
    const h = harness({ content: SLOW });
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);
    h.tap('ash');
    h.until(() => h.state().cigarette.ash.falling.length > 1, 340);

    // The record is what the archive and the statistics both read, so a scatter that disagreed with
    // it would be a second number for the same column of ash.
    expect(h.state().cigarette.ash.falling).toHaveLength(recordedFragments(h));
  });

  it('the grains are born on the piece they came from, not back at the rod', () => {
    const h = harness({ content: SLOW });
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);
    h.tap('ash');

    const first = h.state().cigarette.ash.falling[0];
    let flakeX = first?.origin.x ?? Number.NaN;
    let flakeY = first?.origin.y ?? Number.NaN;
    expect(flakeX, 'the flick left nothing falling').not.toBe(Number.NaN);
    let guard = 0;
    while (h.state().cigarette.ash.falling.length === 1 && guard < 40) {
      const current = h.state().cigarette.ash.falling[0];
      if (current !== undefined) {
        flakeX = current.origin.x;
        flakeY = current.origin.y;
      }
      h.flush();
      guard += 1;
    }
    const grains = h.state().cigarette.ash.falling;
    expect(grains.length).toBeGreaterThan(1);
    // Each grain is born within the scatter's own drift of the piece it came from. The rod's tip is
    // not: the column stands *up* from the ember, so a shard re-born there is a distance of about
    // the whole column away — which is what this caught when it was written as "did it fall far
    // enough", a phrasing the upward geometry made toothless.
    for (const [index, grain] of grains.entries()) {
      expect(
        Math.abs(grain.origin.x - flakeX),
        `grain ${String(index)} x is ${String(grain.origin.x - flakeX)} away`,
      ).toBeLessThanOrEqual(ASH.shardDrift);
      expect(
        Math.abs(grain.origin.y - flakeY),
        `grain ${String(index)} y is ${String(grain.origin.y - flakeY)} away`,
      ).toBeLessThanOrEqual(ASH.shardDrift);
    }
  });

  it('the scatter is one event: nothing breaks twice and the drop is still counted once', () => {
    const h = harness({ content: SLOW });
    lit(h);
    h.until(() => h.state().cigarette.ash.ready, 12_000);
    h.tap('ash');

    const dropped = h.state().cigarette.ash.dropped;
    const fragments = recordedFragments(h);
    h.until(() => h.state().cigarette.ash.falling.length > 1, 340);
    // A grain that still carried a fuse would shatter again on every landing, and the tray would
    // gain ash the rod never made.
    h.run(700);
    const falling = h.state().cigarette.ash.falling;
    expect(
      falling.length,
      `one flake became ${String(falling.length)} pieces, recorded ${String(fragments)}`,
    ).toBeLessThanOrEqual(fragments);
    for (const fragment of falling) {
      expect(fragment.shards, fragment.id).toBe(0);
      expect(fragment.breaksAtMs, fragment.id).toBe(0);
    }
    expect(h.state().cigarette.ash.dropped).toBe(dropped);
  });
});

/** The `fragments` the ASH event wrote for this session. */
function recordedFragments(h: ReturnType<typeof harness>): number {
  const flick = h.sessionEvents.find((event) => event.type === SessionEventType.ASH);
  return Number(flick?.payload?.['fragments'] ?? -1);
}
