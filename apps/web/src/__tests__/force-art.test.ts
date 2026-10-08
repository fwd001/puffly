/**
 * 力度对照图 — the exhale screen from 稿子 S4, judged as a shape and as a number.
 *
 * The deck struck the two Chinese labels off the ends of the force bar (「小口 · 薄雾 / 大口 · 浓团」)
 * and wrote what they became: 「力度条本身就是对照图：左端是细雾三道丝线图标，右端是浓团三层云朵图标，
 * 中间滑杆，零文字」. And the head-up row got 「环内力度 62」. So two surfaces read one figure, which is
 * the class of thing that drifts apart — one of them recomputes, or one of them stays on a screen the
 * deck did not name. These cases pin the single owner, the two counts the deck wrote out (三道 / 三层),
 * and the promise that no word is on the bar.
 *
 * What the machine cannot judge is kept out of the assertions: whether three hairlines and three lobes
 * actually *read* as 薄雾 and 浓团 at 24 px is an eye call, and the eye is the user's.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORCE_CLOUD, FORCE_THREADS, FORCE_TRACK, forceKnobX, forceReading } from '../forceArt';

const PILL = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');
const HUD = readFileSync(new URL('../components/HudBar.vue', import.meta.url), 'utf8');

/** The opening tag of one of the pill's 示意图 blocks, chosen by the class it paints with. */
function artTag(cls: string): string {
  const at = PILL.indexOf(`class="art ${cls}"`);
  expect(at, `the pill no longer has the .art.${cls} block`).toBeGreaterThan(-1);
  const open = PILL.lastIndexOf('<svg', at);
  const close = PILL.indexOf('>', at);
  expect(open, `no svg opens the .art.${cls} block`).toBeGreaterThan(-1);
  return PILL.slice(open, close);
}

/** Everything the block draws: from its class attribute to the end of its own svg. */
function artBody(cls: string): string {
  const start = PILL.indexOf(`class="art ${cls}"`);
  expect(start, `the pill no longer draws .art.${cls}`).toBeGreaterThan(-1);
  const end = PILL.indexOf('</svg>', start);
  expect(end, `the .art.${cls} svg never closes`).toBeGreaterThan(start);
  return PILL.slice(start, end);
}

/** The body of the HUD's draw case — the one place the ring decides what it wears. */
function puffCase(source: string): string {
  const start = source.indexOf("case 'puff':");
  expect(start, 'HudBar lost the draw reading').toBeGreaterThan(-1);
  const end = source.indexOf("case 'tray':", start);
  expect(end, 'the draw case runs to the end of the switch').toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('one figure, two surfaces (§26)', () => {
  it('reads only in the window the smoke is leaving', () => {
    const at = (state: string, lastDraw: number) => forceReading({ state, puff: { lastDraw } });
    expect(at('PUFFING', 0.86), 'the draw itself is not the exhale').toBeNull();
    expect(at('BURNING', 0.86), 'smouldering is not the exhale').toBeNull();
    expect(at('ASH_READY', 0.86), 'a column worth flicking is not the exhale').toBeNull();
    expect(at('EXTINGUISHED', 0.86)).toBeNull();
    expect(at('RESTING', 0.86), 'the release is the exhale').toBe(86);
  });

  it('reads nothing for a draw that was never taken', () => {
    // `lastDraw` is 0 on a rod that has not been drawn on, and on one restored from a save.
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 0 } })).toBeNull();
  });

  it('is the core figure rounded once, and stays inside its own scale', () => {
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 0.62 } })).toBe(62);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 1 } })).toBe(100);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 0.004 } })).toBe(0);
    // A broken number cannot push the knob off the bar or turn the reading negative: too small to
    // report is reported as nothing, which is what the bar's own "no draw" state already means.
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: 1.7 } })).toBe(100);
    expect(forceReading({ state: 'RESTING', puff: { lastDraw: -3 } })).toBeNull();
    for (const value of [0.004, 0.2, 0.62, 0.86, 1]) {
      const reading = forceReading({ state: 'RESTING', puff: { lastDraw: value } });
      expect(reading, `${String(value)} read nothing`).not.toBeNull();
      expect(Number(reading) >= 0 && Number(reading) <= 100, `${value} left the scale`).toBe(true);
    }
  });

  it('puts the knob under the number it belongs to', () => {
    expect(forceKnobX(0)).toBe(FORCE_TRACK.start);
    expect(forceKnobX(100)).toBe(FORCE_TRACK.end);
    const low = forceKnobX(20);
    const mid = forceKnobX(62);
    const high = forceKnobX(86);
    console.log(
      `FORCE track=${String(FORCE_TRACK.start)}..${String(FORCE_TRACK.end)} ` +
        `20=${low.toFixed(1)} 62=${mid.toFixed(1)} 86=${high.toFixed(1)}`,
    );
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    // The deck's own reading sits between the two ends it drew.
    expect(mid).toBeLessThan(FORCE_TRACK.end);
    expect(forceKnobX(140), 'a reading above the scale escaped the track').toBe(FORCE_TRACK.end);
  });

  it('leaves the ring and the bar one owner', () => {
    expect(PILL, 'the pill stopped asking the shared figure').toContain('forceReading');
    // Not merely "the file mentions it" — an import that nothing calls, next to a freshly recomputed
    // number in the ring, is exactly how the two surfaces would start disagreeing.
    expect(
      puffCase(HUD),
      'the ring recomputes the force instead of asking the one owner',
    ).toContain('forceReading(rod)');
  });

  it('wears the number inside the ring, which is where the deck put it', () => {
    // 「环内力度 62」: the digits slot of the ring, not another cell of the row.
    expect(puffCase(HUD)).toMatch(/value: String\(exhale\)/);
  });
});

