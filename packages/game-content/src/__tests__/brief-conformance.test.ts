/**
 * The brief's colours and gates, pinned — the handoff document's 视觉基线 for the six skins.
 *
 * These are transcriptions of an outside source, written down a second time on purpose: 24 hex
 * values, four layers per skin, plus the gates that open them. Nothing else in the suite could
 * notice one of them drifting, and a palette that drifts quietly is the 烟羽 layer changing colour
 * on its own. The eleven categories' stick ladder is deliberately not repeated here — it is
 * already computed and asserted in `tests/sessionLoop.test.ts`.
 *
 * One known difference from the source, recorded rather than hidden: the brief counts 累计支数,
 * while `ruleSatisfied` reads `progress.sessions`, which also counts a break that ended with the
 * rod unlit. In normal play the two are the same number.
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
 * S9's parameter table and S16's category cards, for the five rods that name a deck category AND
 * burn for the length the deck gives that category. The six cigarette slots are not asserted here:
 * the deck names them by flavour (薄荷 / 冰凉 / 典藏 / 丁香) while the build names them by shape, so
 * pairing a number to a rod would be my invention rather than a reading — see SPEC.md,
 * 「稿子的参数表逐只对了一遍」.
 */
const BRIEF_ROD_NUMBERS: Record<
  string,
  {
    puffs: { within?: [number, number]; contains?: number };
    temp: { within?: [number, number]; contains?: number };
  }
> = {
  // 「手卷 RYO 7.5 min 17 口 芯温 820 C」 — 17 is a point, not a window.
  ryo: { puffs: { contains: 17 }, temp: { contains: 820 } },
  cigarillo: { puffs: { within: [15, 20] }, temp: { within: [700, 800] } },
  cigar: { puffs: { within: [25, 40] }, temp: { within: [800, 900] } },
  pipe: { puffs: { within: [10, 15] }, temp: { within: [600, 750] } },
  hookah: { puffs: { within: [60, 80] }, temp: { within: [350, 450] } },
};

function inside(
  id: string,
  label: string,
  value: number,
  bound: { within?: [number, number]; contains?: number },
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
  if (bound.contains !== undefined) {
    expect(value, `${id} ${label} never reaches the deck's ${String(bound.contains)}`).toBe(
      bound.contains,
    );
  }
}

describe('the five world categories keep the deck’s own numbers (§ S9, § S16)', () => {
  it('give the 口数 the deck gives them', () => {
    for (const [id, brief] of Object.entries(BRIEF_ROD_NUMBERS)) {
      const rod = CIGARETTES.find((candidate) => candidate.id === id);
      expect(rod, `no rod named ${id}`).toBeDefined();
      // Only the target is the deck's number: 「按区间中值给参数」. min/max are this build's own
      // variability around it, and a roll that comes out one puff short of the deck's floor is not
      // a contradiction of anything the deck claims.
      if (brief.puffs.within) {
        const [lo, hi] = brief.puffs.within;
        console.log(
          `PUFFS ${id} target=${String(rod?.physical.puffs.target)} deck ${lo}-${hi} mid=${String((lo + hi) / 2)}`,
        );
      }
      inside(id, 'puffs', rod?.physical.puffs.target ?? -1, brief.puffs);
    }
  });

  it('keep their 芯温 window where the deck puts it', () => {
    for (const [id, brief] of Object.entries(BRIEF_ROD_NUMBERS)) {
      const rod = CIGARETTES.find((candidate) => candidate.id === id);
      expect(rod, `no rod named ${id}`).toBeDefined();
      const [lo, hi] = rod?.physical.centerTempC ?? [-1, -1];
      if (brief.temp.contains === undefined) {
        inside(id, 'temp low', lo, brief.temp);
        inside(id, 'temp high', hi, brief.temp);
      } else {
        expect(lo, `${id} core window starts above the deck's point`).toBeLessThanOrEqual(
          brief.temp.contains,
        );
        expect(hi, `${id} core window ends below the deck's point`).toBeGreaterThanOrEqual(
          brief.temp.contains,
        );
      }
    }
  });
});

/**
 * S8's grid writes each 时长 next to the gate that opens that slot, and the eleven gates are the
 * same eleven numbers this build uses — so a rod is paired with a duration through its **gate**, not
 * through a name. That distinction is the whole point: the deck calls its six 卷烟 薄荷 / 深焙 /
 * 冰凉 / 典藏 / 丁香 while this build calls them by shape, and which flavour is which rod is still
 * an open question. The minutes get decided without answering it.
 */
const BRIEF_MINUTES: Record<string, number> = {
  default: 10.0,
  '8': 9.0,
  '20': 7.5,
  '40': 7.5,
  '65': 14.0,
  '95': 12.0,
  '135': 18.0,
  '190': 10.0,
  '250': 50.0,
  '320': 40.0,
  '420': 50.0,
};

const gateKey = (unlock: { kind: string; count?: number }): string =>
  unlock.kind === 'default' ? 'default' : String(unlock.count ?? -1);

describe('every rod burns for the minutes the deck’s grid gives its slot (S8)', () => {
  it('occupies a slot the grid names, and leaves no slot over', () => {
    expect(CIGARETTES.map((rod) => gateKey(rod.unlock)).sort()).toEqual(
      Object.keys(BRIEF_MINUTES).sort(),
    );
  });

  it('puts the middle of its window on the deck’s own minute', () => {
    for (const rod of CIGARETTES) {
      const deck = BRIEF_MINUTES[gateKey(rod.unlock)];
      expect(deck, `${rod.id} sits in a slot the grid does not name`).toBeDefined();
      // 「游戏里按区间中值给参数」(S9) — the deck’s figure is the midpoint, and the spread around it
      // is this build's own. The tenth is what the grid itself prints (7.5, 18.0, 50.0).
      const middle = (rod.burnDuration.min + rod.burnDuration.max) / 2 / 60_000;
      console.log(
        `MINUTES ${rod.id} gate=${gateKey(rod.unlock)} mid=${middle.toFixed(1)} deck=${String(deck)}`,
      );
      expect(Number(middle.toFixed(1)), rod.id).toBe(deck);
    }
  });
});
