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
  {
    id: 'baisha-soft',
    tier: 'low',
    brand: '白沙软',
    reserved: false,
    archive: {
      priceCny: '≈5–7',
      history: '湖南老牌长线，县域与街边摊的存量最大',
      occasion: '工地、长途车、夜市摊、熟人递烟',
      crowd: '务工、货运、制造业一线',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'hongtashan-soft',
    tier: 'low',
    brand: '红塔山软',
    reserved: false,
    archive: {
      priceCny: '≈6–8',
      history: '云南系经典款，出厂到零售都很稳',
      occasion: '工厂车间、老家堂屋、棋牌室',
      crowd: '产业工人、个体运输、乡镇事务',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'liqun-new',
    tier: 'low',
    brand: '利群新版',
    reserved: false,
    archive: {
      priceCny: '≈7–9',
      history: '浙江系走量款，细支与新版并行',
      occasion: '通勤路上、工地的工间、服务场所后场',
      crowd: '操作岗、服务岗、刚入职的年轻男性',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'nanjing-xuanhemen',
    tier: 'mid',
    brand: '南京炫赫门',
    reserved: false,
    archive: {
      priceCny: '≈16',
      history: '细支线，零售终端可见度最高',
      occasion: '下班后、便利店随手买、朋友小聚',
      crowd: '都市白领',
      gender: '以男性为主，细支在年轻女性里出现率高于粗支',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'huanghelou-soft-blue',
    tier: 'mid',
    brand: '黄鹤楼软蓝',
    reserved: false,
    archive: {
      priceCny: '≈19',
      history: '名字取自武汉地标，硬蓝与 1916 是两条产品线',
      occasion: '本地请客、长途驾乘、亲戚往来',
      crowd: '个体经营、长途运力、县域中青年',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'yuxi-soft',
    tier: 'mid',
    brand: '玉溪软',
    reserved: false,
    archive: {
      priceCny: '≈23',
      history: '云南烟区原料为主',
      occasion: '年节走亲、单位发烟、商务便餐',
      crowd: '中层管理、采购、驻场工程',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    // A slot the brief leaves unnamed: it reads as a gap, not as something to guess at.
    id: 'mid-empty-a',
    tier: 'mid',
    brand: '',
    reserved: false,
  },
  {
    // A slot the brief leaves unnamed: it reads as a gap, not as something to guess at.
    id: 'mid-empty-b',
    tier: 'mid',
    brand: '',
    reserved: false,
  },
  {
    id: 'furongwang-hard',
    tier: 'high',
    brand: '芙蓉王硬',
    reserved: false,
    archive: {
      priceCny: '≈25–30',
      history: '跨中高两档的硬通货',
      occasion: '办事递烟、乡镇礼尚、婚宴散桌',
      crowd: '基层业务、包工头、中层管理',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'zhonghua-hard',
    tier: 'high',
    brand: '中华硬',
    reserved: true,
    archive: {
      priceCny: '≈45–50',
      history: '1950 年代上海卷烟厂的代表款，长期是接待与礼赠的默认选项',
      occasion: '重要来访、婚宴主桌、年节礼盒',
      crowd: '商务、私企主',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'huanghelou-1916',
    tier: 'high',
    brand: '黄鹤楼 1916',
    reserved: true,
    archive: {
      priceCny: '≈90–100',
      history: '高端线，包装与工艺都往礼品走',
      occasion: '正式宴请、礼赠',
      crowd: '中年商务',
      gender: '以男性为主',
      daily: '≈10-15 支',
    },
  },
  {
    id: 'hetianxia',
    tier: 'high',
    brand: '和天下',
    reserved: true,
    archive: {
      priceCny: '≈100',
      daily: '≈10-15 支',
    },
  },
];

/**
 * How many boxes can be found at all: the slots somebody named. Two mid slots are gaps the brief
 * left open on purpose, so "collect them all" means these, not twelve — and the last skin is gated
 * on this number rather than on the slot count, because a prize behind an unfinished collection is
 * a prize nobody wins.
 */
export const FINDABLE_PACKS = PACKS.filter((pack) => pack.brand !== '').length;

/** The three tiers and how many slots each owns (§ packs.tiers). */
export const PACK_TIER_SLOTS = { low: 3, mid: 5, high: 4 } as const;
