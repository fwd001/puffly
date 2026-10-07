/**
 * The copy table — SPEC.md §9 of the Smoke Ritual brief: three tiers, target language →
 * English → icons only.
 *
 * English is the anchor, not a translation: every key exists here, because a control with no
 * name at all is the one failure this layer must never cause. `zh-CN` is complete. `ar` is
 * deliberately partial — it is the proof that the fallback works, and the rest of it is a
 * translator's job, not something to invent here.
 */

export const EN = {
  'app.name': 'Puffly',

  'hint.pick': 'tap',
  'hint.lighter': 'light',
  'hint.puff': 'hold',
  'hint.flick': 'flick',
  'hint.extinguish': 'press',
  'hint.discard': 'drop',

  /** The rail's four names (§9.2): three phases the state machine is in, and one sheet. */
  'tab.light': 'light',
  'tab.puff': 'inhale',
  'tab.tray': 'ashtray',
  'tab.settings': 'settings',

  /**
   * The big pill's short label, one per affordance (§28's verbs are on the scene, these are the
   * handle). They stay in every tier but `icons` on purpose: §9.2 keeps a button label because it
   * is the anchor a translation hangs on — a rail of pure marks has nothing left to localise.
   */
  'cta.pick': 'pick up',
  'cta.lighter': 'light it',
  'cta.puff': 'inhale',
  'cta.savour': 'savour',
  'cta.flick': 'flick the ash',
  'cta.extinguish': 'put it out',
  'cta.discard': 'drop it in',

  'settings.sound': 'Sound',
  'settings.ambient': 'Ambient',
  'settings.smoke': 'Smoke',
  'settings.break': 'Break',
  'settings.word': 'Word',
  'settings.look': 'Look',
  'settings.vibration': 'Vibration',
  'settings.fidget': 'Fidget',
  // S6's 「混响」 row. `Tail` rather than `Room`, because the sheet already spends the word Room on
  // the four colours the room is painted with.
  'settings.tail': 'Tail',
  'settings.anchor': 'Anchor',
  'settings.data': 'Data',
  'settings.sound.enough': 'enough',
  'settings.sound.little': 'a little',
  'settings.sound.none': 'none',
  'settings.smoke.auto': 'auto',
  'settings.smoke.soft': 'soft',
  'settings.smoke.normal': 'normal',
  'settings.smoke.dense': 'dense',
  'settings.language': 'Language',
  'settings.language.auto': 'auto',
  'settings.language.icons': 'icons',

  'a11y.close': 'close',
  'a11y.export': 'export',
  'a11y.import': 'import',
  'a11y.reset': 'erase every record on this device',
  'a11y.resetArm': 'tap again to erase, this cannot be undone',
  'settings.reset': 'erase',
  'settings.resetArm': 'again',
  'a11y.ambient': 'ambient',
  'a11y.soundLevel': 'sound level',
  'a11y.hintWords': 'hint words',
  'a11y.haptics': 'haptics',
  // S6's three shape words: which beat, and what the hand feels in it.
  'settings.haptic.spark': 'light · short',
  'settings.haptic.swell': 'draw · grows',
  'settings.haptic.grit': 'ash · fine',
  'a11y.fidget': 'lighter flourishes',
  'a11y.reverbTail': 'the room behind the sounds',
  'settings.scene': 'Room',
  'a11y.sceneColours': 'your own room colours',
  'a11y.sceneLayer.skyTop': 'sky, high',
  'a11y.sceneLayer.skyBottom': 'sky, low',
  'a11y.sceneLayer.horizon': 'horizon',
  'a11y.sceneLayer.silhouette': 'everything in front',
  'a11y.motion': 'reduced motion',
  'a11y.contrast': 'high contrast',
  'a11y.textSize': 'text size',
  'a11y.breakLength': 'break length in minutes',
  'a11y.anchorDate': 'quit anchor date',
  'a11y.language': 'language',
  'a11y.audioUnavailable': 'audio unavailable',
  'a11y.memoryOnly': 'memory only',
  /** The ring and its readouts: spoken nouns, since §9.2 keeps what the eye sees to digits. */
  'a11y.hud.rail': 'the break so far',
  'a11y.hud.sticks': 'sticks today',
  'a11y.hud.clock': 'this break left',
  'a11y.hud.burned': 'burned so far',
  'a11y.hud.remaining': 'rod left',
  'a11y.hud.hold': 'held for',
  'a11y.hud.puffs': 'draws so far',
  'a11y.hud.ash': 'ash column',
  'a11y.hud.ashMass': 'ash so far',
  'a11y.hud.category': 'which rod this is',
  'a11y.archive': 'the archive for this rod',
  'a11y.pill': 'the big action: {word}',
  'a11y.smokeOption': 'smoke {word}',
  'a11y.sheetBreak': 'Break',
  'a11y.sheetShelf': 'Collection',
  'a11y.sheetSettings': 'Settings',
  'a11y.dataRail': 'the desk',
  'a11y.cravingBefore': 'how strong is the craving now',
  'a11y.cravingAfter': 'how strong is it now',
  'a11y.endBreak': 'end this break',
  'a11y.journey': 'journey',

  'a11y.trigger.coffee': 'coffee',
  'a11y.trigger.drink': 'drink',
  'a11y.trigger.work': 'work',
  'a11y.trigger.angry': 'angry',
  'a11y.trigger.night': 'night',
  'a11y.trigger.people': 'people',
  'a11y.trigger.drive': 'drive',
  'a11y.trigger.meal': 'meal',

  'state.idle': 'a cigarette rests on the table',
  'state.pickedUp': 'held, not lit',
  'state.lighting': 'lighting',
  'state.burning': 'burning',
  'state.puffing': 'drawing',
  'state.resting': 'resting between puffs',
  'state.ashReady': 'the ash is long',
  'state.nearEnd': 'nearly finished',
  'state.extinguishing': 'putting it out',
  'state.extinguished': 'out',
  'state.discarded': 'in the tray',

  /** S17's archive card. Tier 2 is what the rod measures; tier 3 is where the ≈ figures live. */
  /** S8's cabinet: the ladder, its count, and the two lines that explain how to read it. */
  'shelf.packs': 'boxes',
  'a11y.boxFound': 'collected: {brand}',
  'a11y.boxEmpty': 'not found yet',
  'shelf.skins': 'skins',
  'a11y.skin': 'skin {name}',
  'shelf.rods': 'the ladder',
  'shelf.kit': 'the rest of the table',
  /**
   * The seven rooms as a set the player can walk through. The heading is a word and so disappears
   * on the icons tier — the mark `▢` and the `n / 7` digits stay; a rung is announced in words
   * because "3" alone does not say what it counts.
   */
  'shelf.scenes': 'the rooms',
  'a11y.scene': 'room {name}',
  'a11y.rung.now': 'there from the first night',
  'a11y.rung.level': 'level {n}',
  'a11y.rung.day': 'day {n}',
  'a11y.rung.breaks': '{n} breaks',
  'a11y.rung.draws': '{n} draws',
  'a11y.rung.boxes': '{n} boxes',
  'rail.break': 'this break',
  'rail.reduction': 'reduction',
  'shelf.rods.ladder': 'total {total} sticks · next at {next}',
  'shelf.hint': 'swipe up for all {total} · hold a card for its archive',
  'shelf.kind.inhale': 'inhaled',
  'shelf.kind.savor': 'savoured',
  'shelf.kind.filter': 'filtered',
  'a11y.tile': '{name}, {zhName}',
  'a11y.tileLocked': 'not met yet',

  /**
   * S20. The whole page is the player's own log restated: it compares them to last week and
   * never to a health target, and it has no verb that reads as advice (§ redlines.noAntiSmokingPressure).
   */
  'reduction.sticks': 'sticks',
  'reduction.week': 'the last seven days',
  'reduction.deltaMore': '{count} more than the same span last week',
  'reduction.deltaFewer': '{count} fewer than the same span last week',
  'reduction.deltaSame': 'the same as the same span last week',
  'reduction.noLimit': 'no ceiling set',
  'reduction.alt.breathe': 'breathe out slowly',
  'reduction.alt.water': 'water',
  'reduction.alt.walk': 'walk it off',
  'reduction.footer': 'the ceiling is yours to move — set it where you actually stop',
  'settings.limit': 'Limit',
  'a11y.reduction.ring': '{count} of {limit} today',
  'a11y.reduction.ringNoLimit': '{count} today',
  'a11y.reduction.bar': '{day}: {count}',

  'archive.duration': 'per stick',
  'archive.puffs': 'draws',
  'archive.temp': 'cherry',
  'archive.scenes': 'when',
  'archive.range': '≈10–15 a day, published range',
  'archive.pin': 'keep open',
  'archive.tier.low': 'everyday tier',
  'archive.tier.mid': 'mainstream tier',
  'archive.tier.high': 'gift tier',
  'archive.price': 'reference',
  'archive.history': 'history',
  'archive.occasion': 'when',
  'archive.crowd': 'who',
  'archive.gender': 'mix',
  'archive.daily': 'per day',
  'archive.disclaimer': 'name and tier only: no mark, no packaging, no comparison, no advice',
  'archive.unitMin': 'min',
  'archive.unitTemp': '°C',
} as const;

