/**
 * The brief's colours and gates, pinned — the handoff document's 视觉基线 for the six skins.
 *
 * These are transcriptions of an outside source, written down a second time on purpose: 24 hex
 * values, four layers per skin, plus the gates that open them. Nothing else in the suite could
 * notice one of them drifting, and a palette that drifts quietly is the 烟羽 layer changing colour
 * on its own. The eleven categories' stick ladder is deliberately not repeated here — it is
 * already computed and asserted in `tests/sessionLoop.test.ts`.
 *
 * The brief's 累计支数 and `progress.sessions` used to be two different counts, with the second one
 * also taking in a break that ended with the rod unlit. That gap is closed rather than papered over:
 * `sessionWasLit` is now the single definition of a counted stick (S23's 「点了不抽也行 按照计次」),
 * read the same way by the gates, the ladder and the day tally — `lifecycle.test.ts` pins both
 * edges of it, and `reduction.test.ts` keeps the page honest about the same rule.
 */

import { describe, expect, it } from 'vitest';
import { CIGARETTES, FINDABLE_PACKS, LIGHTERS, SKINS } from '@puffly/game-content';

const hex = (rgb: readonly number[]): string =>
  '#' +
  rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0').toUpperCase()).join('');

/** 附录 C 视觉基线, as the spec sheet lists the six skins. */
const BRIEF_SKINS: Record<string, { paper: string; ember: string; smoke: string; pool: string }> = {
  night: { paper: '#F5F0E6', ember: '#FF8A3D', smoke: '#D1CCC5', pool: '#FFD9A0' },
  copper: { paper: '#E5C799', ember: '#FFB85C', smoke: '#DBC2A8', pool: '#FFCC94' },
  snow: { paper: '#F7FAFF', ember: '#9EBBF5', smoke: '#E0EAF7', pool: '#AEC4FA' },
  moss: { paper: '#DBD9C2', ember: '#A6D97A', smoke: '#CCD6C2', pool: '#ADCE94' },
  ash: { paper: '#CCC9C7', ember: '#B3B2B8', smoke: '#B8B8B9', pool: '#E0E0E1' },
  cinnabar: { paper: '#F5DBC7', ember: '#FF6138', smoke: '#E5C7BC', pool: '#FFA985' },
};

/** 开箱 / 40 / 120 / 260 / 420 支, and 朱砂 bound to the twelve boxes rather than to volume. */
const BRIEF_SKIN_GATES: Record<string, string> = {
  night: 'default',
  copper: 'sessions:40',
  snow: 'sessions:120',
  moss: 'sessions:260',
  ash: 'sessions:420',
  // The sheet says twelve boxes, but two mid slots are left unnamed on purpose, so the gate is the
  // number that can actually be found. Typed as twelve it silently re-breaks: the last skin would
  // sit behind a collection nobody can finish.
  cinnabar: `packs:${String(FINDABLE_PACKS)}`,
};

const gateOf = (unlock: { kind: string; count?: number }): string =>
  unlock.kind === 'default' ? 'default' : `${unlock.kind}:${unlock.count ?? 0}`;

describe('the skins carry the brief’s own colours (§57)', () => {
  it('paints all six skins with the four colours the sheet names', () => {
    expect(SKINS).toHaveLength(6);
    for (const skin of SKINS) {
      const brief = BRIEF_SKINS[skin.id];
      expect(brief, `no brief entry for the skin ${skin.id}`).toBeDefined();
      expect(
        {
          paper: hex(skin.palette.paper),
          ember: hex(skin.palette.ember),
          smoke: hex(skin.palette.smoke),
          pool: hex(skin.palette.pool),
        },
        `palette of ${skin.id}`,
      ).toEqual(brief);
    }
  });

  it('gates each skin where the sheet says', () => {
    for (const skin of SKINS) {
      expect(gateOf(skin.unlock), `unlock of ${skin.id}`).toBe(BRIEF_SKIN_GATES[skin.id]);
    }
  });

  it('leaves the collection line to the one skin the brief ties to it', () => {
    // 「朱砂绑定烟盒收集而非支数，使皮肤线与收集线不抢资源」 — the pack counter is spent by
    // exactly one item, so grinding volume can never open it and collecting can never rush a skin.
    const gated = [
      ...SKINS.filter((skin) => skin.unlock.kind === 'packs').map((skin) => `skin:${skin.id}`),
      ...CIGARETTES.filter((rod) => rod.unlock.kind === 'packs').map(
        (rod) => `cigarette:${rod.id}`,
      ),
      ...LIGHTERS.filter((lighter) => lighter.unlock.kind === 'packs').map(
        (lighter) => `lighter:${lighter.id}`,
      ),
    ];
    expect(gated).toEqual(['skin:cinnabar']);
  });
});

