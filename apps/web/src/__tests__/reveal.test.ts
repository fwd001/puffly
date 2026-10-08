/**
 * The one-look cache behind §39's 「它自己亮一下」 for numbers: which rungs lit since the player last
 * looked, and nothing more.
 *
 * The failure this exists to prevent is the loud one and the quiet one in both directions: a ladder
 * that flashes its whole history every time the sheet opens (opening is not an achievement), and a
 * rung that lit five minutes ago flashing again now (nothing was kept, so nothing is news). Both are
 * answers to *when the baseline is taken*, which is exactly what these four cases pin.
 */

import { nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useJustLit } from '../reveal';

/** A rig the way the sheet uses it: a list of lit ids, whether it is open, and the cache. */
function rig(initial: string[] = [], open = false) {
  const lit = ref<string[]>([...initial]);
  const isOpen = ref(open);
  const fresh = useJustLit(
    () => lit.value,
    () => isOpen.value,
  );
  return {
    fresh,
    /** The ledger moving: rungs reaching their goal. */
    light(...ids: string[]): void {
      lit.value = [...lit.value, ...ids];
    },
    /** The ledger moving back: a rung whose number went down again (换缸 / 新的一天). */
    unlight(id: string): void {
      lit.value = lit.value.filter((entry) => entry !== id);
    },
    setOpen(open: boolean): void {
      isOpen.value = open;
    },
    settle: nextTick,
  };
}

const litIds = (set: Set<string>): string[] => [...set].sort();

describe('the reveal cache (拍板 ⑤ 的收尾)', () => {
  it('does not treat arriving as an achievement', async () => {
    const sheet = rig(['ash.1', 'puffs.1'], true);
    await sheet.settle();
    sheet.light('sticks.1');
    await sheet.settle();
    // The two rungs were already lit when the sheet mounted; only the third is news.
    expect(litIds(sheet.fresh.value)).toEqual(['sticks.1']);
  });

  it('reports a rung that lights while the sheet is open, and only that one', async () => {
    const sheet = rig([], false);
    sheet.setOpen(true);
    await sheet.settle();
    expect(sheet.fresh.value.size, 'opening marks nothing').toBe(0);
    sheet.light('time.1');
    await sheet.settle();
    expect(litIds(sheet.fresh.value)).toEqual(['time.1']);
    // The same reading arriving again is not a second moment — the ledger ticks far more often than
    // a rung crosses a goal.
    sheet.light();
    await sheet.settle();
    expect(litIds(sheet.fresh.value)).toEqual(['time.1']);
  });

  it('keeps a rung that lit while nobody was looking out of the reveal', async () => {
    const sheet = rig([], true);
    await sheet.settle();
    sheet.setOpen(false);
    await sheet.settle();
    sheet.light('gust');
    await sheet.settle();
    sheet.setOpen(true);
    await sheet.settle();
    // It lit, and it is reached — but the moment passed with the sheet closed, so the next open shows
    // a plain row rather than a fade.
    expect(sheet.fresh.value.size, 'a fade from a closed sheet is not news').toBe(0);
  });

  it('gives a rung back its moment when it lights a second time', async () => {
    const sheet = rig(['ash.1'], true);
    await sheet.settle();
    sheet.unlight('ash.1');
    await sheet.settle();
    expect(sheet.fresh.value.size, 'losing one is not a reveal').toBe(0);
    sheet.light('ash.1');
    await sheet.settle();
    // 换烟灰缸 takes the grams back and the next stick reaches the goal again: that is a second moment,
    // and the cache holds no history that would say otherwise.
    expect(litIds(sheet.fresh.value)).toEqual(['ash.1']);
  });
});