export type CopyKey = keyof typeof EN;
type Table = Partial<Record<CopyKey, string>>;

const ZH: Table = {
  // The name is not transliterated in any locale, so it maps to itself rather than falling back.
  'app.name': 'Puffly',

  'hint.pick': '点',
  'hint.lighter': '点着',
  'hint.puff': '按住',
  'hint.flick': '弹',
  'hint.extinguish': '摁',
  'hint.discard': '丢',

  'tab.light': '点燃',
  'tab.puff': '吸烟',
  'tab.tray': '烟灰缸',
  'tab.settings': '设置',

  'cta.pick': '拿起',
  'cta.lighter': '点着',
  'cta.puff': '吸入',
  'cta.savour': '含住',
  'cta.flick': '磕灰',
  'cta.extinguish': '掐灭',
  'cta.discard': '丢进去',

  'settings.sound': '声音',
  'settings.ambient': '环境',
  'settings.smoke': '烟雾',
  'settings.break': '休息',
  'settings.word': '提示词',
  'settings.look': '观感',
  'settings.vibration': '震动',
  'settings.fidget': '把玩',
  'settings.tail': '混响',
  'settings.anchor': '起点',
  'settings.data': '数据',
  'settings.sound.enough': '正常',
  'settings.sound.little': '轻一点',
  'settings.sound.none': '静音',
  'settings.smoke.auto': '自动',
  'settings.smoke.soft': '稀',
  'settings.smoke.normal': '中',
  'settings.smoke.dense': '浓',
  'settings.language': '语言',
  'settings.language.auto': '自动',
  'settings.language.icons': '纯图标',

  'a11y.close': '关闭',
  'a11y.export': '导出',
  'a11y.import': '导入',
  'a11y.reset': '清掉这台设备上的全部记录',
  'a11y.resetArm': '再点一次就清空，这一步撤销不了',
  'settings.reset': '清空',
  'settings.resetArm': '再点一次',
  'a11y.ambient': '环境音',
  'a11y.soundLevel': '音量',
  'a11y.hintWords': '提示词',
  'a11y.haptics': '震动反馈',
  'settings.haptic.spark': '点火 短促',
  'settings.haptic.swell': '吸入 渐强',
  'settings.haptic.grit': '烟灰 细碎',
  'a11y.fidget': '打火机小动作',
  'a11y.reverbTail': '让声音带一点房间尾音',
  'settings.scene': '房间',
  'a11y.sceneColours': '自己定的房间颜色',
  'a11y.sceneLayer.skyTop': '天空·上',
  'a11y.sceneLayer.skyBottom': '天空·下',
  'a11y.sceneLayer.horizon': '地平线',
  'a11y.sceneLayer.silhouette': '前景剪影',
  'a11y.motion': '减少动效',
  'a11y.contrast': '高对比度',
  'a11y.textSize': '文字大小',
  'a11y.breakLength': '休息时长（分钟）',
  'a11y.anchorDate': '起点日期',
  'a11y.language': '语言',
  'a11y.audioUnavailable': '没有可用的音频',
  'a11y.memoryOnly': '只存在内存里',
  'a11y.hud.rail': '这次休息',
  'a11y.hud.sticks': '今天第几支',
  'a11y.hud.clock': '这次休息还剩',
  'a11y.hud.burned': '已经燃了',
  'a11y.hud.remaining': '还剩多少烟',
  'a11y.hud.hold': '已经按住',
  'a11y.hud.puffs': '已经吸了几口',
  'a11y.hud.ash': '灰柱长度',
  'a11y.hud.ashMass': '已经生成的灰',
  'a11y.hud.category': '这是哪一根',
  'a11y.archive': '这根烟的档案',
  'a11y.pill': '主操作：{word}',
  'a11y.smokeOption': '烟雾 {word}',
  'a11y.sheetBreak': '这次休息',
  'a11y.sheetShelf': '烟架',
  'a11y.sheetSettings': '设置',
  'a11y.dataRail': '工作台',
  'a11y.cravingBefore': '现在有多想抽',
  'a11y.cravingAfter': '现在还剩多少',
  'a11y.endBreak': '结束这次休息',
  'a11y.journey': '这段日子',

  'a11y.trigger.coffee': '咖啡',
  'a11y.trigger.drink': '喝酒',
  'a11y.trigger.work': '工作',
  'a11y.trigger.angry': '烦躁',
  'a11y.trigger.night': '深夜',
  'a11y.trigger.people': '有人',
  'a11y.trigger.drive': '开车',
  'a11y.trigger.meal': '饭后',

  'state.idle': '烟躺在桌上',
  'state.pickedUp': '拿在手里，还没点',
  'state.lighting': '正在点',
  'state.burning': '在烧',
  'state.puffing': '正在吸',
  'state.resting': '歇着，等下一抽',
  'state.ashReady': '灰已经很长',
  'state.nearEnd': '快烧到头了',
  'state.extinguishing': '正在掐灭',
  'state.extinguished': '已经灭了',
  'state.discarded': '在烟灰缸里',

  'shelf.packs': '烟盒',
  'a11y.boxFound': '已收到 · {brand}',
  'a11y.boxEmpty': '还没捡到',
  'shelf.skins': '皮肤',
  'a11y.skin': '皮肤 {name}',
  'shelf.rods': '烟种',
  'shelf.kit': '桌上其余',
  'shelf.scenes': '场景',
  'a11y.scene': '场景 {name}',
  'a11y.rung.now': '一开始就在',
  'a11y.rung.level': '第 {n} 级',
  'a11y.rung.day': '第 {n} 天',
  'a11y.rung.breaks': '{n} 次休息',
  'a11y.rung.draws': '{n} 口',
  'a11y.rung.boxes': '{n} 个烟盒',
  'rail.break': '休息',
  'rail.reduction': '减量',
  'shelf.rods.ladder': '累计 {total} 支 · 下一档 {next} 支',
  'shelf.hint': '下滑查看全部 {total} 款 · 长按卡片查档案',
  'shelf.kind.inhale': '吸入型',
  'shelf.kind.savor': '品鉴型',
  'shelf.kind.filter': '过滤型',
  'a11y.tile': '{name} · {zhName}',
  'a11y.tileLocked': '还没抽到',

  'reduction.sticks': '支',
  'reduction.week': '近 7 天',
  'reduction.deltaMore': '较上周同期 多吸 {count} 支',
  'reduction.deltaFewer': '较上周同期 少吸 {count} 支',
  'reduction.deltaSame': '与上周同期一样',
  'reduction.noLimit': '未设上限',
  'reduction.alt.breathe': '深呼气',
  'reduction.alt.water': '喝水',
  'reduction.alt.walk': '走两步',
  'reduction.footer': '上限可自己调，调到想抽就停',
  'settings.limit': '上限',
  'a11y.reduction.ring': '今天 {count} / {limit}',
  'a11y.reduction.ringNoLimit': '今天 {count}',
  'a11y.reduction.bar': '{day}：{count}',

  'archive.duration': '单支时长',
  'archive.puffs': '口数',
  'archive.temp': '中心温度',
  'archive.scenes': '场合',
  'archive.range': '≈10–15 支/日 · 公开调查口径',
  'archive.pin': '钉住',
  'archive.tier.low': '低档 · 走量',
  'archive.tier.mid': '中档 · 主流',
  'archive.tier.high': '高档 · 礼赠',
  'archive.price': '参考零售价',
  'archive.history': '历史渊源',
  'archive.occasion': '典型场合',
  'archive.crowd': '典型人群',
  'archive.gender': '男女构成',
  'archive.daily': '日均消耗',
  'archive.disclaimer': '只写品牌名与品类定位：不画商标、不还原包装、不做价格对比与推荐',
  'archive.unitMin': '分钟',
  'archive.unitTemp': '°C',
};