/**
 * The deck's two number tables, keyed by the **gate** that opens each slot: S8's grid writes each
 * 时长 next to the 「抽满 N 支」 that opens that same cell, and S9's 参数表 lists 口数 / 单口吸入 / 余烬
 * 温度 for the eleven slots. The eleven gates are the same eleven numbers this build uses, so a rod
 * is paired with a number through its *slot* rather than through its name — which is the whole point:
 * the deck calls its 卷烟 原生 / 薄荷 / 手卷 / 深焙 / 冰凉 / 典藏 / 丁香 while this build names them by
 * shape, and which flavour is which rod is still an open question (SPEC.md 「稿子的参数表逐只对了一遍」).
 * Every number below is therefore decided without answering that.
 *
 * Only the columns the deck really prints for a slot are filled: 丁香 has a length on the grid and
 * nothing in the table, and the five world categories give a range where the six 卷烟 give a point.
 */
const BRIEF_SLOT: Record<
  string,
  {
    minutes: number;
    puffs?: { within?: [number, number]; is?: number };
    temp?: { within?: [number, number]; is?: number };
    /** 单口吸入, in milliseconds — S9's own column. */
    drawMs?: number;
  }
> = {
  // 原生 Standard: 10.0 min · 12 口 · 2.0 s · 780 C.
  default: { minutes: 10.0, puffs: { is: 12 }, temp: { is: 780 }, drawMs: 2_000 },
  // 薄荷 Menthol: 9.0 min · 11 口 · 1.8 s · 740 C.
  '8': { minutes: 9.0, puffs: { is: 11 }, temp: { is: 740 }, drawMs: 1_800 },
  // 手卷 Roll-Your-Own: 7.5 min · 17 口 · 2.8 s · 820 C.
  '20': { minutes: 7.5, puffs: { is: 17 }, temp: { is: 820 }, drawMs: 2_800 },
  // 丁香: the grid gives a length, the parameter table has no row for it.
  '40': { minutes: 7.5 },
  // 冰凉 Ice Cool: 14.0 min · 16 口 · 1.6 s · 700 C.
  '65': { minutes: 14.0, puffs: { is: 16 }, temp: { is: 700 }, drawMs: 1_600 },
  // 深焙 Dark Roast: 12.0 min · 14 口 · 2.6 s · 800 C.
  '95': { minutes: 12.0, puffs: { is: 14 }, temp: { is: 800 }, drawMs: 2_600 },
  // 小雪茄: 18.0 min · 15-20 口 · 700-800 C.
  '135': { minutes: 18.0, puffs: { within: [15, 20] }, temp: { within: [700, 800] } },
  // 典藏 Reserve: 13 口 · 2.2 s · 850 C. The deck's two tables disagree on its length (S8 says
  // 10.0 min, S9 says 11.0), so the grid wins — it is the screen this build was rebuilt from — and
  // the one-minute gap is recorded rather than hidden.
  '190': { minutes: 10.0, puffs: { is: 13 }, temp: { is: 850 }, drawMs: 2_200 },
  // 雪茄: 50.0 min · 25-40 口 · 800-900 C.
  '250': { minutes: 50.0, puffs: { within: [25, 40] }, temp: { within: [800, 900] } },
  // 斗烟: 40.0 min · 10-15 口 · 600-750 C.
  '320': { minutes: 40.0, puffs: { within: [10, 15] }, temp: { within: [600, 750] } },
  // 水烟: 50.0 min · 60-80 口 · 350-450 C.
  '420': { minutes: 50.0, puffs: { within: [60, 80] }, temp: { within: [350, 450] } },
};

const gateKey = (unlock: { kind: string; count?: number }): string =>
  unlock.kind === 'default' ? 'default' : String(unlock.count ?? -1);

function inside(
  id: string,
  label: string,
  value: number,
  bound: { within?: [number, number]; is?: number },
) {
  if (bound.within) {
    const [lo, hi] = bound.within;
    expect(
      value,
      `${id} ${label} ${String(value)} outside the deck's ${String(lo)}-${String(hi)}`,
    ).toBeGreaterThanOrEqual(lo);
    expect(
      value,
      `${id} ${label} ${String(value)} outside the deck's ${String(lo)}-${String(hi)}`,
    ).toBeLessThanOrEqual(hi);
  }
  if (bound.is !== undefined) {
    expect(value, `${id} ${label} never reaches the deck's ${String(bound.is)}`).toBe(bound.is);
  }
}

