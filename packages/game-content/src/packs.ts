/**
 * The twelve boxes — S16 and S19 of the brief.
 *
 * This is the only place a real tobacco brand appears, and it appears as a line in an archive:
 * a name, the tier it sits in, and a price range carrying its ≈. No mark, no packaging, no
 * comparison table, no ranking, no recommendation, no health talk — the brief lists those as
 * forbidden, and a test reads this file against that list rather than trusting the intention.
 *
 * The ten names and their tiers are the brief's own table, unchanged. Two mid slots stay empty
 * because the brief says `emptySlots: 2` and names only three mid brands; inventing a fourth to
 * even the row up is the fabrication §10 rules out. Three of the ten are held back from the
 * random pool as the finale the last skin is gated on — which three is the one number in this
 * file that is a decision rather than a quotation, so it is named here and asked about below.
 */

import type { PackContent } from '@puffly/game-core';

export const PACKS: PackContent[] = [
  { id: 'baisha-soft', tier: 'low', brand: '白沙软', priceCny: '≈5–7', reserved: false },
  { id: 'hongtashan-soft', tier: 'low', brand: '红塔山软', priceCny: '≈6–8', reserved: false },
  { id: 'liqun-new', tier: 'low', brand: '利群新版', priceCny: '≈7–9', reserved: false },

  { id: 'nanjing-xuanhemen', tier: 'mid', brand: '南京炫赫门', priceCny: '≈16', reserved: false },
  {
    id: 'huanghelou-soft-blue',
    tier: 'mid',
    brand: '黄鹤楼软蓝',
    priceCny: '≈19',
    reserved: false,
  },
  { id: 'yuxi-soft', tier: 'mid', brand: '玉溪软', priceCny: '≈23', reserved: false },
  // The two slots the brief leaves open: they read as gaps, not as something to guess at.
  { id: 'mid-empty-a', tier: 'mid', brand: '', priceCny: '', reserved: false },
  { id: 'mid-empty-b', tier: 'mid', brand: '', priceCny: '', reserved: false },

  { id: 'furongwang-hard', tier: 'high', brand: '芙蓉王硬', priceCny: '≈25–30', reserved: false },
  { id: 'zhonghua-hard', tier: 'high', brand: '中华硬', priceCny: '≈45–50', reserved: true },
  {
    id: 'huanghelou-1916',
    tier: 'high',
    brand: '黄鹤楼 1916',
    priceCny: '≈90–100',
    reserved: true,
  },
  { id: 'hetianxia', tier: 'high', brand: '和天下', priceCny: '≈100', reserved: true },
];

/** The three tiers and how many slots each owns (§ packs.tiers). */
export const PACK_TIER_SLOTS = { low: 3, mid: 5, high: 4 } as const;