/**
 * Partial on purpose. Everything missing here falls through to English, and the browser checks
 * assert that the fall-through is what a player sees — not a blank label.
 */
const AR: Table = {
  'tab.settings': 'الإعدادات',
  'a11y.close': 'إغلاق',
  'settings.sound': 'الصوت',
  'settings.smoke': 'الدخان',
};

export const COPY: Record<string, Table> = { en: EN, 'zh-CN': ZH, ar: AR };

/** The languages a player can pick, plus the third tier as a choice of its own. */
export const LOCALES = ['en', 'zh-CN', 'ar', 'icons'] as const;
export type LocaleCode = (typeof LOCALES)[number];

/** Written right-to-left: the layout mirrors, the burn never does. */
const RTL = new Set(['ar', 'he', 'fa', 'ur']);

export function isRtl(locale: string): boolean {
  return RTL.has(locale);
}

/**
 * §28: the one word the scene is allowed to say, per affordance. The affordance is the engine's
 * own name for "what this finger should do next", so the mapping belongs beside the words rather
 * than in the component that happens to draw them.
 */
export const HINT_KEYS: Record<string, CopyKey> = {
  pick: 'hint.pick',
  lighter: 'hint.lighter',
  puff: 'hint.puff',
  flick: 'hint.flick',
  extinguish: 'hint.extinguish',
  discard: 'hint.discard',
};

