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