describe('the two ends are the counts the deck wrote, and neither is a word', () => {
  it('is 三道丝线 and 三层云朵 — three and three', () => {
    expect(FORCE_THREADS).toHaveLength(3);
    expect(FORCE_CLOUD).toHaveLength(3);
    for (const d of FORCE_THREADS) expect(d, d).toMatch(/^M[\d.\s,-]+/);
    console.log(
      `FORCE ends threads=${String(FORCE_THREADS.length)} cloud=${String(FORCE_CLOUD.length)}`,
    );
  });

  it('carries not one character of prose on the bar', () => {
    const block = artBody('force');
    // Every text node inside the svg: a label that came back is exactly the thing the deck struck.
    const texts = [...block.matchAll(/>([^<]+)</g)]
      .map((match) => match[1] ?? '')
      .filter((text) => text.trim() !== '');
    expect(texts, `the force bar speaks: ${texts.join('|')}`).toEqual([]);
    // And it is a picture, not a control: the press owns the draw, so nothing here is tappable,
    // and §37 forbids an un-tappable thing carrying an anchor.
    expect(block).not.toMatch(/data-hook|@click|data-aim/);
    expect(block).toContain('aria-hidden="true"');
  });

  it('draws the ends from the shared arrays rather than a second copy of the shapes', () => {
    const block = artBody('force');
    expect(block).toContain('FORCE_THREADS');
    expect(block).toContain('FORCE_CLOUD');
    // The knob's position comes from the shared geometry module, not from an expression copied into
    // the template — that copy is how a bar and a number start disagreeing.
    expect(block).toMatch(/class="knob"/);
    expect(PILL, 'the pill placed the knob itself').toContain('forceKnobX');
  });

  it('gets the bar to the exhale instead of letting the resistance wave keep it', () => {
    // The wave is `phase === 'puff'`, and the settle window *is* that phase: a bar placed after it in
    // the chain would never render. So the wave has to give the window up.
    expect(artTag('wave')).toContain('force === null');
    expect(artTag('force')).toContain('v-else-if');
    expect(PILL.indexOf('class="art wave"')).toBeLessThan(PILL.indexOf('class="art force"'));
  });

  it('gives the 品鉴型 the bar even though they never get the resistance wave', () => {
    // 稿子 S16: 「雪茄、斗烟、水烟……不出现肺阻力反馈」 — the wave is theirs to lose, the exhale is not.
    expect(artTag('wave')).toContain('savor');
    expect(artTag('force'), 'the force bar started hiding itself by rod kind').not.toContain(
      'savor',
    );
  });
});