/** The same six affordances, in the words the pill wears (§9.2 keeps a label to translate). */
export const CTA_KEYS: Record<string, CopyKey> = {
  pick: 'cta.pick',
  lighter: 'cta.lighter',
  puff: 'cta.puff',
  flick: 'cta.flick',
  extinguish: 'cta.extinguish',
  discard: 'cta.discard',
};

/**
 * The verb the handle actually wears. A draw that stays in the mouth is not an inhalation, and the
 * rod says so with its own measurement (`readouts.savourMs`) rather than with a category the
 * shell would have to keep in step (Smoke Ritual 品鉴型: 含住 2 秒再缓缓吐出, 不入肺).
 */
export function ctaKeyFor(affordance: string, savourMs: number): CopyKey | undefined {
  if (affordance === 'puff' && savourMs > 0) return 'cta.savour';
  return CTA_KEYS[affordance];
}

/** §4: what a screen reader hears, keyed off `GameState.cigarette.state`. */ export const STATE_KEYS: Record<
  string,
  CopyKey
> = {
  IDLE: 'state.idle',
  PICKED_UP: 'state.pickedUp',
  LIGHTING: 'state.lighting',
  BURNING: 'state.burning',
  PUFFING: 'state.puffing',
  RESTING: 'state.resting',
  ASH_READY: 'state.ashReady',
  NEAR_END: 'state.nearEnd',
  EXTINGUISHING: 'state.extinguishing',
  EXTINGUISHED: 'state.extinguished',
  DISCARDED: 'state.discarded',
};

export interface LanguageChoice {
  /** What goes into `Settings.language`; `auto` means the player has not said. */
  readonly code: LocaleCode | 'auto';
  /**
   * The name a language calls itself. Deliberately outside the copy table: naming 中文 "Chinese"
   * is the mistake this row exists to avoid, and a player who cannot read the current script has
   * no way to recognise a translated name.
   */
  readonly endonym: string;
  readonly glyph: string;
  /** Set when the chip's word is a translation rather than a self-name. */
  readonly copyKey?: CopyKey;
}

/** The row's order is the fallback order: undecided, then the two complete tables, then none. */
export const LANGUAGES: readonly LanguageChoice[] = [
  { code: 'auto', endonym: 'auto', glyph: '◌', copyKey: 'settings.language.auto' },
  { code: 'en', endonym: 'English', glyph: 'A' },
  { code: 'zh-CN', endonym: '中文', glyph: '中' },
  { code: 'ar', endonym: 'العربية', glyph: 'ع' },
  { code: 'icons', endonym: 'icons', glyph: '∅', copyKey: 'settings.language.icons' },
];