describe('every rod keeps the numbers the deck gives its slot (§ S8, § S9, § S16)', () => {
  it('occupies a slot the deck names, and leaves no slot over', () => {
    // The pairing rule judges itself: eleven gates in, eleven slots out, one each way. Without this
    // the four cases below could each be quietly reading the wrong row.
    expect(CIGARETTES.map((rod) => gateKey(rod.unlock)).sort()).toEqual(
      Object.keys(BRIEF_SLOT).sort(),
    );
  });

  it('burns for the minutes the grid prints', () => {
    for (const [gate, deck] of Object.entries(BRIEF_SLOT)) {
      const rod = CIGARETTES.find((candidate) => gateKey(candidate.unlock) === gate);
      expect(rod, `no rod occupies slot ${gate}`).toBeDefined();
      // 「游戏里按区间中值给参数」(S9) — the deck's figure is the midpoint, and the spread around it
      // is this build's own. The tenth is what the grid itself prints (7.5, 18.0, 50.0).
      const middle = ((rod?.burnDuration.min ?? 0) + (rod?.burnDuration.max ?? 0)) / 2 / 60_000;
      console.log(
        `MINUTES ${String(rod?.id)} gate=${gate} mid=${middle.toFixed(1)} deck=${String(deck.minutes)}`,
      );
      expect(Number(middle.toFixed(1)), `${String(rod?.id)} minutes`).toBe(deck.minutes);
    }
  });

  it('give the 口数 the deck gives them', () => {
    for (const [gate, deck] of Object.entries(BRIEF_SLOT)) {
      if (deck.puffs === undefined) continue;
      const rod = CIGARETTES.find((candidate) => gateKey(candidate.unlock) === gate);
      expect(rod, `no rod occupies slot ${gate}`).toBeDefined();
      // Only the target is the deck's number: 「按区间中值给参数」. min/max are this build's own
      // variability around it, and a roll that comes out one puff short of the deck's floor is not
      // a contradiction of anything the deck claims.
      console.log(
        `PUFFS ${String(rod?.id)} gate=${gate} target=${String(rod?.physical.puffs.target)} ` +
          `deck=${JSON.stringify(deck.puffs)}`,
      );
      inside(String(rod?.id), 'puffs', rod?.physical.puffs.target ?? -1, deck.puffs);
    }
  });

  it('keep their 芯温 where the deck puts it', () => {
    for (const [gate, deck] of Object.entries(BRIEF_SLOT)) {
      if (deck.temp === undefined) continue;
      const rod = CIGARETTES.find((candidate) => gateKey(candidate.unlock) === gate);
      expect(rod, `no rod occupies slot ${gate}`).toBeDefined();
      const [lo, hi] = rod?.physical.centerTempC ?? [-1, -1];
      console.log(
        `HEAT ${String(rod?.id)} gate=${gate} window=${String(lo)}-${String(hi)} ` +
          `deck=${JSON.stringify(deck.temp)}`,
      );
      if (deck.temp.is === undefined) {
        inside(String(rod?.id), 'temp low', lo, deck.temp);
        inside(String(rod?.id), 'temp high', hi, deck.temp);
      } else {
        expect(
          lo,
          `${String(rod?.id)} core window starts above the deck's point`,
        ).toBeLessThanOrEqual(deck.temp.is);
        expect(
          hi,
          `${String(rod?.id)} core window ends below the deck's point`,
        ).toBeGreaterThanOrEqual(deck.temp.is);
      }
    }
  });

  it('draw the 单口吸入 the table gives them', () => {
    for (const [gate, deck] of Object.entries(BRIEF_SLOT)) {
      if (deck.drawMs === undefined) continue;
      const rod = CIGARETTES.find((candidate) => gateKey(candidate.unlock) === gate);
      expect(rod, `no rod occupies slot ${gate}`).toBeDefined();
      // The middle again: `durationMin/Max` are the hand's own variation around one draw, and what
      // the deck prints is the figure a machine gives (ISO 3308's 2.0 s / 35 ml is the row's header).
      const window = rod?.puffProfile;
      const middle = ((window?.durationMin ?? 0) + (window?.durationMax ?? 0)) / 2;
      console.log(
        `DRAW ${String(rod?.id)} gate=${gate} window=${String(window?.durationMin)}-` +
          `${String(window?.durationMax)} mid=${String(middle)} deck=${String(deck.drawMs)}`,
      );
      expect(middle, `${String(rod?.id)} 单口吸入`).toBe(deck.drawMs);
    }
  });
});
